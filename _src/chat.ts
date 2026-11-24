export class Client {
    endpoint
    apiKeys

    constructor({
        endpoint = 'https://integrate.api.nvidia.com/v1',
        apiKeys
    }: {
        endpoint?: string,
        apiKeys: string[]
    }) {
        this.endpoint = endpoint
        this.apiKeys = apiKeys
    }

    async fetch(resource: string, body?: any) {
        const response = await fetch(`https://integrate.api.nvidia.com/v1/${resource}`, {
            headers: {
                authorization: `Bearer ${this.apiKeys[0]}`
            },
            method: body ? 'POST' : 'GET',
            body: body ? JSON.stringify(body) : undefined
        })

        return response
    }

    static async *stream<T>(readableStream: ReadableStream) {
        let buffer = ''

        const textDecoder = new TextDecoder

        for await (const chunk of readableStream) {
            buffer += textDecoder.decode(chunk, {stream: true})

            const events = buffer.split('\n\n')

            buffer = events.pop()!

            for (const event of events) {
                const separator = event.indexOf(':')

                const name = event.slice(0, separator)

                if (name !== 'data')
                    continue

                const data = event.slice(separator + 2)

                if (!data)
                    continue
                
                if (data === '[DONE]')
                    continue
                
                yield JSON.parse(data) as T
            }
        }
    }
}

import type {
    ChatCompletionCreateParams,
    ChatCompletionChunk,

    ChatCompletionMessageToolCall,
    ChatCompletionMessageFunctionToolCall,
    ChatCompletionMessageCustomToolCall,

    ChatCompletion
} from 'openai/resources'

// https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create/
export class Chat {
    model
    messages
    tools

    params

    constructor({
        model = 'nvidia/nemotron-3.5-super-vl-120b-a12b',
        messages = [],
        tools,

        ...params
    }: Partial<ChatCompletionCreateParams> = {}) {
        this.model = model
        this.messages = messages
        this.tools = tools

        this.params = params
    }

    static parseCompletionChunk(
        chunk: ChatCompletionChunk & {choices: (ChatCompletionChunk.Choice & {delta: ChatCompletionChunk.Choice.Delta & {reasoning_content?: string}})[]},
        completion: (ChatCompletion & {choices: (ChatCompletion.Choice & {message: ChatCompletion.Choice['message'] & {reasoning_content?: string, tool_calls?: (ChatCompletionMessageToolCall & {function?: ChatCompletionMessageFunctionToolCall.Function, custom?: ChatCompletionMessageCustomToolCall.Custom})[]}})[]})
    ) {
        if (chunk.id)
            completion.id = chunk.id

        if (chunk.created)
            completion.created = chunk.created

        if (chunk.model)
            completion.model = chunk.model

        if (chunk.moderation)
            completion.moderation = chunk.moderation

        if (chunk.usage)
            completion.usage = chunk.usage

        for (const choice of chunk.choices) {
            let messageChoice = completion.choices[choice.index]

            if (!messageChoice)
                completion.choices[choice.index] = messageChoice = {
                    index: choice.index,
                    message: {
                        role: 'assistant',
                        content: null,
                        refusal: null
                    },
                    finish_reason: 'stop',
                    logprobs: null
                }

            if (choice.logprobs)
                messageChoice.logprobs = choice.logprobs

            if (choice.finish_reason)
                messageChoice.finish_reason = choice.finish_reason

            const delta = choice.delta

            if (delta.reasoning_content)
                if (messageChoice.message.reasoning_content)
                    messageChoice.message.reasoning_content += delta.reasoning_content
                else
                    messageChoice.message.reasoning_content = delta.reasoning_content

            if (delta.content)
                if (messageChoice.message.content)
                    messageChoice.message.content += delta.content
                else
                    messageChoice.message.content = delta.content

            if (delta.refusal)
                if (messageChoice.message.refusal)
                    messageChoice.message.refusal += delta.refusal
                else
                    messageChoice.message.refusal = delta.refusal
            
            if (delta.tool_calls?.length) {
                let tool_calls = messageChoice.message.tool_calls

                if (!tool_calls)
                    messageChoice.message.tool_calls = tool_calls = []

                for (const tool_call of delta.tool_calls) {
                    let choiceToolCall = tool_calls[tool_call.index]

                    if (!choiceToolCall)
                        tool_calls[tool_call.index] = choiceToolCall = {} as NonNullable<typeof choiceToolCall>

                    if (tool_call.id)
                        choiceToolCall.id = tool_call.id

                    if (tool_call.type)
                        choiceToolCall.type = tool_call.type

                    if (tool_call.function) {
                        let function_call = choiceToolCall.function
                        
                        if (!function_call)
                            choiceToolCall.function = function_call = {} as NonNullable<typeof function_call>

                        if (tool_call.function.name)
                            if (function_call.name)
                                function_call.name += tool_call.function.name
                            else
                                function_call.name = tool_call.function.name

                        if (tool_call.function.arguments)
                            if (function_call.arguments)
                                function_call.arguments += tool_call.function.arguments
                            else
                                function_call.arguments = tool_call.function.arguments
                    }

                    if (tool_call.custom) {
                        let custom_call = choiceToolCall.custom
                        
                        if (!custom_call)
                            choiceToolCall.custom = custom_call = {} as NonNullable<typeof custom_call>

                        if (tool_call.custom.name)
                            if (custom_call.name)
                                custom_call.name += tool_call.custom.name
                            else
                                custom_call.name = tool_call.custom.name

                        if (tool_call.custom.input)
                            if (custom_call.input)
                                custom_call.input += tool_call.custom.input
                            else
                                custom_call.input = tool_call.custom.input
                    }
                }
            }
        }
    }
    
    async completion(messages: ChatCompletionCreateParams['messages'], stream?: typeof Chat.parseCompletionChunk) {
        const response = await this.fetch('chat/completions', {
            ...this.params,
            model: this.model,
            messages: [...this.messages, ...messages],
            tools: this.tools,
            stream: true
        } as ChatCompletionCreateParams)

        if (!response.ok) {
            // handle 429
            return
        }

        const completion: ChatCompletion = {
            id: undefined as unknown as string,
            created: undefined as unknown as number,
            model: this.model,
            metadata: this.params.metadata,
            choices: [],
            object: 'chat.completion'
        }

        if (response.body)
            for await (const chunk of Client.stream<Parameters<typeof Chat.parseCompletionChunk>[0]>(response.body)) {
                await stream?.(chunk, completion)
                Chat.parseCompletionChunk(chunk, completion)
            }

        return completion
    }
}