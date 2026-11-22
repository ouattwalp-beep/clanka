# Bun Docs Analysis — Useful for clanka

Source: `docs/bun/*.md` (fetch, child-process, color, markdown, repl, streams, binary-data, utils)

Purpose: Capture Bun-native APIs that can improve or replace parts of clanka without adding npm dependencies.

---

## 1. fetch (docs/bun/fetch.md)

clanka already uses Bun `fetch` via `src/http.ts` and `src/llm.ts`. Relevant extensions:

| Feature | Relevance to clanka | Status |
|---------|---------------------|--------|
| `AbortSignal.timeout(ms)` | Request timeout for hung LLM API calls | **Deferred** — user said no timeouts for now |
| `fetch.preconnect(host)` | Warm up DNS/TCP/TLS to LLM endpoint before first request | Future optimization |
| `Bun.FetchSession` | Connection pooling + per-session TLS/proxy/keepalive. Could isolate agent key pools | Future |
| `proxy` option | Route LLM calls through a proxy (enterprise) | Future |
| `tls` option | Client certs, `rejectUnauthorized: false` for self-signed CAs | Future |
| `verbose: true` | Debug request/response headers to stderr | Useful for debugging |
| `response.body` streaming | `for await (const chunk of response.body)` — already used in SSE parser | Implemented |
| `BUN_CONFIG_MAX_HTTP_REQUESTS` | Raise simultaneous fetch limit (default 256) | Future if needed |

---

## 2. child-process / spawn (docs/bun/child-process.md)

`src/tools/shell.ts` uses `Bun.spawnSync`. Relevant options:

| Feature | Relevance | Status |
|---------|-----------|--------|
| `timeout` (ms) | Kill hanging shell commands | **Deferred** per user |
| `maxBuffer` | Cap shell output size | **Deferred** per user |
| `resourceUsage()` | maxRSS, CPU time after process exits | **Low priority** — future QoL in UI |
| `cwd`, `env` | Run command in specific dir / custom env | Already supported, unused |
| `signal` (AbortController) | Abort a running shell command | Future |
| `terminal` / PTY | Interactive shell with colors, cursor movement, `isTTY=true` | Future — could replace basic shell tool |
| `onExit`, `proc.kill()`, `proc.unref()` | Lifecycle management for spawn jobs | Relevant for `/jobs` and spawn cleanup |
| IPC between Bun processes | Parent ↔ child agent messaging | Future — could replace current job store |

`Bun.spawnSync` returns `SyncSubprocess` with `stdout: Buffer`, `stderr: Buffer`, `exitCode`, `success`, `resourceUsage`, `exitedDueToTimeout`.

---

## 3. color (docs/bun/color.md)

`Bun.color(input, format)` — zero-dependency color formatting.

| Format | Use in clanka |
|--------|---------------|
| `"ansi"` | Auto-detect terminal color depth, output ANSI escape codes |
| `"ansi-16"` / `"ansi-256"` / `"ansi-16m"` | Target specific terminal capabilities |
| `"number"` | Store colors compactly in config/DB |
| `"{rgba}"` / `"[rgb]"` | Extract RGB components |

Currently `src/cli.ts` uses hardcoded ANSI constants (`C` object). `Bun.color` could replace that for dashboard status colors, key usage highlights, etc.

---

## 4. markdown (docs/bun/markdown.md)

`Bun.markdown.render(text, callbacks, options)` — parse Markdown and render with custom callbacks.

| Callback | Use in clanka |
|----------|---------------|
| `heading`, `paragraph`, `strong`, `emphasis` | Render assistant responses as ANSI in terminal |
| `code`, `codespan` | Syntax-highlight code blocks inline |
| `link`, `image` | Render links/images in chat |
| `listItem` | Nested lists with markers |

