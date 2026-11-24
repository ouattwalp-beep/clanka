import type {ChatCompletionTool} from 'openai/resources'

// https://json-schema.org/understanding-json-schema/reference/array
export const tools: ChatCompletionTool[] = []

const functions: {[name: string]: Function} = {}

export function add(tool: {data: ChatCompletionTool, default: Function}) {
    tools.push(tool.data)
    functions[tool.data.type === 'function' ? tool.data.function.name : tool.data.custom.name] = tool.default
}

export async function run(name: string, ...args: any) {
    return functions[name]?.(...args)
}

add(await import('./shell'))