import index from './html/index.html'

import apiKeys from '../.clanka/tokens.json'

import NVIDIA from './nvidia'

import SSE from './sse'

const nvidia = new NVIDIA(apiKeys)

Bun.serve({
    routes: {
        '/': index,
        '/v1/chat/completions': {
            async POST(request) {
                const response = await nvidia.chatCompletions(await request.body?.blob()!)

                if (response.headers.get('content-type') === 'text/event-stream')
                    return new Response(SSE.relay(response.body!))

                return response
            }
        }
    }
})