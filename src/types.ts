import type { AgentInterface } from './agentInterface';

export type Role = 'system' | 'user' | 'assistant' | 'tool' | 'summary';

export interface ToolCall {
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
}

export interface Message {
    role: Role;
    content: string | null;
    name?: string;
    tool_call_id?: string;
    tool_calls?: ToolCall[];
}

export interface ToolContext {
    agentId: string;
    agentName: string;
    runtime: AgentRuntime;
}

export interface ToolDefinition {
    name: string;
    description?: string;
    parameters: Record<string, any>;
    handler: (args: Record<string, any>, ctx: ToolContext) => Promise<string>;
}

export interface AgentConfig {
    id: string;
    name: string;
    model: string;
    apiKey?: string;
    baseURL?: string;
    system?: string;
    tools: string[]; // tool names
    parentId?: string | null;
    spawnDepth?: number; // 0 = root, increments on each spawn
    maxIterations?: number; // default Infinity = unlimited tool-calling loops
    maxHistoryMessages?: number; // default 20, triggers compaction when exceeded
    enableCompaction?: boolean; // default true
}

export interface ChatSession {
    id: string;
    title: string;
    agentId: string;
    messages: Message[];
    createdAt: number;
    updatedAt: number;
}

export interface AgentRuntime {
    createAgent(config: AgentConfig): AgentInterface;
    getAgent(id: string): AgentInterface | undefined;
    removeAgent(id: string): boolean;
    listAgents(): AgentInterface[];

    createSession(agentId: string, title?: string): ChatSession;
    getSession(id: string): ChatSession | undefined;
    removeSession(id: string): boolean;
    listSessions(): ChatSession[];
    switchSession(id: string): ChatSession | undefined;
    currentSession(): ChatSession | undefined;

    callAgent(agentId: string, input: string, opts?: { parentId?: string | null }): Promise<string>;
    runTool(name: string, args: Record<string, any>, ctx: ToolContext): Promise<string>;

    // Agent orchestration
    spawnAgent(config: AgentConfig, input: string): Promise<{ jobId: string; agentId: string }>;
    getSpawnJob(jobId: string): SpawnJob | undefined;
    listSpawnJobs(): SpawnJob[];

    // Yolo mode
    isYoloMode(): boolean;
    setYoloMode(enabled: boolean): void;

    // Shutdown
    shutdown(): Promise<void>;
    isShuttingDown(): boolean;

    // Lineage
    getAgentLineage(agentId: string): string | null;
}

export interface LLMResult {
    text: string;
    toolCalls: ToolCall[];
}

export interface KeyPoolEntry {
    key: string;
    model?: string;
    baseURL?: string;
    count: number;
    minuteStart: number;
}

export interface SpawnJob {
    jobId: string;
    agentId: string;
    status: 'running' | 'completed' | 'failed';
    result?: string;
    error?: string;
    createdAt: number;
    completedAt?: number;
    parentId: string | null;
}
