import SSE from '../sse'

const response = await fetch('/v1/chat/completions', {
    method: 'post',
    body: JSON.stringify({
        model: 'nvidia/nemotron-3-ultra-550b-a55b',
        messages: [
            {
                role: 'user',
                content: 'make a bun project that checks weahter.'
            }
        ],
        stream: true
    })
})




for await (const chunk of SSE.json(response.body!))
  console.log(chunk)