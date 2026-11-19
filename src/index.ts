import OpenAI, {OpenAIChat} from './openai'

const client = new OpenAI

const chat = new OpenAIChat({
    client,
    model: 'nvidia/nemotron-3.5-super-vl-120b-a12b'
})

const response = await chat.sendMessage('Hola mundo')

// console.log(await chat.sendMessage('Hola mundo').then(response => response.json()))

for await (const chunk of chat.client.stream(response.body!))
    console.log(chunk)
