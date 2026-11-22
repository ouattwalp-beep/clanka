# Agent Progress Tracker

## Current Session (Today)

### Completed Reading
- [x] `agents/README.md` — context folder purpose
- [x] `agents/vision.md` — desired end state (clanka: dependency-free shell LLM interface)
- [x] `agents/current-state.md` — existing code structure and limitations
- [x] `agents/todo.md` — full task list, done items, P1/P2/P3 items
- [x] `agents/issues.md` — fixed issues, yolo mode default on, compaction on hold
- [x] `agents/dashboard-spec.md` — dashboard/navigation screen spec
- [x] `agents/limitations-plan.md` — MAX_ITERATIONS removal, known limitations
- [x] `src/types.ts` — shared types (Role, Message, ToolCall, AgentConfig, Session, AgentRuntime, KeyPoolEntry, SpawnJob)
- [x] `src/http.ts` — HttpClient: single fetch wrapper, API key pool, proactive <40 RPM rotation, reactive 429 swap
- [x] `src/agent.ts` — Agent class: delegate tool, spawn tool, compactHistory, run loop with maxIterations
- [x] `src/runtime.ts` — AgentRuntimeImpl: agent/session CRUD, spawn orchestration, yolo mode, shutdown, lineage
- [x] `src/index.ts` — entry point, REPL, slash commands, default agent bootstrap
- [x] `src/llm.ts` — raw fetch OpenAI-compatible client, SSE streaming parser, tool call accumulation
- [x] `src/cli.ts` — REPL helpers, ANSI colors, slash-command parsing, line queue readline
- [x] `src/tools/shell.ts` — shell tool with dangerous command blocking
- [x] `src/tools/index.ts` — tool registry (shell registered)
- [x] `src/agentInterface.ts` — AgentInterface extracted to break circular dependency
- [x] `package.json` — dependency-free (only @types/bun dev dep)

### Verification Results
- `bun --version` — 1.4.5 (bun at `/home/codespace/.bun/bin/bun`, not in PATH by default)
- `bun run typecheck` — ✅ PASS (clean, no errors)
- `bun test` — ⚠️ 13 pass, 1 fail (pre-existing: test expects yolo default OFF, but `.env` has `CLANKA_YOLO=true`)

### Key Architectural Decisions (from code)
- **Dependency-free**: Bun native `fetch`, no `openai` SDK
- **Single HttpClient**: all LLM HTTP goes through one wrapper with key pool
- **API key pool**: `.clanka/keys.json`, proactive swap before 40 RPM, reactive swap on 429
- **Multichat**: sessions with independent history, switchable via `/chat`
- **Agents**: per-agent model, key, baseURL, system prompt, tools; parallel execution
- **Delegation**: `delegate` tool — sync call to another agent
- **Spawning**: `spawn` tool — async parallel fire-and-forget, depth limit 3
- **Yolo mode**: `/yolo on|off`, defaults ON via `CLANKA_YOLO=true`
- **Compaction**: IMPLEMENTED but DISABLED (`enableCompaction: false`) — user confirmed keep OFF

---

## User Requirements (New — To Be Tracked)

### 1. Code Quality & Scalability
- Make the code solid, always thinking about scalability for future additions
- Future additions: new UI (dashboard screens), persistence to disk
- No heavy dependencies — keep Bun native fetch

### 2. API Key Usage Tracking (P1 for data layer, low priority for UI)
**Requirement:** A page in the new UI to check API keys:
- Which key is active
- How much usage each key had
- Track stats over time: count 429s, request counts, etc.
- Save stats so they can be tracked historically

**Implementation needed:**
- Extend `KeyPoolEntry` in `src/types.ts` with usage stats fields:
  - `totalRequests: number`
  - `total429s: number`
  - `totalErrors: number`
  - `lastUsedAt: number | null`
  - `last429At: number | null`
  - `lastErrorAt: number | null`
  - `active: boolean` (currently selected/active key)
- Persist stats to `.clanka/` (e.g., `.clanka/key-stats.json` or extend `keys.json`)
- HttpClient should record stats on every request (success, 429, etc.)

### 3. Model Context Limits
- If we need an endpoint to check a model's context limit, let the user know
- Account for context limits to avoid filling context
- Enable smart compaction in the future based on token usage

### 4. Token Usage Tracking
- If chat data misses token counts, report it
- Research whether usage reports exist
- Track tokens per message/session if possible

### 5. Progress Tracking
- Keep track of progress in `agents/` folder
- Update `agents/todo.md` and `agents/progress.md` as work proceeds

---

## Status
- **Phase 1 (Reading & Understanding):** ✅ Complete
- **Phase 2 (Documentation & Planning):** ✅ Complete
- **Phase 3 (Implementation):** ⏳ Pending

Next: Implement key usage stats data layer (extend types, HttpClient, persistence).

---

## Bun Docs Research (Just Completed)

### Downloaded
- `docs/bun/fetch.md` — Bun fetch API docs
- `docs/bun/repl.md` — Bun REPL docs
- `docs/bun/child-process.md` — Bun spawn docs (earlier)
- `docs/bun/analysis.md` — Analysis of improvements for clanka
- `docs/bun/shell-tool-analysis.md` — Shell tool vs spawn docs analysis

### Key Findings for HttpClient (src/http.ts)

**High priority — Add request timeout:**
- Currently `httpClient.request()` has NO timeout
- Bun fetch supports `AbortSignal.timeout(ms)` directly
- A hung LLM API call could block indefinitely
- Fix: Add `signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)` to fetch call

**Medium priority — Proxy/TLS options:**
- Bun fetch supports `proxy` option for routing through proxies
- Bun fetch supports `tls` option for client certs / self-signed CAs
- Could be useful for enterprise/LLM proxy setups

### Key Findings for Clanka REPL (src/cli.ts)

**Low priority — Future UI enhancements:**
- Bun REPL has multi-line input, history persistence (`~/.bun_repl_history`), tab completion
- Special variables: `_` (last result), `_error` (last error)
- Commands: `.help`, `.exit`, `.clear`, `.copy`, `.load`, `.save`, `.editor`
- Non-interactive mode: `bun repl -e` / `bun repl -p`

### Shell Tool (src/tools/shell.ts) — Already reviewed
- Uses `Bun.spawnSync` correctly
- Missing `timeout` and `maxBuffer` parameters
- `exitedDueToTimeout` and `exitedDueToMaxBuffer` fields are captured but always false
