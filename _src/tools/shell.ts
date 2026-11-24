export const data = {
    type: 'function' as const,
    function: {
        name: 'shell',
        parameters: {
            type: 'object',
            properties: {
                command: {
                    type: 'string'
                }
            }
        },
        required: ['command']
    }
}

export default function({command}: {command: string}): string {
    const result = Bun.spawnSync({cmd: ['bash', '-lc', command]})

    return JSON.stringify({
        success: result.success,
        exitCode: result.exitCode,
        stdout: result.stdout.toString('utf8'),
        stderr: result.stderr.toString('utf8'),
        pid: result.pid,
        exitedDueToTimeout: result.exitedDueToTimeout ?? false,
        exitedDueToMaxBuffer: result.exitedDueToMaxBuffer ?? false,
        signalCode: result.signalCode
    })
}