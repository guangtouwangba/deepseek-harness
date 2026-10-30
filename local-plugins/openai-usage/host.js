/** Register quota reads on Connection's authenticated owner-only API channel. */
export function registerHost(ctx, monitor) {
  ctx.on('credentials/record-updated', key => {
    if (key === 'llm-pi-ai/openai-codex' || key === 'llm-pi-ai/openai') monitor.invalidate()
  })
  ctx.effect(() => {
    const unregister = ctx.connection.fetch.register({
      path: '/api/local-openai-usage', methods: ['GET'], requestBody: 'buffered',
      async fetch(request) {
        request.signal.throwIfAborted()
        const value = await monitor.read()
        request.signal.throwIfAborted()
        return Response.json(value, { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
      },
    })
    return async () => {
      await unregister()
      await monitor.dispose()
    }
  }, 'openai-usage: authenticated quota reader')
}
