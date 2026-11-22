import { AgentRuntimeImpl } from './runtime';
import { C, color, input, write, writeLine, parseCommand, confirm } from './cli';
import { httpClient } from './http';
import type { ToolCall } from './types';

const DEFAULT_MODEL =
    process.env.DEFAULT_MODEL ?? 'nvidia/nemotron-3.5-super-vl-120b-a12b';
const DEFAULT_BASE = process.env.OPENAI_BASE_URL ?? 'https://integrate.api.nvidia.com/v1';

const runtime = new AgentRuntimeImpl();

// ---- bootstrap default agent from env ----
const defaultAgent = runtime.createAgent({
    id: 'default',
    name: 'default',
    model: DEFAULT_MODEL,
    baseURL: DEFAULT_BASE,
    apiKey: process.env.OPENAI_API_KEY,
    system: process.env.DEFAULT_SYSTEM,
    tools: ['shell', 'delegate', 'spawn'],
    maxIterations: Infinity,
    maxHistoryMessages: parseInt(process.env.CLANKA_MAX_HISTORY ?? '20', 10),
    enableCompaction: false, // TEMP: disabled until role issue resolved
});

// ---- bootstrap default session ----
const session = runtime.createSession(defaultAgent.config.id, 'Main');

function short(id: string, len = 6): string {
    return id.slice(0, len);
}

function promptLine(): string {
    const s = runtime.currentSession();
    const a = s ? runtime.getAgent(s.agentId) : null;
    const agentName = a ? a.config.name : '?';
    const model = a ? a.config.model.split('/').pop() ?? a.config.model : '?';
    const yolo = runtime.isYoloMode() ? color(C.yellow, ' [YOLO]') : '';
    return `${color(C.cyan, `[sess=${short(s?.id ?? '?')} agent=${agentName} model=${model}]`)} ${color(C.bold, '> ')}${yolo}`;
}

async function printHelp() {
    await writeLine(`${C.bold}clanka commands:${C.reset}`);
    await writeLine(`  ${color(C.green, '/chat new [title]')}   create a new chat session`);
    await writeLine(`  ${color(C.green, '/chat list')}          list sessions`);
    await writeLine(`  ${color(C.green, '/chat use <id>')}        switch session`);
    await writeLine(`  ${color(C.green, '/chat del <id>')}        delete session`);
    await writeLine(`  ${color(C.green, '/chat show')}            show current session history`);
    await writeLine(`  ${color(C.green, '/agent new <id> <model> [baseURL] [apiKey] [maxIterations] [maxHistory] [compact]')}  create an agent`);
    await writeLine(`  ${color(C.green, '/agent list')}           list agents`);
    await writeLine(`  ${color(C.green, '/agent show <id>')}        show full agent config`);
    await writeLine(`  ${color(C.green, '/agent use <id>')}         set current session's agent`);
    await writeLine(`  ${color(C.green, '/agent model <id> <m>')}   change agent model`);
    await writeLine(`  ${color(C.green, '/agent key <id> <k>')}     change agent API key`);
    await writeLine(`  ${color(C.green, '/agent base <id> <url>')}  change agent base URL`);
    await writeLine(`  ${color(C.green, '/agent system <id> <text>')} set agent system prompt`);
    await writeLine(`  ${color(C.green, '/agent tools <id> <list>')}  set agent tools (comma-separated)`);
    await writeLine(`  ${color(C.green, '/agent compact [<id>')}    compact history now (current agent if no id)`);
    await writeLine(`  ${color(C.green, '/yolo on')}              enable yolo mode (skip confirmations)`);
    await writeLine(`  ${color(C.green, '/yolo off')}             disable yolo mode (require confirmations)`);
    await writeLine(`  ${color(C.green, '/exit')}                     quit`);
    await writeLine(`  Anything else is sent to the current agent.`);
    await writeLine();
}

function requireArg(args: string[], idx: number): string | null {
    const v = args[idx];
    if (v === undefined) return null;
    return v;
}

