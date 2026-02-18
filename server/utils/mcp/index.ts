import { McpServer } from 'tmcp';
import { ValibotJsonSchemaAdapter } from '@tmcp/adapter-valibot';
import * as v from 'valibot';
import { HttpTransport } from '@tmcp/transport-http';




const adapter = new ValibotJsonSchemaAdapter();
const server = new McpServer(
	{
		name: 'my-server',
		version: '1.0.0',
		description: 'My awesome MCP server',
	},
	{
		adapter,
		capabilities: {
			tools: { listChanged: true },
		},
	},
);

// While the adapter is optional (you can opt out by explicitly passing `adapter: undefined`) without an adapter the server cannot accept inputs, produce structured outputs, or request elicitations at all only do this for very simple servers.

// Define a tool with type-safe schema
server.tool(
	{
		name: 'calculate',
		description: 'Perform mathematical calculations',
		schema: v.object({
			operation: v.picklist(['add', 'subtract', 'multiply', 'divide']),
			a: v.number(),
			b: v.number(),
		}),
        
	},
	async ({ operation, a, b }) => {
		switch (operation) {
			case 'add':
				return a + b;
			case 'subtract':
				return a - b;
			case 'multiply':
				return a * b;
			case 'divide':
				return a / b;
		}
	},
);

export function mcpServer() {
// Start the server with HTTP transport
return new HttpTransport(server);
}