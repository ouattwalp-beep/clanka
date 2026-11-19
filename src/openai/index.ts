export {OpenAIChat} from './chat'

export default class OpenAI {
    baseURL
    apiKey
    constructor({
        baseURL = 'https://integrate.api.nvidia.com/v1' as `https://${string}/v1`,
        apiKey
    }: {
        baseURL?: string
        apiKey?: string
    } = {
        baseURL: process.env.OPENAI_BASE_URL,
        apiKey: process.env.OPENAI_API_KEY
    }) {
        this.baseURL = baseURL
        this.apiKey = apiKey
    }

    fetch(resource: string, body?: any) {
        return fetch(`${this.baseURL}/${resource}`, {
            headers: {
                authorization: `Bearer ${this.apiKey}`
            },
            method: body ? 'post' : 'get',
            body: body ? JSON.stringify(body) : undefined
        })
    }

    async *stream(readableStream: ReadableStream) {
        let buffer = ''

        const textDecoder = new TextDecoder

        for await (const chunk of readableStream) {
            buffer += textDecoder.decode(chunk)

            const events = buffer.split('\n\n')

            buffer = events.pop()!

            for (const event of events) {
                const separator = event.indexOf(':')

                const data = event.slice(separator + 2)

                if (!data)
                    continue

                if (data === '[DONE]')
                    return

                yield JSON.parse(data)
            }
        }
    }
}