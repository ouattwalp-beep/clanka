/*
handle fetch error
expose chat completion stream
*/

import Chat from './chat'

import {tools, run} from './tools'

import * as cli from './cli'

const chat = new Chat({
    tools
})

async function print(...[chunk, completion]: Parameters<typeof Chat.parseCompletionChunk>) {
    const index = 0

    const choice = chunk?.choices[index]

    if (!choice)
        return

    if (choice.delta.reasoning_content)
        await cli.output(choice.delta.reasoning_content)
    
    if (choice.delta.content) {
        if (!completion.choices[index]?.message.content)
            console.log('\n')

        await cli.output(choice.delta.content)
    }
}

async function generator(...messages: Parameters<typeof chat.completion>[0]): Promise<void> {
    await cli.output('assistant: ')

    const completion = await chat.completion(messages, print)

    console.log('\n')

    const choice = completion?.choices[0]

    if (!choice)
        return

    chat.messages.push(...messages, choice.message)

    if (choice.message.tool_calls?.length) {
        const calls = []
        for (const tool_call of choice.message.tool_calls)
            if (tool_call.type === 'function') {
                const name = tool_call.function.name
                const args = JSON.parse(tool_call.function.arguments) 
                console.log(`tool: ${name}`, args)
                console.log()

                const execute = await cli.confirm('execute')
                console.log()

                if (!execute)
                    return

                const tool_result = await run(name, args)
                
                calls.push({
                    role: 'tool' as const,
                    tool_call_id: tool_call.id,
                    content: tool_result
                })
            }

            if (!calls.length)
                return

            return generator(...calls)
        }

    return main()
}

async function main() {
    const content = await cli.input('user')

    console.log()

    return generator({
        role: 'user' as const,
        content
    })
}

await main()