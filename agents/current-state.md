# Current State (as of rewrite)

## What exists
A small Bun + TypeScript CLI called `clanka`.

Files:
- `src/cli.ts` — `output`, `input`, `option`, `confirm` helpers for the terminal.
- `src/chat.ts` — `Chat` class: OpenAI-compatible streaming completion client. Uses raw `fetch` but imports types from the `openai` package. Hardcodes default base URL to NVIDIA integrate API.
- `src/tools/shell.ts` — `shell` tool: runs `bash -lc <command>` via `Bun.spawnSync`, returns JSON result.
- `src/tools/index.ts` — tool registry (`add`, `run`). Currently only registers `shell`.
- `src/index.ts` — single linear loop: read user input → one completion → handle tool calls → recurse → back to prompt. One global `Chat` instance. One API key/model from `.env`.

## Limitations vs vision
- No multichat / sessions. Only one conversation at a time.
- No agent concept. No per-agent model, key, base URL, or system prompt.
- No agent delegation (agents cannot call other agents).
- UI is a bare prompt (`user: `). No slash commands, no session switching, no formatting.
- Still depends on the `openai` npm package for types (user wants dependency-free).
- Tool execution is not interruptible/confirm-gated (confirm code is commented out).
- No persistence of sessions to disk.

## What to keep
- Bun native `fetch` and `Bun.spawnSync`.
- ESM / TypeScript module style.
- Shell tool returning JSON.
- The general streaming-chunk parsing logic in `chat.ts` (can be ported to a dependency-free `llm.ts`).
