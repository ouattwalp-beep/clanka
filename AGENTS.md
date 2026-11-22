# Agent Context

See `agents/` for the working context for this codebase:

- `agents/README.md` — purpose of this folder
- `agents/vision.md` — what the user wants (multichat, agents, agents running agents, dependency-free)
- `agents/current-state.md` — what exists now
- `agents/todo.md` — what is done and what is to do

This repo (`clanka`) is a Bun/TypeScript shell interface to LLMs. It is intentionally dependency-free
(uses Bun's native `fetch`, no `openai` SDK) so agents can run with different API keys and models
in parallel.