Example — ANSI output:
```ts
Bun.markdown.render("# Hello\n\nThis is **bold**", {
  heading: (c, {level}) => `\x1b[1;4m${c}\x1b[0m\n`,
  paragraph: c => c + "\n",
  strong: c => `\x1b[1m${c}\x1b[22m`,
});
```

Listed as P2 in todo.md ("Markdown rendering in terminal (basic)"). API is marked **unstable** — may change.

---

## 5. repl (docs/bun/repl.md)

Bun's built-in REPL features that could inform clanka's REPL (`src/cli.ts`):

- Multi-line input (auto-continue on unclosed brackets)
- Persistent history (`~/.bun_repl_history`)
- Tab completion
- Special variables `_`, `_error`
- Commands: `.help`, `.exit`, `.clear`, `.load`, `.save`, `.editor`, `.history`
- Non-interactive: `bun repl -e` / `bun repl -p`

clanka currently has a simple readline loop. These are UI improvements for later phases.

---

## 6. streams (docs/bun/streams.md)

- `ReadableStream`, `WritableStream` — already used in `src/llm.ts` SSE parser
- Direct `ReadableStream` (`type: "direct"`) with `controller.write()` — lower-overhead streaming
- `Bun.readableStreamToText(stream)`, `Bun.readableStreamToBytes(stream)`, `Bun.readableStreamToArrayBuffer(stream)` — convenient stream consumers
- `Bun.ArrayBufferSink` — incremental buffer builder for unknown-size data
- Backpressure handling via `controller.write()` returning `Promise<number>`

---

## 7. binary-data (docs/bun/binary-data.md)

- `Buffer` (subclass of `Uint8Array`) — Node-compatible binary buffer
- `Uint8Array.toBase64()`, `fromBase64()`, `toHex()`, `fromHex()` — encoding helpers
- `TextEncoder` / `TextDecoder` — string ↔ bytes
- `Bun.file(path)` — lazily-loaded file (`BunFile`, subclass of `Blob`)
- `Blob`, `File` — binary data containers
- `ArrayBuffer`, `DataView` — low-level binary views

Relevant to `src/tools/shell.ts` if binary output handling is ever needed.

---

## 8. utils (docs/bun/utils.md)

High-value APIs for clanka:

| API | Use case |
|-----|----------|
| `Bun.randomUUIDv7()` | Session IDs, job IDs, spawn job IDs (monotonic, sortable) |
| `Bun.stringWidth(input)` | Terminal column width for dashboard table alignment |
| `Bun.wrapAnsi(input, cols)` | Wrap text at terminal width, preserving ANSI codes |
| `Bun.stripANSI(text)` | Remove colors from output for logging/plain display |
| `Bun.color(input, "ansi")` | Replace hardcoded ANSI in `cli.ts` |
| `Bun.inspect.table(data, props, {colors: true})` | Statistics screen tables |
| `Bun.sleep(ms)` | Rate-limit delays, retry backoff |
| `Bun.which(bin)` | Locate executables (e.g. check if `bash` exists) |
| `Bun.file(path)` / `Bun.write(path, data)` | Session persistence to `.clanka/sessions/` |
| `Bun.readableStreamToText(stream)` | Consume SSE response bodies |
| `Bun.deepEquals(a, b)` | Compare agent/session configs |
| `Bun.escapeHTML(str)` | Escape HTML if rendering markdown to HTML |
| `Bun.nanoseconds()` | High-precision timing |
| `Bun.resolveSync(specifier, root)` | Module resolution |
| `Bun.gzipSync` / `Bun.gunzipSync` | Compress stored sessions/stats |
| `Bun.peek(promise)` | Check promise status without await (advanced) |

---

## 9. Recommended actions for clanka

**Near term (low effort, high value):**
1. Replace hardcoded ANSI in `src/cli.ts` with `Bun.color()` for dashboard/status colors.
2. Use `Bun.randomUUIDv7()` for session IDs and spawn job IDs.
3. Use `Bun.stringWidth()` / `Bun.wrapAnsi()` for dashboard table column alignment.
4. Use `Bun.file()` / `Bun.write()` for session persistence to `.clanka/sessions/`.

**Deferred (per user):**
- `timeout` and `maxBuffer` on `Bun.spawnSync` in shell tool — not now.
- `resourceUsage()` capture — low priority future QoL.

**Future UI (P2/P3):**
- `Bun.markdown.render()` for ANSI-rendered assistant responses.
- `Bun.inspect.table()` for Statistics screen.
- `Bun.sleep()` for retry backoff in HttpClient.

---

## 10. OpenAI API docs

`docs/openai/api/reference/...` — Chat Completions create + streaming events. Reference for the SSE format clanka's parser handles (`data:`, `[DONE]`, tool call chunks). Already implemented in `src/llm.ts`.

---

**Bottom line:** Bun gives us colors, markdown, UUIDs, string width, file I/O, streams, and spawn — all dependency-free. The most immediately useful for clanka are `Bun.color`, `Bun.randomUUIDv7`, `Bun.stringWidth`, `Bun.wrapAnsi`, `Bun.file`/`Bun.write`, and `Bun.inspect.table`.
