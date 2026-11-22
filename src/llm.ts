import type { Message, ToolCall, ToolDefinition, LLMResult } from './types';
import { httpClient } from './http';

// Minimal OpenAI-compatible chat/completions client using Bun's native `fetch`.
// No `openai` npm dependency. Each call carries its own apiKey / baseURL / model
// so agents can run in parallel with different credentials.
//
// All HTTP goes through HttpClient which owns the API key pool,
// proactive rotation (<40 RPM per key), and reactive swap on 429.

function toOpenAIMessage(m: Message) {
    const out: any = { role: m.role, content: m.content };
    if (m.name) out.name = m.name;
    if (m.tool_call_id) out.tool_call_id = m.tool_call_id;
    if (m.tool_calls?.length) {
        out.tool_calls = m.tool_calls.map(tc => ({
            id: tc.id,
            type: tc.type,
            function: { name: tc.function.name, arguments: tc.function.arguments },
        }));
    }
    return out;
}

function toOpenAITools(tools?: ToolDefinition[]) {
    if (!tools?.length) return undefined;
    return tools.map(t => ({
        type: 'function' as const,
        function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
        },
    }));
}

/**
 * Parse a single SSE event line block into a parsed JSON object.
 * Returns null if the event is empty, [DONE], or unparseable.
 */
function parseSseEvent(data: string): any | null {
    if (!data || data === '[DONE]') return null;
    try {
        return JSON.parse(data);
    } catch {
        return null;
    }
}

/**
 * Robust SSE stream parser.
 * Handles chunk boundaries splitting events across multiple reads.
 * Accumulates partial events in a buffer and only processes complete
 * `\n\n`-delimited events.
 */
async function* parseSseStream(
    body: any,
): AsyncGenerator<{ text?: string; toolCalls?: ToolCall[] }> {
    const decoder = new TextDecoder();
    let buffer = '';

    // Tool call accumulator: index -> { id, name, args }
    const toolCalls: Record<number, { id?: string; name?: string; args: string }> = {};

    for await (const chunk of body) {
        buffer += decoder.decode(chunk, { stream: true });

        // Process all complete events in the buffer
        let parts: string[];
        [parts, buffer] = splitCompleteEvents(buffer);

        for (const event of parts) {
            const sep = event.indexOf(':');
            if (sep === -1) continue;
            const field = event.slice(0, sep).trim();
            const data = event.slice(sep + 1).trimStart();

            if (field !== 'data') continue;

            const parsed = parseSseEvent(data);
            if (!parsed) continue;

            for (const choice of parsed.choices ?? []) {
                const delta = choice.delta ?? {};

                if (delta.content) {
                    yield { text: delta.content };
                }

                if (delta.tool_calls?.length) {
                    for (const tc of delta.tool_calls) {
                        let slot = toolCalls[tc.index];
                        if (!slot) slot = toolCalls[tc.index] = { args: '' };
                        if (tc.id) slot.id = tc.id;
                        if (tc.function?.name) slot.name = tc.function.name;
                        if (tc.function?.arguments) slot.args += tc.function.arguments;
                    }
                }
            }
        }
    }

    // Flush any remaining buffered tail (non-SSE or last event without trailing \n\n)
    if (buffer.trim()) {
        const sep = buffer.indexOf(':');
        if (sep !== -1) {
            const field = buffer.slice(0, sep).trim();
            const data = buffer.slice(sep + 1).trimStart();
            if (field === 'data') {
                const parsed = parseSseEvent(data);
                if (parsed) {
                    for (const choice of parsed.choices ?? []) {
                        const delta = choice.delta ?? {};
                        if (delta.content) {
                            yield { text: delta.content };
                        }
                        if (delta.tool_calls?.length) {
                            for (const tc of delta.tool_calls) {
                                let slot = toolCalls[tc.index];
                                if (!slot) slot = toolCalls[tc.index] = { args: '' };
                                if (tc.id) slot.id = tc.id;
                                if (tc.function?.name) slot.name = tc.function.name;
                                if (tc.function?.arguments) slot.args += tc.function.arguments;
                            }
                        }
                    }
                }
            }
        }
    }

    yield {
        toolCalls: Object.values(toolCalls)
            .filter(s => s.id && s.name)
            .map(s => ({
                id: s.id!,
                type: 'function' as const,
                function: { name: s.name!, arguments: s.args },
            })),
    };
}

/**
 * Split buffer into complete SSE events and leftover partial.
 * Returns [completeEvents, leftoverBuffer].
 */
function splitCompleteEvents(buffer: string): [string[], string] {
    const events: string[] = [];
    let remaining = buffer;

    while (true) {
        const idx = remaining.indexOf('\n\n');
        if (idx === -1) break;
        const event = remaining.slice(0, idx);
        remaining = remaining.slice(idx + 2);
        if (event.trim()) events.push(event);
    }

    return [events, remaining];
}

export async function llmComplete(opts: {
    baseURL: string;
    apiKey: string;
    model: string;
    system?: string;
    messages: Message[];
    tools?: ToolDefinition[];
    stream?: (text: string) => void | Promise<void>;
}): Promise<LLMResult> {
    const { baseURL, apiKey, model, system, messages, tools, stream } = opts;

    const body: any = {
        model,
        messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages.map(toOpenAIMessage)],
        stream: true,
    };
    if (tools) body.tools = toOpenAITools(tools);

    const url = baseURL.replace(/\/$/, '') + '/chat/completions';

    const response = await httpClient.request({
        url,
        model,
        baseURL,
        headers: {
            'Content-Type': 'application/json',
        },
        method: 'POST',
        body: JSON.stringify(body),
        fallbackApiKey: apiKey,
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`LLM request failed (${response.status}): ${text}`);
    }

    if (!response.body) {
        throw new Error('LLM response had no body');
    }

    let text = '';
    let toolCalls: ToolCall[] = [];

    for await (const chunk of parseSseStream(response.body as any)) {
        if (chunk.text) {
            text += chunk.text;
            await stream?.(chunk.text);
        }
        if (chunk.toolCalls?.length) {
            toolCalls = chunk.toolCalls;
        }
    }

    return { text, toolCalls };
}
