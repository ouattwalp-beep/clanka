# TODO / What Is To Do

## Done (rewrite complete)
- [x] `agents/` context folder (README, vision, current-state, todo, issues, dashboard-spec, limitations-plan, progress, key-stats-spec)
- [x] `agents/limitations-plan.md` — documents MAX_ITERATIONS removal and all known limitations
- [x] `agents/key-stats-spec.md` — API key usage tracking spec (new requirement)
- [x] `agents/progress.md` — agent progress tracker
- [x] Modular, dependency-free `src/`:
  - `src/types.ts` — shared types (Role, Message, ToolCall, AgentConfig, Session, AgentRuntime, KeyPoolEntry, SpawnJob, yolo mode on runtime, maxIterations)
  - `src/llm.ts` — raw `fetch` to OpenAI-compatible chat/completions, SSE streaming parser, per-call apiKey/baseURL/model (uses HttpClient)
  - `src/http.ts` — single `fetch` wrapper (HttpClient) with API key pool, proactive rotation (<40 RPM per key), reactive swap on 429
  - `src/agent.ts` — `Agent` class with `delegate` + `spawn` tools; `spawn` fires child agent in parallel (no await); `maxIterations` configurable (default `Infinity`); yolo mode confirmation bypass
  - `src/runtime.ts` — `AgentRuntimeImpl` with spawn orchestration, **yolo mode state** (`isYoloMode`, `setYoloMode`), depth limit (3), auto-cleanup
  - `src/session.ts` — merged into runtime (`ChatSession` type in types.ts)
  - `src/cli.ts` — REPL helpers, ANSI colors, slash-command parsing, confirm
  - `src/tools/index.ts` — tool registry (name → definition + handler)
  - `src/tools/shell.ts` — shell tool (kept)
  - `src/index.ts` — entry point, boot runtime, slash-command REPL, `httpClient.init()`, `/yolo on|off` commands, confirm wiring, default agents use `maxIterations: Infinity`
- [x] Removed `openai` dependency from `package.json` (uses Bun native `fetch`)
- [x] Multichat: `/chat new`, `/chat list`, `/chat use <id>`, `/chat del <id>`, `/chat show`
- [x] Agents: `/agent new`, `/agent list`, `/agent use <id>`, `/agent model`, `/agent key`, `/agent base`, `/agent system`, `/agent tools`
- [x] Delegation: built-in `delegate` tool — agent calls another agent and waits (sync)
- [x] Spawn orchestration: built-in `spawn` tool — agent creates child agent that runs in PARALLEL (async, fire-and-forget)
- [x] Spawn depth limit (max 3 levels) to prevent infinite recursion
- [x] Auto-cleanup: child agent removed from runtime after completion/failure; result preserved in job store
- [x] Per-agent API key/model/baseURL (parallel agents with different credentials)
- [x] HTTP wrapper + API key pool: `.clanka/keys.json`, proactive swap (<40 RPM), reactive swap on 429, lock-coordinated concurrency
- [x] **Yolo mode** — `/yolo on` / `/yolo off` toggle; `[YOLO]` shown in prompt when enabled; all tool calls auto-accepted
- [x] **Test suite** — `src/http.test.ts` + `src/runtime.test.ts`; tests pass, 0 fail; `bun test` green
- [x] **`maxIterations` configurable** — `AgentConfig.maxIterations` defaults to `Infinity` (unlimited); can be set to finite number for cost/runway control
- [x] Smoke-tested: LLM stream, shell tool, multichat, agent switching, yolo toggle all work; `tsc --noEmit` passes

## Compaction — OFF (User Decision)
- **Status:** DISABLED, remains off per user instruction
- Code exists in `src/agent.ts` `compactHistory()` but `enableCompaction: false` everywhere
- Will not be re-enabled without explicit user approval

## New Requirements (from user session)

### P1: API Key Usage Tracking (data layer now, UI later)
- [ ] Extend `KeyPoolEntry` in `src/types.ts` with usage stats: `totalRequests`, `total429s`, `totalErrors`, `lastUsedAt`, `last429At`, `lastErrorAt`, `active`
- [ ] Persist stats to `.clanka/key-stats.json` (separate from `keys.json`)
- [ ] HttpClient records stats on every request (success, 429, error)
- [ ] New accessors: `getKeyStats()`, `getActiveKey()`, `resetKeyStats()`
- [ ] UI page (low priority): table showing keys, active status, usage counts, 429 counts, last used

### P1: Model Context Limits
- [ ] Research if an endpoint exists to check a model's context limit
- [ ] If needed, implement context limit lookup to avoid filling context
- [ ] Account for context limits for future smart compaction

### P1: Token Usage Tracking
- [ ] Research whether usage reports provide token counts per message
- [ ] If chat data misses token counts, report it
- [ ] Track tokens per message/session if possible

### P1: Dashboard & Navigation (new requirements — not started)
- [ ] Dashboard screen (launch screen: active chats, create/open)
- [ ] Individual Conversation screen
- [ ] Archived Chats screen (separate, archive/restore)
- [ ] Statistics screen (read-only metrics)
- [ ] Active Chats rows: title, last activity, agent status, attention required
- [ ] `/btw` deferred messages (enqueue while busy, deliver when idle)

