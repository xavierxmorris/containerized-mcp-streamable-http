import { createApp } from "./server.js";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.PORT ?? "3000", 10);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PORT must be an integer from 1 to 65535.");
}

const httpServer = createApp({ host, port }).listen(port, host, () => {
  console.log(`MCP server listening on http://${host}:${port}`);
});

httpServer.on("error", (error) => {
  console.error("Failed to start MCP server:", error);
  process.exitCode = 1;
});

let shuttingDown = false;

function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`Received ${signal}; shutting down.`);
  httpServer.close((error) => {
    if (error !== undefined) {
      console.error("Failed to stop MCP server cleanly:", error);
      process.exitCode = 1;
    }
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
