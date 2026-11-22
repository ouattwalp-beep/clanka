# clanka vs Bun Docs — Code Review & Cleanup Map

This document compares `src/` (the actual codebase) against `docs/bun/*.md` (Bun's official docs) to identify what's used, what's missing, and what needs cleanup.

---

## 1. File inventory

### `src/` — 12 files

| File | Purpose |
|------|---------|
| `src/types.ts` | Shared types (Role, Message, ToolCall, AgentConfig, Session, AgentRuntime, KeyPoolEntry, SpawnJob) |
| `src/http.ts` | HttpClient — single fetch wrapper, API key pool, proactive rotation (<40 RPM), reactive swap on 429 |
| `src/llm.ts` | Raw `fetch` OpenAI-compatible client, SSE streaming parser, tool call accumulation |
| `src/agent.ts` | `Agent` class — delegate + spawn tools, run loop, compaction, confirm/yolo |
| `src/runtime.ts` | `AgentRuntimeImpl` — agent/session CRUD, spawn orchestration, yolo, shutdown, lineage |
| `src/cli.ts` | REPL helpers, ANSI colors, slash-command parsing, line queue readline |
| `src/index.ts` | Entry point, REPL loop, slash commands, default agent bootstrap |
| `src/tools/shell.ts` | Shell tool — `Bun.spawnSync`, dangerous command blocking |
| `src/tools/index.ts` | Tool registry (name → definition + handler) |
| `src/agentInterface.ts` | `AgentInterface` extracted to break circular dependency |
| `src/http.test.ts` | HttpClient key pool tests |
| `src/runtime.test.ts` | Runtime CRUD, spawn, yolo tests |

### `docs/bun/` — 8 files

| Doc | What it covers |
|-----|---------------|
| `fetch.md` | Bun's WHATWG fetch with extensions (timeout, proxy, TLS, sessions, preconnect, verbose) |
| `child-process.md` | `Bun.spawn`, `Bun.spawnSync`, PTY/terminal, IPC, cgroups, resource usage |
| `color.md` | `Bun.color()` — CSS/ANSI/number/hex color conversion |
| `markdown.md` | `Bun.markdown.render()` / `.html()` / `.react()` — GFM markdown with callbacks |
| `repl.md` | `bun repl` — multi-line input, history, tab completion, special vars |
| `streams.md` | `ReadableStream`, `WritableStream`, direct streams, `ArrayBufferSink`, backpressure |
| `binary-data.md` | `Buffer`, `Uint8Array`, `Blob`, `File`, `Bun.file()`, encoding/decoding |
| `utils.md` | `Bun.version`, `Bun.env`, `Bun.sleep`, `Bun.which`, `Bun.randomUUIDv7`, `Bun.stringWidth`, `Bun.wrapAnsi`, `Bun.stripANSI`, `Bun.file`, `Bun.write`, etc. |

---

## 2. Detailed comparison

### 2.1 `src/http.ts` vs `docs/bun/fetch.md`

| Bun feature (doc) | Used in clanka? | Status |
|-------------------|-----------------|--------|
| `fetch()` for HTTP | ✅ Yes — all LLM requests go through `httpClient.request()` | Implemented |
| `AbortSignal.timeout(ms)` | ❌ Not used | **Deferred** — user said no timeouts for now |
| `fetch.preconnect(host)` | ❌ Not used | Future optimization — warm DNS/TCP/TLS to LLM endpoint |
| `Bun.FetchSession` | ❌ Not used | Future — per-session connection pools/TLS/proxy |
| `proxy` option | ❌ Not used | Future — enterprise proxy routing |
| `tls` option | ❌ Not used | Future — client certs, self-signed CAs |
| `verbose: true` | ❌ Not used | Useful for debugging LLM requests |
| `response.body` streaming (`for await`) | ✅ Yes — `parseSseStream` iterates `response.body` | Implemented |
| `response.text()` / `.json()` / `.bytes()` | ✅ Yes — `response.text()` used for error bodies | Implemented |
| `BUN_CONFIG_MAX_HTTP_REQUESTS` env | ❌ Not used | Future — raise simultaneous fetch limit (default 256) |
| DNS prefetch / caching | ❌ Not used | Future |

**Assessment:** `http.ts` correctly uses Bun native `fetch` and streams the SSE body. It does **not** use `AbortSignal.timeout` (per user decision), `FetchSession`, or `preconnect`. The `Bun.mkdir` call has a `@ts-expect-error` because `@types/bun` may not declare it — worth checking.

---

### 2.2 `src/tools/shell.ts` vs `docs/bun/child-process.md`

| Bun feature (doc) | Used in clanka? | Status |
|-------------------|-----------------|--------|
| `Bun.spawnSync([cmd, ...args])` | ✅ Yes — `Bun.spawnSync({ cmd: ['bash', '-lc', command] })` | Implemented |
| `timeout` (ms) | ❌ Not set | **Deferred** — user said no timeouts for now |
| `maxBuffer` | ❌ Not set | **Deferred** — user said plan for later |
| `resourceUsage()` | ❌ Not captured | **Low priority** — future QoL (maxRSS, CPU time) |
| `cwd`, `env` | ❌ Not used | Available but unused |
| `signal` (AbortController) | ❌ Not used | Future — abort running shell commands |
| `terminal` / PTY | ❌ Not used | Future — interactive shell with colors, `isTTY=true` |
| `onExit`, `proc.kill()`, `proc.unref()` | ❌ Not used | Relevant for `/jobs` and spawn cleanup |
| IPC between Bun processes | ❌ Not used | Future — parent ↔ child agent messaging |
| `exitedDueToTimeout`, `exitedDueToMaxBuffer` | ✅ Read from result but always false (no timeout/maxBuffer set) | Captured but unused |

**Assessment:** Shell tool works correctly with `Bun.spawnSync`. Missing `timeout` and `maxBuffer` per user instruction. `resourceUsage()` available on `SyncSubprocess` but not captured — flagged as low-priority QoL.

---

### 2.3 `src/cli.ts` vs `docs/bun/color.md` + `docs/bun/repl.md`

| Bun feature (doc) | Used in clanka? | Status |
|-------------------|-----------------|--------|
| `Bun.color(input, "ansi")` | ❌ Not used — hardcoded ANSI constants (`C` object) | **Replaceable** — `Bun.color` is zero-dependency |
| `Bun.stringWidth(input)` | ❌ Not used | Future — dashboard table column alignment |
| `Bun.wrapAnsi(input, cols)` | ❌ Not used | Future — wrap text preserving ANSI |
| `Bun.stripANSI(text)` | ❌ Not used | Future — strip colors for logging/plain display |
| `Bun.markdown.render()` | ❌ Not used | P2 — ANSI-rendered assistant responses |
| `bun repl` multi-line input | ❌ Not used — simple readline loop | Future UI enhancement |
| `bun repl` persistent history | ❌ Not used | Future |
| `bun repl` tab completion | ❌ Not used | Future |
| `bun repl` special vars (`_`, `_error`) | ❌ Not used | Future |

**Assessment:** `cli.ts` uses hand-rolled ANSI constants. `Bun.color()` could replace them for dashboard/status colors. `Bun.stringWidth()` and `Bun.wrapAnsi()` would help the dashboard spec (table alignment, text wrapping). REPL enhancements are future UI work.

---

### 2.4 `src/agent.ts` vs `docs/bun/` (general)

| Bun feature | Used in clanka? | Status |
|-------------|-----------------|--------|
| `Bun.randomUUIDv7()` | ❌ Uses `crypto.randomUUID()` | **Replaceable** — UUID v7 is monotonic/sortable, better for job/session IDs |
| `Bun.sleep(ms)` | ❌ Uses `setTimeout`-based sleep in `http.ts` | Replaceable — `Bun.sleep` is native |
| `Bun.deepEquals()` | ❌ Not used | Future — compare agent/session configs |
| `Bun.escapeHTML()` | ❌ Not used | Future — if rendering markdown to HTML |

**Assessment:** `agent.ts` uses `crypto.randomUUID()` indirectly via `runtime.uid()`. `Bun.randomUUIDv7()` would be better for IDs that need to be sortable. `Bun.sleep()` could replace the custom `sleep()` in `http.ts`.

---

### 2.5 `src/runtime.ts` vs `docs/bun/child-process.md` + `docs/bun/utils.md`

| Bun feature | Used in clanka? | Status |
|-------------|-----------------|--------|
| `Bun.randomUUIDv7()` | ❌ `uid()` uses `crypto.randomUUID()` | Replaceable — v7 is monotonic |
| `Bun.spawn` / `spawnSync` | ❌ Not directly — spawn agent is logical, not OS process | N/A |
| `proc.resourceUsage()` | ❌ Not captured on spawn jobs | Low priority QoL |
| `Bun.file(path)` / `Bun.write(path, data)` | ❌ `http.ts` uses `Bun.file()` and `Bun.write()` for keys.json | Partially used |
| `Bun.sleep()` | ❌ Custom sleep in http.ts | Replaceable |

**Assessment:** Runtime uses `Bun.file()`/`Bun.write()` (via http.ts) for key pool persistence. Session persistence to `.clanka/sessions/` is planned but not implemented — `Bun.file()`/`Bun.write()` would handle that.

---

### 2.6 `src/llm.ts` vs `docs/bun/fetch.md` + `docs/bun/streams.md`

| Bun feature | Used in clanka? | Status |
|-------------|-----------------|--------|
| `fetch()` with headers/body | ✅ Yes | Implemented |
| `response.body` as `ReadableStream` | ✅ Yes — `parseSseStream` iterates it | Implemented |
| `for await (const chunk of body)` | ✅ Yes | Implemented |
| `TextDecoder` with `{ stream: true }` | ✅ Yes | Implemented |
| `AbortSignal.timeout` | ❌ Not used | Deferred per user |
| `Bun.readableStreamToText()` | ❌ Not used — custom SSE parser | Custom parser is fine for SSE |
| `Bun.ArrayBufferSink` | ❌ Not used | Future — incremental buffer building |

**Assessment:** `llm.ts` has a robust custom SSE parser that handles chunk boundaries and tool call accumulation. It correctly streams the response body. `AbortSignal.timeout` is the one Bun feature deferred here.

---

### 2.7 `src/types.ts` — Type gaps vs Bun docs

| Type | Status | Notes |
|------|--------|-------|
| `KeyPoolEntry` | Missing stats fields | `totalRequests`, `total429s`, `totalErrors`, `lastUsedAt`, `last429At`, `lastErrorAt`, `active` — per `agents/key-stats-spec.md` |
| `SpawnJob` | Missing `resourceUsage` | Could add `maxRSS`, `cpuTime` from `proc.resourceUsage()` |
| `AgentConfig` | Has `maxIterations`, `maxHistoryMessages`, `enableCompaction` | Matches current code |
| `Role` | Includes `'summary'` | Compaction uses `'system'` role now (per issues.md fix) |

---

## 3. What needs cleanup / changes

### Immediate (no new deps, all Bun-native)

1. **Replace `crypto.randomUUID()` with `Bun.randomUUIDv7()`** in `src/runtime.ts` `uid()` — monotonic, sortable IDs for sessions and jobs.
2. **Replace custom `sleep()` in `src/http.ts` with `Bun.sleep()`** — native, cleaner.
3. **Replace hardcoded ANSI `C` object in `src/cli.ts` with `Bun.color()`** — zero-dependency, auto-detects terminal color depth.
4. **Add `KeyPoolEntry` stats fields** per `agents/key-stats-spec.md` — `totalRequests`, `total429s`, `totalErrors`, `lastUsedAt`, `last429At`, `lastErrorAt`, `active`.

### Deferred (per user instruction)

5. **`timeout` on `Bun.spawnSync`** in `src/tools/shell.ts` — not now.
6. **`maxBuffer` on `Bun.spawnSync`** — not now.
7. **`resourceUsage()` capture** — low priority future QoL.

### Future UI (P2/P3)

8. **`Bun.markdown.render()`** for ANSI-rendered assistant responses in conversation screen.
9. **`Bun.stringWidth()` / `Bun.wrapAnsi()`** for dashboard table alignment.
10. **`Bun.inspect.table()`** for Statistics screen.
11. **Session persistence** with `Bun.file()` / `Bun.write()` to `.clanka/sessions/`.

---

## 4. Docs cleanup recommendations

### `agents/bun-docs-analysis.md` (already written)
Keep as reference. It summarizes what each Bun doc covers and what's useful.

### `agents/temp/` — DELETED
Was redundant scratchpad. Removed.

### `agents/` folder — current state (clean)

```
README.md          — folder purpose
vision.md          — desired end state
current-state.md   — what exists now
todo.md            — task list
issues.md          — fixed issues, compaction on hold
dashboard-spec.md  — dashboard/navigation screens
limitations-plan.md — MAX_ITERATIONS removal, limitations
key-stats-spec.md  — API key usage tracking spec
progress.md        — progress tracker
bun-docs-analysis.md — Bun docs reference (new)
code-vs-docs.md    — this file (new)
```

---

## 5. Bottom line

clanka already uses Bun native `fetch`, `Bun.spawnSync`, `Bun.file()`, `Bun.write()`, and `TextDecoder` correctly. It's dependency-free as intended. The main gaps vs Bun docs are:

1. **`Bun.randomUUIDv7()`** instead of `crypto.randomUUID()` — easy win
2. **`Bun.sleep()`** instead of custom sleep — easy win
3. **`Bun.color()`** instead of hardcoded ANSI — easy win, improves dashboard
4. **`KeyPoolEntry` stats fields** — per existing spec, not yet implemented
5. **`timeout`/`maxBuffer`/`resourceUsage`** on shell tool — deferred per user

No heavy dependencies needed. Everything is available in Bun's standard library.
