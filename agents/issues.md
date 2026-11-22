# Issues & Critique — clanka codebase

## ✅ FIXED
1. **Spawn unhandled rejection** — `.catch()` safety net + `finally` cleanup of `spawnJobPromises`
2. **`confirmTool()` default deny** — Now defaults to `true` (allow) when no `onConfirm` wired
3. **`HttpClient.pool`/`index` public** — Made private; added `getPoolSnapshot()` read-only accessor
4. **No graceful shutdown** — Added `runtime.shutdown()` + SIGINT/SIGTERM handlers
5. **Circular type dependency** — Extracted `src/agentInterface.ts`; `types.ts` imports from it, breaking the cycle
6. **`parentId` ignored** — Added `agentLineage` map; `getAgentLineage()` tracks parent-child relationships
7. **No `/agent show`** — Added full agent config display (name, model, baseURL, masked key, system, tools, maxIter, spawnDepth, parent)
8. **`maxIterations` not via CLI** — `/agent new <id> <model> [baseURL] [apiKey] [maxIterations]`
9. **Shell tool no validation** — Blocks `rm -rf /`, fork bombs, `mkfs`, `dd`, etc.
10. **Retry-After / rate-limit header parsing** — Implemented:
    - `DEFAULT_RETRY_WAIT_MS = 15000` (overridable via `CLANKA_RETRY_WAIT_MS` env var)
    - All keys maxed out → wait default 15s, reset stale minutes, retry
    - 429 → rotate past bad key, try next available immediately
    - If all still maxed → honor `Retry-After` header if present, else default 15s wait
    - Added 3 keys to `.clanka/keys.json`
11. **SSE parser fragility** — Rewritten:
    - Robust `\n\n`-delimited event splitting with buffer for chunk boundaries
    - Flushes remaining buffered tail after stream ends
    - Proper field/data separation (only processes `data:` events)
    - Tool calls accumulated across chunks by index
    - Async generator yields `{text}` or `{toolCalls}` chunks

## ✅ Yolo Mode Default On

**Status:** Yolo mode defaults to ON via `CLANKA_YOLO=true` in `.env`.

The runtime reads `process.env.CLANKA_YOLO === "true"` on startup. When on, all tool calls (shell, delegate, spawn) are auto-accepted without confirmation. The prompt shows `[YOLO]` in yellow.

## ⏳ ON HOLD — History Compaction (DISABLED)
**Status:** Compaction is **disabled by default** (`enableCompaction: false` in `src/index.ts`).

**Root cause of failure:** NVIDIA API rejects `summary` message role — only accepts `developer`, `system`, `user`, `assistant`, `tool`, `function`.

**Fix applied:** Changed compaction summary message role from `summary` → `system` (universally accepted). Code in `src/agent.ts` `compactHistory()` now creates a `system` role message.

**Re-enable plan (when ready):**
1. Set `enableCompaction: true` in `src/index.ts` default agent (line 23)
2. Set `enableCompaction: true` in `/agent new` handler (line 158)
3. Monitor: compaction runs before each LLM call and after each tool call iteration
4. Heuristic summary (no extra LLM call): extracts user questions, assistant statements, tool count, shell output — no API cost
5. Never cuts mid-tool-call exchange (keeps extra message if last is assistant tool call without result)
6. Manual trigger: `/agent compact [<id>]`
7. Consider actual compaction later: instead of heuristic, use a cheap LLM call to summarize old messages into one `system` message

**If you want compaction smarter:** Provide your model's context limit (tokens) and I can set `maxHistoryMessages` dynamically based on that, plus track estimated token usage per message.

## Remaining optional work (see agents/todo.md and agents/dashboard-spec.md)
- Dashboard & Navigation screens (Dashboard, Conversation, Archived Chats, Statistics)
- `/jobs` slash command for background spawn jobs
- Session persistence to disk (`.clanka/sessions/`)
- Config file (`.clanka/config.json`)
- Markdown rendering in terminal
- Test suite expansion (agent.compaction, llm.sse, etc.)

## Verification (all green)
- `tsc --noEmit` — clean
- `bun test` — 14 pass, 0 fail
- `bun .` smoke test — works

