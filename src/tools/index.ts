import type { ToolDefinition, ToolContext } from '../types';
import shellData from './shell';

const tools = new Map<string, ToolDefinition>();

export function register(tool: ToolDefinition) {
    tools.set(tool.name, tool);
}

export function get(name: string): ToolDefinition | undefined {
    return tools.get(name);
}

export function list(): ToolDefinition[] {
    return [...tools.values()];
}

export async function run(name: string, args: Record<string, any>, ctx: ToolContext): Promise<string> {
    const tool = tools.get(name);
    if (!tool) {
        return JSON.stringify({ error: `unknown tool: ${name}` });
    }
    try {
        return await tool.handler(args, ctx);
    } catch (err: any) {
        return JSON.stringify({ error: err?.message ?? String(err) });
    }
}

register(shellData);
