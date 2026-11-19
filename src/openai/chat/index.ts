import OpenAI from '..'

export class OpenAIChat {
    client
    model
    constructor({
        client,
        model
    }: {
        client: OpenAI
        model: string
    } = {
        client: new OpenAI,
        model: 'nvidia/nemotron-3.5-super-vl-120b-a12b' 
    }) {
        this.client = client
        this.model = model
    }

    sendMessage(content: string) {
        return this.client.fetch('chat/completions', {
            model: this.model,
            messages: [
                {
                    role: 'user',
                    content
                }
            ],
            stream: true
        })
    }
}