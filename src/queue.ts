import type {HeaderRecord} from 'undici-types/header.d.ts'

import Keys from './keys'

export default class Queue {
    readonly keys

    constructor(keys: string[]) {
        this.keys = new Keys(keys)
    }

    private static errorResponse(error?: Error) {
        return new Response(error?.toString(), {status: 500})
    }

    private requests: {
        resource: string,
        request: RequestInit & {headers: HeaderRecord},
        resolve: (value: Response | PromiseLike<Response>) => void,
        reject: (reason?: any) => void,
        tries: 0
    }[] = []

    private draining = false

    private async drain(): Promise<any> {
        const {resource, request, resolve, reject} = this.requests[0]!

        const key = await this.keys.roll()

        request.headers.authorization = `Bearer ${key}`

        const response = await fetch(resource, request).catch(Queue.errorResponse)

        if (response.status === 429) {
            this.keys.reportFailed(key)

            return this.drain()
        } else
            resolve(response)

        this.requests.shift()

        if (this.requests.length)
            return this.drain()

        this.draining = false
    }

    fetch(resource: string, request: Partial<typeof this.requests[number]['request']>) {
        const {promise, resolve, reject} = Promise.withResolvers<Response>()

        request.headers ??= {}

        this.requests.push({
            resource,
            request: request as typeof this.requests[number]['request'],
            resolve,
            reject,
            tries: 0
        })

        if (!this.draining) {
            this.draining = true

            this.drain()
        }

        return promise
    }
}