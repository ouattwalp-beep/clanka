# Limitations Plan

## What MAX_ITERATIONS was (and is now)

**Was:** A hard cap of `12` tool-calling loops inside `Agent.run()`. If the LLM kept requesting tool calls, the agent would stop after 12 rounds and return whatever text it had.

**Now:** Removed entirely. The agent loops **infinitely** — it continues executing tool calls until the LLM returns plain text with no tool calls. The LLM controls when to stop.

**Future plan:** Make it configurable via `AgentConfig.maxIterations`:
- Default: `Infinity` (current behavior)
- Option to set a finite number (e.g., `12`) for cost/runway control
- Option to explicitly set `Infinity` for unbounded runs

---

## Known limitations and planned fixes

### 1. Delegate tool description is static — RESOLVED
**Problem (historical):** The `delegate` tool description listed available agents at `Agent` construction time, potentially going stale.
**Current state:** **RESOLVED.** `availableTools()` calls `this.runtime.listAgents()` fresh on every invocation and rebuilds the `delegate` description dynamically. No code change needed. Marked as verified.

### 2. No tests
**Problem:** No test suite exists. Regressions in session switching, delegation, spawning, or key rotation won't be caught.
**Fix:** Add a minimal test suite using Bun's built-in test runner (no heavy dependencies).
**Tests to add:**
- `src/http.test.ts` — key pool proactive rotation (<40 RPM), reactive 429 swap
- `src/runtime.test.ts` — agent CRUD, session CRUD, spawn job lifecycle
- `src/agent.test.ts` — tool execution, delegate sync call, spawn async fire-and-forget
- `src/cli.test.ts` — slash command parsing

### 3. Fire-and-forget spawn dies if process exits
**Problem:** Spawned child agents run as un-awaited promises. If the Bun REPL process exits (`/exit`, Ctrl+C, crash), background spawn jobs die mid-task.
**Status:** Accepted trade-off for a shell REPL.
**Optional future:** Persist spawn jobs to disk so they can be resumed on restart.

### 4. Yolo mode not implemented
**Problem:** `cli.confirm` exists but isn't wired to tool execution. Every shell/agent tool call requires manual y/n confirmation.
**Fix:**
- Add `yoloMode: boolean` to runtime state
- Add `/yolo on` and `/yolo off` slash commands
- In `Agent.run()` / `sendToAgent()`, skip confirmation when yolo is on

---

## Priority order (recommended)

| Order | Item | Effort |
|-------|------|--------|
| 1 | ✅ Verify delegate description is dynamic — DONE | Low |
| 2 | Implement Yolo mode (`/yolo on` / `/yolo off`) | Medium |
| 3 | Add test suite | Medium |
| 4 | Make `maxIterations` configurable (default `Infinity`) | Low |
| 5 | Persist spawn jobs to disk (optional) | High |

---

## Current todo status

See `agents/todo.md` for the full list. Key remaining items:
- Yolo mode (`/yolo on` / `/yolo off`)
- `/jobs` slash command for background spawn jobs
- Session persistence to disk
- Config file (`.clanka/config.json`)
- Dashboard & Navigation screens (Dashboard, Conversation, Archived Chats, Statistics)
- `/btw` deferred messages
