export class Input {
    value = ''

    cursor = 0

    line = 0

    lines = ['']

    maxLines = 4

    render() {
        const width = process.stdout.columns

        const lines = [...Input.wrap(this.value, width)]

        process.stdout.cursorTo(0, process.stdout.rows - lines.length - 2)

        let x = 0
        let y = 0
        let length = 0

        for (const line of lines) {
            if (length < this.cursor) {
                x = this.cursor - length
                y++
            }

            length += line.length

            process.stdout.clearLine(0)
            
            process.stdout.write(line)

            process.stdout.moveCursor(-line.length, 1)
        }

        if (y === 0)
            y = 1

        process.stdout.write(`${lines.length} ${x} ${y}`)
        process.stdout.cursorTo(x - (y - 1), process.stdout.rows - lines.length - 3 + y)

        this.lines = lines
    }

    insert(key: string) {
        this.value =
            this.value.slice(0, this.cursor)
            + key
            + this.value.slice(this.cursor)

        this.cursor += 1
    }

    backspace(count = 1) {
        if (this.cursor <= 0)
            return

        this.value =
            this.value.slice(0, this.cursor - count)
            + this.value.slice(this.cursor)
        
        this.cursor -= count
    }

    delete(count = 1) {
        if (this.cursor < this.value.length)        
            this.value =
                this.value.slice(0, this.cursor)
                + this.value.slice(this.cursor + count)
    }

    moveCursor(index: number) {
        if (
            index < 0
            || index > this.value.length
        )
            return

        this.cursor = index
    }

    send(key: string) {
        if (key === '\x7f')
            this.backspace(1)
        else if (key === '\x1b[3~')
            this.delete(1)
        else if (key === '\x1b[H') // home
            this.moveCursor(0)
        else if (key === '\x1b[F') // end
            this.moveCursor(this.value.length)
        else if (key === '\x1b[C') // right
            this.moveCursor(this.cursor + 1)
        else if (key === '\x1b[D') // left
            this.moveCursor(this.cursor - 1)
        else if (/^[\t\r\P{C}]$/u.test(key))
            this.insert(key)
        else
            return false
    }

    static isNewLine(token?: string) {
        if (token)
            return /^\r?\n|\r$/.test(token)
        return false
    }

    static *wrap(value: string, width: number) {
        const tokens = value.match(/\S+[ \t]?|\s/g)

        let buffer = ''

        if (!tokens) {
            yield buffer

            return
        }

        for (let token of tokens) {
            if (Input.isNewLine(token)) {
                yield buffer

                buffer = ''

                continue
            }

            let length = buffer.length

            if (token === '\t')
                length += 4
            else
                length += token.length

            if (length > width) {
                if (buffer)
                    yield buffer

                buffer = token

                while (buffer.length >= width) {
                    yield buffer.slice(0, width)

                    buffer = buffer.slice(width)
                }
            } else if (length === width) {
                yield buffer + token

                buffer = ''
            } else
                buffer += token
        }

        if (
            buffer
            || Input.isNewLine(tokens.at(-1))
        )
            yield buffer
    }
}