async function handleCommand(cmd: string, args: string[]): Promise<boolean> {
    // returns false when we should exit
    if (cmd === 'help' || cmd === 'h') {
        await printHelp();
        return true;
    }

    if (cmd === 'exit' || cmd === 'quit' || cmd === 'q') {
        await writeLine('bye.');
        return false;
    }

    /* ---- yolo ---- */
    if (cmd === 'yolo') {
        const sub = args[0];
        if (sub === 'on') {
            runtime.setYoloMode(true);
            await writeLine(`${color(C.yellow, 'Yolo mode ENABLED')} — all commands accepted by default.`);
        } else if (sub === 'off') {
            runtime.setYoloMode(false);
            await writeLine('Yolo mode DISABLED — confirmations required.');
        } else {
            await writeLine(`Yolo mode is ${runtime.isYoloMode() ? color(C.yellow, 'ON') : 'off'}. usage: /yolo on|off`);
        }
        return true;
    }

    /* ---- chat ---- */
    if (cmd === 'chat') {
        const sub = args[0];
        if (sub === 'new') {
            const title = args.slice(1).join(' ') || `Chat ${runtime.listSessions().length + 1}`;
            const s = runtime.createSession(defaultAgent.config.id, title);
            runtime.switchSession(s.id);
            await writeLine(`Created ${color(C.green, s.id)} and switched to it.`);
        } else if (sub === 'list') {
            const cur = runtime.currentSession()?.id;
            for (const s of runtime.listSessions()) {
                const mark = s.id === cur ? color(C.bold, ' <') : '';
                await writeLine(`  ${short(s.id)} ${s.title} agent=${runtime.getAgent(s.agentId)?.config.name ?? '?'}${mark}`);
            }
        } else if (sub === 'use') {
            const id = requireArg(args, 1);
            if (!id) { await writeLine('usage: /chat use <id>'); return true; }
            const s = runtime.switchSession(id);
            if (!s) { await writeLine(`session not found: ${id}`); return true; }
            await writeLine(`Switched to ${color(C.green, s.id)} (${s.title}).`);
        } else if (sub === 'del') {
            const id = requireArg(args, 1);
            if (!id) { await writeLine('usage: /chat del <id>'); return true; }
            const ok = runtime.removeSession(id);
            await writeLine(ok ? `Deleted ${id}.` : `session not found: ${id}`);
            if (!runtime.currentSession()) {
                const s = runtime.createSession(defaultAgent.config.id, 'Main');
                runtime.switchSession(s.id);
                await writeLine(`Created fresh session ${short(s.id)}.`);
            }
        } else if (sub === 'show') {
            const s = runtime.currentSession();
            if (!s) { await writeLine('no session.'); return true; }
            await writeLine(`--- ${s.title} (${short(s.id)}) ---`);
            for (const m of s.messages) {
                const pre = m.role === 'user' ? color(C.blue, 'user') :
                    m.role === 'assistant' ? color(C.green, 'assistant') :
                    m.role === 'tool' ? color(C.yellow, 'tool') : color(C.gray, m.role);
                await writeLine(`${pre}: ${m.content ?? ''}`);
            }
            await writeLine(`---`);
        } else {
            await writeLine('unknown /chat subcommand. try /chat list');
        }
        return true;
    }

    /* ---- agent ---- */
    if (cmd === 'agent') {
        const sub = args[0];
        if (sub === 'new') {
            const id = requireArg(args, 1);
            const model = requireArg(args, 2);
            if (!id || !model) { await writeLine('usage: /agent new <id> <model> [baseURL] [apiKey] [maxIterations] [maxHistory] [compact]'); return true; }
            const baseURL = args[3] || DEFAULT_BASE;
            const apiKey = args[4] || process.env.OPENAI_API_KEY;
            const maxIterations = args[5] ? parseInt(args[5], 10) : Infinity;
            const maxHistory = args[6] ? parseInt(args[6], 10) : 20;
            const compact = args[7] !== 'false';
            const agent = runtime.createAgent({ id, name: id, model, baseURL, apiKey, tools: ['shell', 'delegate', 'spawn'], maxIterations, maxHistoryMessages: maxHistory, enableCompaction: compact });
            await writeLine(`Agent ${color(C.green, id)} created (model=${model}, maxIter=${maxIterations === Infinity ? '∞' : maxIterations}, maxHist=${maxHistory}, compact=${compact}).`);
        } else if (sub === 'list') {
            for (const a of runtime.listAgents()) {
                const lineage = runtime.getAgentLineage(a.config.id);
                const parent = lineage ? ` parent=${short(lineage)}` : '';
                await writeLine(`  ${short(a.config.id)} ${a.config.name} model=${a.config.model} tools=${a.config.tools.join(',')} maxIter=${a.config.maxIterations === Infinity ? '∞' : a.config.maxIterations} maxHist=${a.config.maxHistoryMessages ?? 20} compact=${a.config.enableCompaction ?? true}${parent}`);
            }
        } else if (sub === 'show') {
            const id = requireArg(args, 1);
            if (!id) { await writeLine('usage: /agent show <id>'); return true; }
            const agent = runtime.getAgent(id);
            if (!agent) { await writeLine(`agent not found: ${id}`); return true; }
            const c = agent.config;
            const lineage = runtime.getAgentLineage(id);
            await writeLine(`--- Agent ${id} ---`);
            await writeLine(`  name:           ${c.name}`);
            await writeLine(`  model:          ${c.model}`);
            await writeLine(`  baseURL:        ${c.baseURL ?? '(default)'}`);
            await writeLine(`  apiKey:         ${c.apiKey ? c.apiKey.slice(0, 8) + '...' : '(none)'}`);
            await writeLine(`  system:         ${c.system ?? '(none)'}`);
            await writeLine(`  tools:          ${c.tools.join(',') || '(none)'}`);
            await writeLine(`  maxIter:        ${c.maxIterations === Infinity ? '∞' : c.maxIterations}`);
            await writeLine(`  maxHistory:     ${c.maxHistoryMessages ?? 20}`);
            await writeLine(`  compaction:     ${c.enableCompaction ?? true}`);
            await writeLine(`  spawnDepth:     ${c.spawnDepth ?? 0}`);
            await writeLine(`  parent:         ${lineage ?? '(root)'}`);
            await writeLine(`  history msgs:   ${agent.history.length}`);
            await writeLine(`---`);
        } else if (sub === 'compact') {
            const id = requireArg(args, 1);
            const agentId = id ?? runtime.currentSession()?.agentId;
            if (!agentId) { await writeLine('no agent to compact. specify an id or set a session.'); return true; }
            const agent = runtime.getAgent(agentId);
            if (!agent) { await writeLine(`agent not found: ${agentId}`); return true; }
            const before = agent.history.length;
            agent.compactHistory();
            const after = agent.history.length;
            await writeLine(`Compacted ${before} → ${after} history messages for agent ${agentId}.`);
        } else if (sub === 'use') {
            const id = requireArg(args, 1);
            if (!id) { await writeLine('usage: /agent use <id>'); return true; }
            const s = runtime.currentSession();
            if (!s) { await writeLine('no session.'); return true; }
            const agent = runtime.getAgent(id);
            if (!agent) { await writeLine(`agent not found: ${id}`); return true; }
            s.agentId = id;
            s.updatedAt = Date.now();
            await writeLine(`Session now uses agent ${color(C.green, id)}.`);
        } else if (sub === 'model') {
            const id = requireArg(args, 1);
            const model = requireArg(args, 2);
            if (!id || !model) { await writeLine('usage: /agent model <id> <m>'); return true; }
            const agent = runtime.getAgent(id);
            if (!agent) { await writeLine(`agent not found: ${id}`); return true; }
            agent.config.model = model;
            await writeLine(`Agent ${id} model set to ${model}.`);
        } else if (sub === 'key') {
            const id = requireArg(args, 1);
            const key = requireArg(args, 2);
            if (!id || !key) { await writeLine('usage: /agent key <id> <k>'); return true; }
            const agent = runtime.getAgent(id);
            if (!agent) { await writeLine(`agent not found: ${id}`); return true; }
            agent.config.apiKey = key;
            await writeLine(`Agent ${id} API key set.`);
        } else if (sub === 'base') {
            const id = requireArg(args, 1);
            const baseURL = requireArg(args, 2);
            if (!id || !baseURL) { await writeLine('usage: /agent base <id> <url>'); return true; }
            const agent = runtime.getAgent(id);
            if (!agent) { await writeLine(`agent not found: ${id}`); return true; }
            agent.config.baseURL = baseURL;
            await writeLine(`Agent ${id} baseURL set to ${baseURL}.`);
        } else if (sub === 'system') {
            const id = requireArg(args, 1);
            if (!id) { await writeLine('usage: /agent system <id> <text>'); return true; }
            const text = args.slice(2).join(' ');
            const agent = runtime.getAgent(id);
            if (!agent) { await writeLine(`agent not found: ${id}`); return true; }
            agent.config.system = text;
            await writeLine(`Agent ${id} system prompt set.`);
        } else if (sub === 'tools') {
            const id = requireArg(args, 1);
            if (!id) { await writeLine('usage: /agent tools <id> <list>'); return true; }
            const tools = args[2] ? args[2].split(',').map(t => t.trim()).filter(Boolean) : [];
            const agent = runtime.getAgent(id);
            if (!agent) { await writeLine(`agent not found: ${id}`); return true; }
            agent.config.tools = tools;
            await writeLine(`Agent ${id} tools set to ${tools.join(',') || '(none)'}.`);
        } else {
            await writeLine('unknown /agent subcommand. try /agent list');
        }
        return true;
    }

    await writeLine(`unknown command: /${cmd}. type /help`);
    return true;
}

