import type { AgentConfig, AgentRuntime, Message, ToolCall, ToolContext, ToolDefinition } from './types';
import type { AgentInterface } from './agentInterface';
import { llmComplete } from './llm';
import { list as listRegisteredTools, run as runTool } from './tools';

export interface RunCallbacks {
    onText?: (text: string) => void;
    onToolCall?: (tc: ToolCall) => void;
    onConfirm?: (toolName: string, args: Record<string, any>) => Promise<boolean>;
}

export class Agent implements AgentInterface {
    readonly id: string;
    readonly name: string;
    readonly config: AgentConfig;
    readonly runtime: AgentRuntime;
    history: Message[] = [];

    constructor(config: AgentConfig, runtime: AgentRuntime) {
        this.id = config.id;
        this.name = config.name;
        this.config = config;
        this.runtime = runtime;
    }

    private availableTools(): ToolDefinition[] {
        const allowed = new Set(this.config.tools);
        const out = listRegisteredTools().filter((t) => allowed.has(t.name));

        const others = this.runtime.listAgents().filter((a) => a.config.id !== this.config.id);
        if (others.length) {
            out.push({
                name: 'delegate',
                description:
                    'Delegate a subtask to another existing agent and wait for its reply. ' +
                    'Available agents: ' +
                    others.map((a) => `${a.config.id} (${a.config.name}, model=${a.config.model})`).join('; '),
                parameters: {
                    type: 'object',
                    properties: {
                        agentId: { type: 'string', description: 'The id of the agent to delegate to' },
                        input: { type: 'string', description: 'The request to send to the other agent' },
                    },
                    required: ['agentId', 'input'],
                },
                handler: async (args: Record<string, any>, ctx: ToolContext) => {
                    return await ctx.runtime.callAgent(args.agentId, args.input, { parentId: ctx.agentId });
                },
            });
        }

        if (this.config.tools.includes('spawn')) {
            out.push({
                name: 'spawn',
                description:
                    'Spawn a new agent with its own model, system prompt, and tools to handle a subtask independently. ' +
                    'The child agent runs in parallel with this agent and reports back its final result via a job.',
                parameters: {
                    type: 'object',
                    properties: {
                        agentId: { type: 'string', description: 'Unique id for the new agent' },
                        model: { type: 'string', description: 'Model for the new agent (e.g. nemotron, gpt-4o, claude-3-sonnet)' },
                        system: { type: 'string', description: 'System prompt for the new agent' },
                        tools: { type: 'string', description: 'Comma-separated tool names for the new agent (e.g. shell,delegate,spawn)' },
                        input: { type: 'string', description: 'The task to give the new agent' },
                    },
                    required: ['agentId', 'model', 'input'],
                } as ToolDefinition['parameters'],
                handler: async (args: Record<string, any>, ctx: ToolContext) => {
                    const tools = args.tools
                        ? args.tools.split(',').map((t: string) => t.trim()).filter(Boolean)
                        : ['shell'];
                    const { jobId, agentId } = await ctx.runtime.spawnAgent({
                        id: args.agentId,
                        name: args.agentId,
                        model: args.model,
                        baseURL: this.config.baseURL ?? undefined,
                        apiKey: this.config.apiKey ?? undefined,
                        system: args.system,
                        tools,
                        parentId: this.config.id,
                        spawnDepth: this.config.spawnDepth ?? 0,
                        maxIterations: this.config.maxIterations,
                        maxHistoryMessages: this.config.maxHistoryMessages,
                        enableCompaction: this.config.enableCompaction,
                    }, args.input);
                    return `Spawned agent ${agentId} (job ${jobId}) running in background.`;
                },
            });
        }

        return out;
    }

    private async confirmTool(toolName: string, args: Record<string, any>, onConfirm?: RunCallbacks['onConfirm']): Promise<boolean> {
        // Yolo mode: accept all commands by default, no confirmation needed
        if (this.runtime.isYoloMode()) {
            return true;
        }
        if (onConfirm) {
            return await onConfirm(toolName, args);
        }
        // Default: allow when no confirmation callback is wired.
        return true;
    }