### P1: `/jobs` slash command
- [ ] List/check background spawn jobs from REPL

### P1: Session persistence to disk
- [ ] JSON in `.clanka/sessions/`

### P2 / P3 (later / optional)
- [ ] Config file (`.clanka/config.json`) for default agents/keys
- [ ] Markdown rendering in terminal (basic)
- [ ] Persist spawn jobs to disk (resume on restart)
- [ ] Session titles auto-generated from first message
- [ ] Test suite expansion (agent.compaction, llm.sse, etc.)

## Notes for future agents
- Do NOT add heavy dependencies. Use Bun's global `fetch` for HTTP.
- Every agent runs with its own apiKey/model/baseURL; they can operate in parallel.
- Agent delegation: an agent's toolset auto-includes a `delegate` tool targeting all other agents.
- Agent spawning: `spawn` tool creates a child agent that runs in parallel (no await). Parent gets back `jobId` immediately.
- Keep `agents/` folder up to date when changing behavior.
- **The user is the direct interface for this project.** Treat the user's instructions as authoritative. Any mistakes end the coding session.
- `.clanka/` directory holds `keys.json` (API key pool) and `key-stats.json` (usage stats) — add both to `.gitignore`.

## Commands that work
- `bun install` — install dev deps (only `@types/bun`)
- `bun .` — start the REPL
- `bun run typecheck` — run `tsc --noEmit`
- `bun test` — run test suite
- Smoke test: `printf '/agent list\n/exit\n' | bun .`

## Environment
- `OPENAI_API_KEY` — default key for the `default` agent
- `OPENAI_BASE_URL` — default base URL (default: NVIDIA integrate API)
- `DEFAULT_MODEL` — default model
- `DEFAULT_SYSTEM` — default system prompt
- `CLANKA_YOLO` — yolo mode default (true = on)
- `CLANKA_RETRY_WAIT_MS` — default wait when all keys rate-limited (default 15000)
- `CLANKA_MAX_HISTORY` — default max history messages (default 20)

## New Task: Verify Binary Data & Streams Usage (from Bun docs)

### Downloaded reference docs
- `docs/bun/binary-data.md` — Bun BinaryData API
- `docs/bun/streams.md` — Bun Streams API

### Task
Check codebase (`src/`) for correct usage of:
- **Binary data**: `Buffer`, `Uint8Array`, `ArrayBuffer`, `Blob`, `File`, `Bun.file()`, `Bun.write()`, `Bun.hexDecode()`, `Bun.hexEncode()`, `Bun.toBase64()`, `Bun.fromBase64()`
- **Streams**: `ReadableStream`, `WritableStream`, `TransformStream`, `ByteLengthQueueingStrategy`, `CountQueueingStrategy`, `ReadableStreamDefaultReader`, `ReadableStreamDefaultWriter`, `TextEncoderStream`, `TextDecoderStream`, `compression streams` (CompressionStream, DecompressionStream)

### Context for agents
- General knowledge from Bun docs (binary-data, streams, fetch, repl) should inform all code changes
- These are Bun-native APIs — no npm dependencies needed
- Check `src/llm.ts` SSE parser uses streams correctly
- Check `src/tools/shell.ts` handles binary output correctly
- Check `src/http.ts` handles response bodies correctly

## New Task: Evaluate Bun Markdown & Color for UI (from Bun docs)

### Downloaded reference docs
- `docs/bun/markdown.md` — Bun Markdown API
- `docs/bun/color.md` — Bun Color API

### Potential UI Use (to be evaluated)
- **Markdown**: Could render assistant responses as Markdown in the terminal dashboard/conversation screens. Listed as P2 in todo.md ("Markdown rendering in terminal (basic)").
- **Color**: Could enhance terminal UI colors beyond the basic ANSI codes currently in `src/cli.ts`. Could be useful for status indicators, key usage highlights, etc.

### Context
- These are Bun-native APIs — no npm dependencies
- Currently `src/cli.ts` uses hardcoded ANSI escape codes (`C` object with color constants)
- Dashboard spec (`agents/dashboard-spec.md`) mentions Statistics screen with read-only metrics — color could help visualize status
- Markdown rendering was listed as P2 optional work

### Next step for agents
Read the downloaded docs and decide if/when to integrate. No immediate implementation required.

## New Task: Review Bun Utils for General Knowledge (from Bun docs)

### Downloaded reference doc
- `docs/bun/utils.md` — Bun Utils API

### Purpose
Add Bun Utils knowledge to the general knowledge base. These are Bun-native runtime utilities that agents should be aware of when making code changes — no npm dependencies needed.

### Context for agents
- `Bun.version`, `Bun.file()`, `Bun.write()`, and other utilities may be relevant for:
  - Session persistence to disk
  - Key stats persistence
  - File I/O operations
  - Runtime introspection
- No implementation required yet — just awareness

### Next step for agents
Read `docs/bun/utils.md` and add relevant items to general knowledge. No immediate implementation required.
