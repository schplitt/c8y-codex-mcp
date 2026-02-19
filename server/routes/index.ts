import { eventHandler, getRequestURL } from 'h3'

export default eventHandler(async (event) => {
  const requestUrl = getRequestURL(event)
  const mcpUrl = new URL('/mcp', requestUrl).toString()

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>C8Y Docs MCP Setup</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem; line-height: 1.45; }
      h1 { margin-bottom: .25rem; }
      pre { background: #f6f8fa; padding: .75rem; border-radius: 8px; overflow-x: auto; }
      code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
      .url { font-weight: 700; }
    </style>
  </head>
  <body>
    <h1>C8Y Docs MCP Setup</h1>
    <p>This MCP server is a mirror of the official Cumulocity Codex documentation at <a href="https://cumulocity.com/codex" target="_blank" rel="noreferrer">https://cumulocity.com/codex</a>.</p>
    <p>MCP endpoint: <span class="url">${mcpUrl}</span></p>

    <h2>Visual Studio Code</h2>
    <p>Create or update <code>.vscode/mcp.json</code>:</p>
    <pre><code>{
  "servers": {
    "c8y-docs": {
      "type": "http",
      "url": "${mcpUrl}"
    }
  }
}</code></pre>

    <h2>Claude Code</h2>
    <pre><code>claude mcp add --transport http c8y-docs ${mcpUrl}</code></pre>

    <h2>Cursor</h2>
    <p>Create or update <code>.cursor/mcp.json</code>:</p>
    <pre><code>{
  "mcpServers": {
    "c8y-docs": {
      "type": "http",
      "url": "${mcpUrl}"
    }
  }
}</code></pre>

    <h2>Windsurf</h2>
    <p>Create or update <code>.codeium/windsurf/mcp_config.json</code>:</p>
    <pre><code>{
  "mcpServers": {
    "c8y-docs": {
      "type": "http",
      "url": "${mcpUrl}"
    }
  }
}</code></pre>

    <h2>Zed</h2>
    <p>Add to <code>.config/zed/settings.json</code>:</p>
    <pre><code>{
  "context_servers": {
    "c8y-docs": {
      "source": "custom",
      "command": "npx",
      "args": ["mcp-remote", "${mcpUrl}"],
      "env": {}
    }
  }
}</code></pre>
  </body>
</html>`
})
