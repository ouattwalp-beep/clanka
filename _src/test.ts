import apiKeys from '../.clanka/tokens.json'

import loremIpsum from '../loremIpsum.txt'

import {Client, Chat} from './chat'

const client = new Client({
    apiKeys
})

const chat = new Chat

import {Input} from './tli/input'

const input = new Input

const terminal = {
    render() {
        console.clear()

        const separator = new String().padEnd(process.stdout.columns, '─')

        process.stdout.cursorTo(0, process.stdout.rows - 2)

        process.stdout.write(separator)

        input.render()
    },

    data(key: string) {    
        // ctrl + c
        if (key === '\u0003')
            process.stdin.pause()

        if (!/^[\P{C}]$/u.test(key)) {
            process.stdout.cursorTo(0, process.stdout.rows)

            process.stdout.write(JSON.stringify(key))
        }

        if (input.send(key) === undefined)
            this.render()
    }
}
        
process.stdin.setRawMode(true)

process.stdin.setEncoding('utf8')

process.stdin.addListener('data', terminal.data.bind(terminal))

process.stdout.addListener('resize', terminal.render.bind(terminal))

terminal.render()

process.stdin.resume()
