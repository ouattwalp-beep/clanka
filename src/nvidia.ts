import Queue from './queue' 

export default class NVIDIA {
    readonly queue

    constructor(apiKeys: string[]) {
        this.queue = new Queue(apiKeys)
    }

    async chatCompletions(body: Bun.BodyInit) {
        return this.queue.fetch(`https://integrate.api.nvidia.com/v1/chat/completions`, {
            method: 'POST',
            body
        })
    }
}