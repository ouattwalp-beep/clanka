import type { ToolDefinition, ToolContext } from '../types';

const DANGEROUS_PATTERNS = [
    /rm\s+-rf\s+\//,
    /rm\s+-\s*rf\s+\//,
    /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/,
    /mkfs\./,
    /dd\s+if=/,
    />\s*\/dev\/sda/,
];

function isDangerous(command: string): string | null {
    for (const pattern of DANGEROUS_PATTERNS) {
        if (pattern.test(command)) {
            return command;
        }
    }
    return null;
}

export const data: ToolDefinition = {
    name: 'shell',
    description: 'Run a shell command and return the result as JSON.',
    parameters: {
        type: 'object',
        properties: {
            command: { type: 'string', description: 'The shell command to execute' },
        },
        required: ['command'],
    },
    handler: async (args: Record<string, any>, ctx: ToolContext) => {
        const command = args.command;

        const dangerous = isDangerous(command);
        if (dangerous) {
            return JSON.stringify({
                success: false,
                exitCode: -1,
                stdout: '',
                stderr: `Blocked potentially dangerous command: ${dangerous.slice(0, 80)}`,
                pid: null,
                exitedDueToTimeout: false,
                exitedDueToMaxBuffer: false,
                signalCode: null,
                agent: ctx.agentName,
                blocked: true,
            });
        }

        const result = Bun.spawnSync({ cmd: ['bash', '-lc', command] });
        return JSON.stringify({
            success: result.success,
            exitCode: result.exitCode,
            stdout: result.stdout.toString('utf8'),
            stderr: result.stderr.toString('utf8'),
            pid: result.pid,
            exitedDueToTimeout: result.exitedDueToTimeout ?? false,
            exitedDueToMaxBuffer: result.exitedDueToMaxBuffer ?? false,
            signalCode: result.signalCode,
            agent: ctx.agentName,
            blocked: false,
        });
    },
};

export default data;
