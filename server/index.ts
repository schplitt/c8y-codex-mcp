import { H3 } from 'h3'
import indexRoute from './routes/index'
import mcpRoute from './routes/mcp'
import { CodexMcpAgent } from './utils/mcp/agent'

const app = new H3()

app.get('/', indexRoute)
app.all('/mcp', mcpRoute)

export { CodexMcpAgent }

declare module 'h3' {
  interface H3EventContext {
    ctx: ExecutionContext
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return app.request(request, {
    }, {
      env,
      ctx,
    })
  },
}
