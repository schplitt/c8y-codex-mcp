import { H3, toWebHandler } from 'h3'
import indexRoute from './routes/index'
import mcpRoute from './routes/mcp'
import { CodexMcpAgent } from './utils/mcp/agent'

const app = new H3()

app.get('/', indexRoute)
app.all('/mcp', mcpRoute)

const handler = toWebHandler(app)

export { CodexMcpAgent }

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return handler(request, {
      cloudflare: { env, ctx },
    })
  },
}
