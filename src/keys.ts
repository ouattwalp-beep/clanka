export default class Keys {
    private readonly keys: {
        value: string
        totalRequests: number
        requests: number
        firstRequest: number
        lastRequest: number
        failedRequests: number
        lastFailedRequest: number
    }[] = []

    limit

    constructor(keys: string[], limit = 40) {
        for (const key of keys)
            this.add(key)

        this.limit = limit
    }

    get length() {
        return this.keys.length
    }

    private index = 0

    private rotate() {
        return this.index = (this.index + 1) % this.keys.length
    }

    getIndex(value: string) {
        const index = this.keys.findIndex(({value: key}) => key === value)

        return index < 0 ? undefined : index
    }

    get(index: number) {
        const key = this.keys[index]

        if (key)
            return {...key}
    }

    slice(from = 0, to?: number) {
        return this.keys.slice(from, to ?? this.length).map(key => ({...key}))
    }

    reportFailed(value: string) {
        const index = this.getIndex(value)

        if (!index)
            return

        const key = this.keys[index]

        if (!key)
            return

        key.failedRequests += 1
        key.lastFailedRequest = Date.now()
    }

    add(value: string) {
        return this.keys.push({
            value,
            totalRequests: 0,
            requests: 0,
            firstRequest: 0,
            lastRequest: 0,
            failedRequests: 0,
            lastFailedRequest: 0
        })
    }

    remove(value: string) {
        if (this.keys.length === 1)
            return

        const index = this.getIndex(value)

        if (index === undefined)
            return

        const key = this.get(this.rotate())!

        this.keys.splice(index, 1)

        return this.index = this.getIndex(key.value)!
    }

    async roll(): Promise<string> {
        const key = this.keys[this.index]!

        const now = Date.now()

        if (now - key.firstRequest > 60e3) {
            key.requests = 0
            key.firstRequest = 0
        }

        if (key.requests >= this.limit) {
            // TODO

            // FIND SOMETHING NOT RATELIMITED

            // IF EVERYTHING RATE LIMITED

            // FIND THE LOWEST TIME LIMIT

            // WAIT 1 MINUTE AFTER FIRST REQUEST OR LASTFAILED IF LONGER

            // SWITCH AND ROLL

            // const wait = this.keys.reduce((min, key) => key.firstRequest < min.firstRequest ? key : min).firstRequest + 60e3 - now

            this.rotate()

           return this.roll()
        }

        key.firstRequest ||= now

        key.lastRequest = now
    
        key.totalRequests += 1

        key.requests += 1

        this.rotate()

        return key.value
    }
}