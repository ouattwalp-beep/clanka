import type { KeyPoolEntry } from './types';

const KEYS_DIR = '.clanka';
const KEYS_FILE = `${KEYS_DIR}/keys.json`;
const RPM_LIMIT = 40;

// Default wait time (ms) when all keys are rate-limited and no Retry-After header is present.
// Override with CLANKA_RETRY_WAIT_MS env var.
const DEFAULT_RETRY_WAIT_MS =
    parseInt(process.env.CLANKA_RETRY_WAIT_MS ?? '15000', 10);

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Single fetch wrapper for all LLM API requests.
 * Owns the API key pool, rate-limit tracking, proactive key rotation
 * (before 40 RPM per key), and reactive swap on 429.
 *
 * All agents share this instance so concurrent workers coordinate key usage.
 */
export class HttpClient {
    private pool: KeyPoolEntry[] = [];
    private index = 0; // round-robin cursor
    private locked = false;
    private waiters: (() => void)[] = [];

    async init(): Promise<void> {
        await this.ensureDir();
        await this.loadPool();
        // Seed pool from env if empty
        if (this.pool.length === 0) {
            const envKey = process.env.OPENAI_API_KEY;
            if (envKey) {
                this.pool.push({
                    key: envKey,
                    count: 0,
                    minuteStart: Date.now(),
                });
                await this.savePool();
            }
        }
    }

    // Test/inspection accessors (read-only)
    getPoolSnapshot(): KeyPoolEntry[] {
        return [...this.pool];
    }

    getPoolSize(): number {
        return this.pool.length;
    }

    private async ensureDir(): Promise<void> {
        try {
            // @ts-expect-error Bun.mkdir exists at runtime but not in @types/bun
            await Bun.mkdir(KEYS_DIR, { recursive: true });
        } catch {
            // directory likely exists already
        }
    }

    private async loadPool(): Promise<void> {
        try {
            const text = await Bun.file(KEYS_FILE).text();
            const parsed = JSON.parse(text);
            this.pool = Array.isArray(parsed) ? parsed : [];
            for (const entry of this.pool) {
                if (entry.count === undefined) entry.count = 0;
                if (entry.minuteStart === undefined) entry.minuteStart = Date.now();
            }
        } catch {
            this.pool = [];
        }
    }

    async savePool(): Promise<void> {
        await Bun.write(KEYS_FILE, JSON.stringify(this.pool, null, 2));
    }

    private async acquireLock(): Promise<void> {
        if (this.locked) {
            await new Promise<void>((resolve) => this.waiters.push(resolve));
        }
        this.locked = true;
    }

    private releaseLock(): void {
        this.locked = false;
        const next = this.waiters.shift();
        if (next) next();
    }

    private resetStaleMinutes(): void {
        const now = Date.now();
        for (const entry of this.pool) {
            if (now - entry.minuteStart >= 60_000) {
                entry.count = 0;
                entry.minuteStart = now;
            }
        }
    }

    /**
     * Round-robin key selection. Prefers entries matching model/baseURL hints.
     * Skips keys that have hit RPM_LIMIT in the current minute.
     * Advances the cursor past the selected key.
     */
    private selectKey(model?: string, baseURL?: string): KeyPoolEntry | undefined {
        this.resetStaleMinutes();
        const n = this.pool.length;
        if (n === 0) return undefined;

        // First pass: prefer matching model/baseURL with count < RPM_LIMIT
        for (let offset = 0; offset < n; offset++) {
            const entry = this.pool[(this.index + offset) % n]!;
            const matchModel = !model || entry.model === model;
            const matchBaseURL = !baseURL || entry.baseURL === baseURL;
            if (matchModel && matchBaseURL && entry.count < RPM_LIMIT) {
                this.index = (this.index + offset + 1) % n;
                return entry;
            }
        }

        // Second pass: any key with count < RPM_LIMIT
        for (let offset = 0; offset < n; offset++) {
            const entry = this.pool[(this.index + offset) % n]!;
            if (entry.count < RPM_LIMIT) {
                this.index = (this.index + offset + 1) % n;
                return entry;
            }
        }

        return undefined; // all keys at limit
    }

    /**
     * Make an HTTP request through the key pool.
     * - Acquires a key under lock (proactive rotation before 40 RPM).
     * - If all keys are maxed out, waits DEFAULT_RETRY_WAIT_MS (or until
     *   minute boundary passes) before retrying.
     * - Makes the request without holding the lock.
     * - On 429, rotates past the rate-limited key. If another key is
     *   available, retries immediately. Otherwise waits for Retry-After
     *   header (or DEFAULT_RETRY_WAIT_MS) and retries from the top.
     */
    async request(opts: {
        url: string;
        model?: string;
        baseURL?: string;
        headers: Record<string, string>;
        method: string;
        body: string;
        fallbackApiKey?: string;
    }): Promise<Response> {
        let retries = 0;
        const maxRetries = 10;

        while (retries < maxRetries) {
            retries++;

            // --- Phase 1: select an available key under lock ---
            await this.acquireLock();
            let selected: KeyPoolEntry | undefined;
            try {
                selected = this.selectKey(opts.model, opts.baseURL);
            } finally {
                this.releaseLock();
            }

            if (!selected) {
                // All keys at limit. Wait before retrying.
                await sleep(DEFAULT_RETRY_WAIT_MS);
                continue;
            }

            selected.count++;

            const apiKey = selected.key;
            const headers = { ...opts.headers, Authorization: `Bearer ${apiKey}` };

            // --- Phase 2: make request without lock ---
            let response = await fetch(opts.url, {
                headers,
                method: opts.method,
                body: opts.body,
            });

            // --- Phase 3: reactive swap on 429 ---
            if (response.status === 429) {
                // Rotate cursor past the rate-limited key
                await this.acquireLock();
                try {
                    this.index = (this.index + 1) % this.pool.length;
                } finally {
                    this.releaseLock();
                }

                // Try to find another available key immediately
                await this.acquireLock();
                try {
                    const nextKey = this.selectKey(opts.model, opts.baseURL);
                    if (nextKey) {
                        // Retry immediately with the new key
                        nextKey.count++;
                        const retryHeaders = {
                            ...opts.headers,
                            Authorization: `Bearer ${nextKey.key}`,
                        };
                        response = await fetch(opts.url, {
                            headers: retryHeaders,
                            method: opts.method,
                            body: opts.body,
                        });
                        // If this also 429s, fall through to wait logic below
                        if (response.status !== 429) {
                            return response;
                        }
                    }
                } finally {
                    this.releaseLock();
                }

                // All keys maxed out (or immediate retry also 429d).
                // Honor Retry-After header if present, else default wait.
                const retryAfter = response.headers.get('Retry-After');
                const waitMs = retryAfter
                    ? parseInt(retryAfter, 10) * 1000
                    : DEFAULT_RETRY_WAIT_MS;

                await sleep(waitMs);
                continue;
            }

            return response;
        }

        throw new Error(
            `LLM request failed after ${maxRetries} retries: all keys rate-limited`,
        );
    }
}

export const httpClient = new HttpClient();
