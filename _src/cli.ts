export const output = Bun.stdout.write.bind(Bun.stdout)

export async function input(preffix?: string) {
    if (preffix)
        await output(`${preffix}: `)

    for await (const line of console)
        return line

    return ''
}

export async function option(preffix: string, option: (string | number)[], hint?: string) {
    hint ??= !option?.length ? 'unknown'
    : option.length === 1 ? `${option.at(0)}`
    : `${option.at(0)}/${option.at(-1)}`

    const line = await input(`${preffix} [${hint}]`)

    const sanitized = line.toLowerCase().trim()

    const index = option.indexOf(sanitized)

    if (index > -1)
        return index

    return sanitized
}

export async function confirm(question = 'confirm', unknown?: boolean) {
    do {
        const line = await option(`${question}?`, ['y', 'yes', 'no', 'n'])

        if (typeof line === 'number')
            return !Math.floor(line / 2 % 2)

        if (unknown !== undefined)
            return unknown

        process.stdout.clearLine(0)
    } while (unknown === undefined)

    return false
}