    /**
     * Compaction (Claude-style): when history exceeds maxHistoryMessages,
     * summarize older messages into a single summary message kept right after
     * the system prompt, preserving recent context intact.
     */
    compactHistory(): void {
        const max = this.config.maxHistoryMessages ?? 20;
        const enabled = this.config.enableCompaction ?? true;
        if (!enabled || this.history.length <= max) return;

        const systemMsgs = this.history.filter(m => m.role === 'system');
        const nonSystem = this.history.filter(m => m.role !== 'system');

        // Don't cut mid-tool-call: if last message is an assistant tool call without
        // a matching tool result, keep one extra exchange.
        let keepFromEnd = max;
        const last = nonSystem[nonSystem.length - 1];
        if (last && last.role === 'assistant' && last.tool_calls?.length) {
            keepFromEnd += 1;
        }

        const toCompact = nonSystem.slice(0, nonSystem.length - keepFromEnd);
        const kept = nonSystem.slice(-keepFromEnd);

        if (toCompact.length === 0) return;

        // Heuristic summary (no extra LLM call): extract key facts
        const summaryParts: string[] = [];
        let toolCount = 0;
        let shellCommands: string[] = [];

        for (const m of toCompact) {
            if (m.role === 'user') {
                summaryParts.push(`User asked: ${(m.content ?? '').slice(0, 120)}`);
            } else if (m.role === 'assistant') {
                if (m.tool_calls?.length) {
                    toolCount += m.tool_calls.length;
                }
                if (m.content) {
                    summaryParts.push(`Assistant said: ${m.content.slice(0, 120)}`);
                }
            } else if (m.role === 'tool') {
                toolCount++;
                try {
                    const parsed = JSON.parse(m.content ?? '{}');
                    if (parsed.stdout) {
                        shellCommands.push(parsed.stdout.slice(0, 100));
                    }
                } catch {
                    // not JSON, skip
                }
            }
        }

        const summaryText = [
            `=== COMPACTED HISTORY (${toCompact.length} messages) ===`,
            summaryParts.slice(0, 8).join('; '),
            `Tool calls made: ${toolCount}`,
            shellCommands.length ? `Notable shell output: ${shellCommands.slice(0, 3).join(' | ')}` : '',
            `=== END COMPACTED HISTORY ===`,
        ].filter(Boolean).join('\n');

        const summaryMsg: Message = {
            role: 'system',
            content: summaryText,
        };

        this.history = [...systemMsgs, summaryMsg, ...kept];
    }

    async run(
        input: string,
        callbacks: RunCallbacks = {},
    ): Promise<{ text: string; toolCalls: ToolCall[] }> {
        const { onText, onToolCall, onConfirm } = callbacks;
        this.history.push({ role: 'user', content: input });

        // Compact history before each LLM call to keep context bounded
        this.compactHistory();

        let finalText = '';
        const allToolCalls: ToolCall[] = [];

        // Default: Infinity (unlimited). Can be capped via AgentConfig.maxIterations.
        const maxIterations = this.config.maxIterations ?? Infinity;

        for (let i = 0; i < maxIterations; i++) {
            const tools = this.availableTools();
            const result = await llmComplete({
                baseURL: this.config.baseURL ?? 'https://integrate.api.nvidia.com/v1',
                apiKey: this.config.apiKey ?? '',
                model: this.config.model,
                system: this.config.system,
                messages: this.history,
                tools: tools.length ? tools : undefined,
                stream: (t) => {
                    finalText += t;
                    onText?.(t);
                },
            });

            const assistantMsg: Message = {
                role: 'assistant',
                content: result.text || null,
                ...(result.toolCalls.length ? { tool_calls: result.toolCalls } : {}),
            };
            this.history.push(assistantMsg);

            if (!result.toolCalls.length) {
                finalText = result.text;
                break;
            }

            for (const tc of result.toolCalls) {
                allToolCalls.push(tc);
                onToolCall?.(tc);

                let args: Record<string, any> = {};
                try {
                    args = JSON.parse(tc.function.arguments ?? '{}');
                } catch {
                    args = { _raw: tc.function.arguments };
                }

                // Check yolo mode / confirmation before executing the tool
                const confirmed = await this.confirmTool(tc.function.name, args, onConfirm);
                if (!confirmed) {
                    const deniedMsg = `Tool call denied: ${tc.function.name}`;
                    this.history.push({
                        role: 'tool',
                        content: deniedMsg,
                        tool_call_id: tc.id,
                    });
                    continue;
                }

                const toolResult = await runTool(tc.function.name, args, {
                    agentId: this.config.id,
                    agentName: this.config.name,
                    runtime: this.runtime,
                });

                this.history.push({
                    role: 'tool',
                    content: toolResult,
                    tool_call_id: tc.id,
                });
            }

            // Compact again after tool calls to keep history bounded mid-loop
            this.compactHistory();
        }

        return { text: finalText, toolCalls: allToolCalls };
    }
}
