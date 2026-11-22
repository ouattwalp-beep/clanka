import { describe, it, expect } from 'bun:test';
import { HttpClient } from './http';

describe('HttpClient key pool', () => {
    it('proactively rotates keys before 40 RPM', async () => {
        const client = new HttpClient();
        (client as any).pool = [
            { key: 'key-a', count: 40, minuteStart: Date.now() }, // at limit
            { key: 'key-b', count: 0, minuteStart: Date.now() },
        ];
        (client as any).index = 0;

        const selected = (client as any).selectKey();
        expect(selected?.key).toBe('key-b'); // key-a is at limit, skip to key-b
    });

    it('resets stale minute counters', async () => {
        const client = new HttpClient();
        (client as any).pool = [
            { key: 'key-a', count: 50, minuteStart: Date.now() - 70_000 }, // stale minute
        ];
        (client as any).index = 0;

        const selected = (client as any).selectKey();
        expect(selected?.key).toBe('key-a'); // count reset, available again
        expect(selected?.count).toBe(0);
    });

    it('returns undefined when all keys at limit', async () => {
        const client = new HttpClient();
        (client as any).pool = [
            { key: 'key-a', count: 40, minuteStart: Date.now() },
            { key: 'key-b', count: 40, minuteStart: Date.now() },
        ];
        (client as any).index = 0;

        const selected = (client as any).selectKey();
        expect(selected).toBeUndefined();
    });

    it('prefers matching model/baseURL hints', async () => {
        const client = new HttpClient();
        (client as any).pool = [
            { key: 'key-a', model: 'model-x', count: 0, minuteStart: Date.now() },
            { key: 'key-b', model: 'model-y', count: 0, minuteStart: Date.now() },
        ];
        (client as any).index = 0;

        const selected = (client as any).selectKey('model-y');
        expect(selected?.key).toBe('key-b');
    });

    it('getPoolSnapshot returns copy, not internal reference', () => {
        const client = new HttpClient();
        const snap = client.getPoolSnapshot();
        expect(snap).not.toBe(client.getPoolSnapshot());
    });
});
