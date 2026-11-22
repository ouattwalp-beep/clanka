import type { AgentConfig, AgentRuntime, ChatSession, Message, SpawnJob, ToolContext } from './types';
import type { AgentInterface } from './agentInterface';
import { Agent } from './agent';
import { run as runTool } from './tools';

const MAX_SPAWN_DEPTH = 3;

function uid(): string {
    return crypto.randomUUID();
}

export class AgentRuntimeImpl implements AgentRuntime {
    private agents = new Map<string, AgentInterface>();
    private sessions = new Map<string, ChatSession>();
    private currentId: string | null = null;
    private spawnJobs = new Map<string, SpawnJob>();
    private spawnJobPromises = new Map<string, Promise<void>>();
    private yoloMode = process.env.CLANKA_YOLO === "true";
    private shuttingDown = false;
    // agentId -> parentId lineage for spawned/delegated agents
    private agentLineage = new Map<string, string | null>();

    /* ---------- agents ---------- */
    createAgent(config: AgentConfig): AgentInterface {
        const id = config.id || uid();
        const agent = new Agent({ ...config, id }, this);
        this.agents.set(id, agent);
        if (config.parentId !== undefined) {
            this.agentLineage.set(id, config.parentId);
        } else {
            this.agentLineage.set(id, null);
        }
        return agent;
    }

    getAgent(id: string): AgentInterface | undefined {
        return this.agents.get(id);
    }

    removeAgent(id: string): boolean {
        this.agentLineage.delete(id);
        return this.agents.delete(id);
    }

    listAgents(): AgentInterface[] {
        return [...this.agents.values()];
    }

    getAgentLineage(agentId: string): string | null {
        return this.agentLineage.get(agentId) ?? null;
    }

    /* ---------- sessions ---------- */
    createSession(agentId: string, title?: string): ChatSession {
        const id = uid();
        const session: ChatSession = {
            id,
            title: title ?? `Chat ${this.sessions.size + 1}`,
            agentId,
            messages: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        this.sessions.set(id, session);
        if (!this.currentId) this.currentId = id;
        return session;
    }

    getSession(id: string): ChatSession | undefined {
        return this.sessions.get(id);
    }

    removeSession(id: string): boolean {
        if (this.currentId === id) this.currentId = null;
        return this.sessions.delete(id);
    }

    listSessions(): ChatSession[] {
        return [...this.sessions.values()].sort((a, b) => b.updatedAt - a.updatedAt);
    }

    switchSession(id: string): ChatSession | undefined {
        const s = this.sessions.get(id);
        if (s) this.currentId = id;
        return s;
    }

    currentSession(): ChatSession | undefined {
        if (!this.currentId) return undefined;
        return this.sessions.get(this.currentId) ?? undefined;
    }

    /* ---------- messaging ---------- */
    async callAgent(agentId: string, input: string, opts?: { parentId?: string | null }): Promise<string> {
        const agent = this.agents.get(agentId);
        if (!agent) {
            return JSON.stringify({ error: `unknown agent: ${agentId}` });
        }
        const { text } = await agent.run(input);
        return text;
    }

    async runTool(name: string, args: Record<string, any>, ctx: ToolContext): Promise<string> {
        return runTool(name, args, ctx);
    }

    async appendSessionMessage(message: Message): Promise<void> {
        const s = this.currentSession();
        if (!s) return;
        s.messages.push(message);
        s.updatedAt = Date.now();
    }

    /* ---------- agent orchestration ---------- */
    async spawnAgent(config: AgentConfig, input: string): Promise<{ jobId: string; agentId: string }> {
        if (this.shuttingDown) {
            throw new Error('Runtime is shutting down. Cannot spawn new agents.');
        }

        const jobId = uid();
        const parentDepth = config.spawnDepth ?? 0;

        if (parentDepth >= MAX_SPAWN_DEPTH) {
            throw new Error(
                `Max spawn depth (${MAX_SPAWN_DEPTH}) reached. Agent cannot spawn further children.`
            );
        }

        if (this.agents.has(config.id)) {
            throw new Error(`Agent with id '${config.id}' already exists`);
        }

        const childConfig: AgentConfig = {
            ...config,
            id: config.id,
            spawnDepth: parentDepth + 1,
        };

        const child = this.createAgent(childConfig);

        const job: SpawnJob = {
            jobId,
            agentId: config.id,
            status: 'running',
            createdAt: Date.now(),
            parentId: childConfig.parentId ?? null,
        };
        this.spawnJobs.set(jobId, job);

        // Fire and forget — child runs in parallel with parent
        const promise = (async () => {
            try {
                const { text } = await child.run(input);
                job.status = 'completed';
                job.result = text;
                job.completedAt = Date.now();
                // Auto-cleanup: remove child agent from runtime after completion
                this.agents.delete(config.id);
            } catch (err) {
                job.status = 'failed';
                job.error = err instanceof Error ? err.message : String(err);
                job.completedAt = Date.now();
                this.agents.delete(config.id);
            } finally {
                // Clean up the promise reference so it doesn't leak
                this.spawnJobPromises.delete(jobId);
            }
        })();

        this.spawnJobPromises.set(jobId, promise);
        // Attach catch to prevent unhandled rejection crashes
        promise.catch(() => {
            // Errors already handled in try/catch above; this is a safety net
        });

        return { jobId, agentId: config.id };
    }

    getSpawnJob(jobId: string): SpawnJob | undefined {
        return this.spawnJobs.get(jobId);
    }

    listSpawnJobs(): SpawnJob[] {
        return [...this.spawnJobs.values()].sort((a, b) => b.createdAt - a.createdAt);
    }

    /* ---------- yolo mode ---------- */
    isYoloMode(): boolean {
        return this.yoloMode;
    }

    setYoloMode(enabled: boolean): void {
        this.yoloMode = enabled;
    }

    /* ---------- shutdown ---------- */
    async shutdown(): Promise<void> {
        this.shuttingDown = true;
        // Wait for all in-flight spawn jobs to complete (best effort)
        if (this.spawnJobPromises.size > 0) {
            await Promise.allSettled([...this.spawnJobPromises.values()]);
        }
    }

    isShuttingDown(): boolean {
        return this.shuttingDown;
    }
}

export const runtime = new AgentRuntimeImpl();
