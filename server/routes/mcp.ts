import { eventHandler } from "h3"
import { mcpServer } from "../utils/mcp";

let mcpServerInstance: ReturnType<typeof mcpServer> | null = null;
export default eventHandler((event) => {
    if (!mcpServerInstance) {
        mcpServerInstance = mcpServer();
    }


    return mcpServerInstance.respond(new Request(event.req as any));
});
