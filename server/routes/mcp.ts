import { eventHandler } from 'h3'
import { env } from 'cloudflare:workers'
import { CodexMcpAgent } from '../utils/mcp/agent'

export default eventHandler(async (event) => {
  const request = event.req as Request
  const executionCtx = event.context.ctx

  if (!executionCtx) {
    return new Response('Missing Cloudflare execution context', { status: 500 })
  }

  return CodexMcpAgent.serve('/mcp').fetch(request, env, executionCtx)
})
