import { describe, it, expect } from 'bun:test';
import { AgentRuntimeImpl } from './runtime';
import type { AgentConfig } from './types';

function makeConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
    return {
        id: overrides.id || 'test-agent',
        name: overrides.name || 'test',
        model: overrides.model || 'test-model',
        tools: [],
        ...overrides,
    };
}

describe('AgentRuntime', () => {
    it('creates and lists agents', () => {
        const runtime = new AgentRuntimeImpl();
        const agent = runtime.createAgent(makeConfig({ id: 'a1' }));
        expect(runtime.listAgents()).toHaveLength(1);
        expect(runtime.getAgent('a1')).toBe(agent);
    });

    it('removes agents', () => {
        const runtime = new AgentRuntimeImpl();
        runtime.createAgent(makeConfig({ id: 'a1' }));
        expect(runtime.removeAgent('a1')).toBe(true);
        expect(runtime.getAgent('a1')).toBeUndefined();
        expect(runtime.removeAgent('nonexistent')).toBe(false);
    });

    it('creates and switches sessions', () => {
        const runtime = new AgentRuntimeImpl();
        runtime.createAgent(makeConfig({ id: 'a1' }));
        const s1 = runtime.createSession('a1', 'First');
        const s2 = runtime.createSession('a1', 'Second');

        expect(runtime.listSessions()).toHaveLength(2);
        expect(runtime.currentSession()?.id).toBe(s1.id);

        runtime.switchSession(s2.id);
        expect(runtime.currentSession()?.id).toBe(s2.id);
    });

    it('removes sessions', () => {
        const runtime = new AgentRuntimeImpl();
        runtime.createAgent(makeConfig({ id: 'a1' }));
        const s = runtime.createSession('a1');
        expect(runtime.removeSession(s.id)).toBe(true);
        expect(runtime.getSession(s.id)).toBeUndefined();
    });

    it('yolo mode defaults to off and can be toggled', () => {
        const runtime = new AgentRuntimeImpl();
        expect(runtime.isYoloMode()).toBe(false);
        runtime.setYoloMode(true);
        expect(runtime.isYoloMode()).toBe(true);
        runtime.setYoloMode(false);
        expect(runtime.isYoloMode()).toBe(false);
    });

    it('spawnAgent enforces max depth', async () => {
        const runtime = new AgentRuntimeImpl();
        await expect(
            runtime.spawnAgent({ ...makeConfig({ id: 'child' }), spawnDepth: 3 }, 'task')
        ).rejects.toThrow(/Max spawn depth/);
    });

    it('spawnAgent rejects duplicate agent id', async () => {
        const runtime = new AgentRuntimeImpl();
        runtime.createAgent(makeConfig({ id: 'existing' }));
        await expect(
            runtime.spawnAgent({ ...makeConfig({ id: 'existing' }) }, 'task')
        ).rejects.toThrow(/already exists/);
    });

    it('spawnJob starts as running', async () => {
        const runtime = new AgentRuntimeImpl();
        const { jobId } = await runtime.spawnAgent(
            { ...makeConfig({ id: 'spawned-child' }), spawnDepth: 0 },
            'hello'
        );

        const job = runtime.getSpawnJob(jobId);
        expect(job).toBeDefined();
        expect(job?.status).toBe('running');
        expect(job?.agentId).toBe('spawned-child');
        expect(job?.createdAt).toBeDefined();
    });

    it('listSpawnJobs returns jobs sorted by creation time', async () => {
        const runtime = new AgentRuntimeImpl();
        await runtime.spawnAgent({ ...makeConfig({ id: 'job-1' }), spawnDepth: 0 }, 'first');
        await new Promise((r) => setTimeout(r, 50));
        await runtime.spawnAgent({ ...makeConfig({ id: 'job-2' }), spawnDepth: 0 }, 'second');

        const jobs = runtime.listSpawnJobs();
        expect(jobs.length).toBe(2);
        expect(jobs[0]!.agentId).toBe('job-2'); // most recent first
    });
});