async function sendToAgent(text: string): Promise<void> {
    const s = runtime.currentSession();
    if (!s) {
        await writeLine('no active session. create one with /chat new');
        return;
    }
    const agent = runtime.getAgent(s.agentId);
    if (!agent) {
        await writeLine(`no agent for session (${s.agentId}).`);
        return;
    }

    // persist user message
    s.messages.push({ role: 'user', content: text });
    s.updatedAt = Date.now();

    await writeLine(`${color(C.green, 'assistant:')}`);

    const { text: resultText, toolCalls } = await agent.run(text, {
        onText: (t: string) => write(t),
        onToolCall: (tc: ToolCall) => {
            writeLine(`\n${color(C.dim, `[tool: ${tc.function.name}]`)} ${color(C.gray, tc.function.arguments)}`);
        },
        onConfirm: async (toolName: string, args: Record<string, any>) => {
            const argStr = JSON.stringify(args).slice(0, 100);
            const confirmed = await confirm(`Run ${toolName}(${argStr}...)?`);
            return confirmed;
        },
    });

    await writeLine();

    // persist assistant message
    s.messages.push({ role: 'assistant', content: resultText || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) });
    s.updatedAt = Date.now();

    if (toolCalls.length) {
        await writeLine(`${color(C.dim, `(${toolCalls.length} tool call${toolCalls.length > 1 ? 's' : ''} executed)`)}${C.reset}`);
    }
}

async function main() {
    // Initialize HTTP client + key pool before any LLM requests
    await httpClient.init();

    await writeLine(`${color(C.bold, 'clanka')} — multichat agent shell. Type ${color(C.green, '/help')} for commands.`);
    await writeLine(`Default agent: ${color(C.green, 'default')} (${DEFAULT_MODEL})`);
    await writeLine();

    // Graceful shutdown: wait for in-flight spawn jobs before exiting
    const shutdown = async () => {
        await writeLine('\nShutting down, waiting for background agents...');
        await runtime.shutdown();
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    while (true) {
        await write(promptLine());
        const line = await input();
        if (line === null || line === undefined) break; // EOF

        const trimmed = line.trim();
        if (!trimmed) continue;

        const cmd = parseCommand(trimmed);
        if (cmd) {
            const cont = await handleCommand(cmd.cmd, cmd.args);
            if (!cont) break;
            continue;
        }

        await sendToAgent(trimmed);
    }

    await runtime.shutdown();
}

main().catch((err) => {
    console.error('fatal:', err);
    process.exit(1);
});
