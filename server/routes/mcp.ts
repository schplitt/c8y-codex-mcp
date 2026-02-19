import { eventHandler, toWebRequest } from 'h3'
import { env } from 'cloudflare:workers'
import { CodexMcpAgent } from '../utils/mcp/agent'

export default eventHandler(async (event) => {
  const request = toWebRequest(event)
  const executionCtx = event.context.cloudflare?.ctx

  if (!executionCtx) {
    return new Response('Missing Cloudflare execution context', { status: 500 })
  }

  return CodexMcpAgent.serve('/mcp').fetch(request, env, executionCtx)
})
