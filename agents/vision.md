# Vision / What the User Wants

The project is called **clanka**: a dependency-free, shell-based interface to LLMs.

Desired end state (modeled loosely on Claude Code / claude for shell):

1. **Multichat** — multiple concurrent chat sessions. Users can create, list, switch between, and delete sessions. Each session keeps its own history.
2. **Agents** — an agent is a configurable LLM worker with its own:
   - model (e.g. `nemotron`, `gpt-4o`, `claude-3-sonnet`)
   - API key (so different agents can use different keys in parallel)
   - base URL (OpenAI-compatible endpoint)
   - system prompt
   - allowed tools
3. **Agents running agents** — hierarchical delegation. An agent can invoke another agent as a tool (sub-contracting). The child agent runs with its own key/model and reports back to the parent.
4. **Dependency-free** — minimize npm dependencies. Prefer native `fetch` (Bun has it) over the `openai` SDK. Keep `package.json` lean so it's easy to drop anywhere.
5. **Scalable / parallel** — many agents can run simultaneously with different keys and models. No global singleton chat state.
6. **Shell UI** — interactive REPL with slash commands (`/chat`, `/agent`, `/model`, `/key`, `/tools`, `/exit`, etc.), streaming output, and colored/formatted text.

The user is OK with a big rewrite. The current code is "sketchy" but the dependency-free, multi-key, multi-model property must be preserved and improved.

## HTTP layer requirement (to be implemented)

**Single fetch wrapper class** — All agents' HTTP requests must go through one class wrapper that:
- Centralizes every `fetch` call to the LLM API (no agent constructs its own fetch).
- Owns rate-limit handling and API key rotation.

**API key pool** — Keys live in a pool file (e.g. `.clanka/keys.json` or similar). Each entry should track:
- The API key string
- Which model/baseURL it maps to (optional)
- Request count in the current minute
- Last swap timestamp

**Key swap behavior:**
1. **Proactive swap**: Before 40 requests are made in a single minute, automatically swap to the next key in the pool (stay under the 40 RPM limit).
2. **Reactive swap on 429**: On a 429 response, do NOT wait/retry. Immediately swap to the next key in the pool and re-issue the request with the new key.
3. Round-robin or least-recently-used rotation across the pool.

**Concurrency** — Multiple agents running in parallel must share the same key pool and coordinate swap state so two agents don't burn the same key simultaneously.
