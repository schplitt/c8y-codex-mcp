import { eventHandler, toWebRequest } from "h3"
import { mcpServer } from "../utils/mcp";

let mcpServerInstance: ReturnType<typeof mcpServer> | null = null;
export default eventHandler((event) => {
    if (!mcpServerInstance) {
        mcpServerInstance = mcpServer();
    }

    const request = toWebRequest(event)

    return mcpServerInstance.respond(request);
});
