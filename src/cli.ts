import readline from 'readline';

const out = Bun.stdout.write.bind(Bun.stdout)

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
})

const lineQueue: string[] = []
let lineResolve: ((line: string) => void) | null = null

rl.on('line', (line) => {
    if (lineResolve) {
        const resolve = lineResolve
        lineResolve = null
        resolve(line)
    } else {
        lineQueue.push(line)
    }
})

export async function write(s: string): Promise<void> {
    await out(s)
}

export async function writeLine(s = ''): Promise<void> {
    await out(s + '\n')
}

export async function input(prefix?: string): Promise<string> {
    if (prefix) await out(prefix)

    if (lineQueue.length > 0) {
        return lineQueue.shift()!
    }

    return new Promise<string>((resolve) => {
        lineResolve = resolve
    })
}

export const C = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    italic: '\x1b[3m',
    underline: '\x1b[4m',

    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m',
} as const

export function color(code: string, s: string): string {
    return `${code}${s}${C.reset}`
}

export interface ParsedCommand {
    cmd: string
    args: string[]
}

export function parseCommand(line: string): ParsedCommand | null {
    const trimmed = line.trim()
    if (!trimmed.startsWith('/')) return null
    const [cmd, ...rest] = trimmed.slice(1).split(/\s+/).filter(Boolean)
    if (!cmd) return null
    return { cmd, args: rest }
}

export async function confirm(question = 'confirm'): Promise<boolean> {
    const line = await input(`${question}? [y/N]`)
    return /^y(es)?$/i.test(line.trim())
}
