export default class SSE {
    static async *text(readableStream: ReadableStream<Uint8Array>) {
        let buffer = ''

        const decoder = new TextDecoder()

        for await (const chunk of readableStream) {
            buffer += decoder.decode(chunk, {stream: true})

            const events = buffer.split('\n\n')

            buffer = events.pop()!

            for (const event of events)
                yield event
        }
    }

    static async *json(readableStream: ReadableStream<Uint8Array>) {
        for await (const event of this.text(readableStream))
            yield JSON.parse(event)
    }

    static async *raw(readableStream: ReadableStream<Uint8Array>) {
        for await (const event of this.text(readableStream)) {
            const separator = event.indexOf(':')

            const name = event.slice(0, separator)

            if (name !== 'data')
                continue

            const data = event.slice(separator + 2)

            if (!data)
                continue
            
            if (data === '[DONE]')
                continue

            yield data
        }
    }

    static async *relay(readableStream: ReadableStream<Uint8Array>) {
        for await (const event of this.raw(readableStream))
            yield event + '\n\n'
    }
}