import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, describe, expect, test } from "vitest";
import { createApp, SERVER_INFO } from "../src/server.js";

let httpServer: Server | undefined;
let client: Client | undefined;

async function startServer(): Promise<string> {
  httpServer = createApp({ host: "127.0.0.1", port: 3000 }).listen(
    0,
    "127.0.0.1",
  );
  await once(httpServer, "listening");

  const address = httpServer.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function connectClient(baseUrl: string): Promise<Client> {
  client = new Client({
    name: "containerized-mcp-streamable-http-test",
    version: "1.0.0",
  });
  const transport = new StreamableHTTPClientTransport(
    new URL(`${baseUrl}/mcp`),
  );
  await client.connect(transport);
  return client;
}

afterEach(async () => {
  await client?.close();
  client = undefined;

  if (httpServer !== undefined) {
    await new Promise<void>((resolve, reject) => {
      httpServer?.close((error) => {
        if (error !== undefined) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    httpServer = undefined;
  }
});

describe("HTTP endpoints", () => {
  test("reports health separately and rejects non-POST MCP methods", async () => {
    const baseUrl = await startServer();

    const healthResponse = await fetch(`${baseUrl}/health`);
    expect(healthResponse.status).toBe(200);
    await expect(healthResponse.json()).resolves.toEqual({
      status: "ok",
      ...SERVER_INFO,
    });

    for (const method of ["GET", "DELETE", "PUT", "PATCH"]) {
      const response = await fetch(`${baseUrl}/mcp`, { method });
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("POST");
    }
  });

  test("rejects an untrusted browser origin", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://example.com",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "origin-test", version: "1.0.0" },
        },
      }),
    });

    expect(response.status).toBe(403);
  });

  test("uses JSON-only Streamable HTTP without sessions or SSE", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "transport-test", version: "1.0.0" },
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("content-type")).not.toContain(
      "text/event-stream",
    );
    expect(response.headers.get("mcp-session-id")).toBeNull();
  });
});

describe("MCP tools", () => {
  test("echo returns validated input unchanged", async () => {
    const baseUrl = await startServer();
    const connectedClient = await connectClient(baseUrl);

    const result = await connectedClient.callTool({
      name: "echo",
      arguments: { text: "hello from Copilot" },
    });

    expect(result).toMatchObject({
      content: [{ type: "text", text: "hello from Copilot" }],
      structuredContent: { text: "hello from Copilot" },
    });
  });

  test("server_info describes this Streamable HTTP server", async () => {
    const baseUrl = await startServer();
    const connectedClient = await connectClient(baseUrl);

    const result = await connectedClient.callTool({
      name: "server_info",
      arguments: {},
    });

    expect(result).toMatchObject({
      structuredContent: SERVER_INFO,
    });
  });

  test("echo rejects text outside its schema", async () => {
    const baseUrl = await startServer();
    const connectedClient = await connectClient(baseUrl);

    const result = await connectedClient.callTool({
      name: "echo",
      arguments: { text: "" },
    });

    expect(result).toMatchObject({
      isError: true,
      content: [
        {
          type: "text",
          text: expect.stringContaining("Input validation error"),
        },
      ],
    });
  });
});
