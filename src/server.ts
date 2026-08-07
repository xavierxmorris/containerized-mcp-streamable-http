import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod/v4";

export const SERVER_INFO = {
  name: "containerized-mcp-streamable-http",
  version: "1.0.0",
  transport: "Streamable HTTP (JSON-only)",
} as const;

const DEFAULT_PORT = 3000;
const LOOPBACK_HOSTS = ["127.0.0.1", "localhost"];

export interface AppOptions {
  host?: string;
  port?: number;
}

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: SERVER_INFO.name,
    version: SERVER_INFO.version,
  });

  server.registerTool(
    "echo",
    {
      description: "Return the supplied text unchanged.",
      inputSchema: {
        text: z
          .string()
          .min(1)
          .max(10_000)
          .describe("Text to return, from 1 to 10,000 characters."),
      },
      outputSchema: {
        text: z.string(),
      },
    },
    async ({ text }) => ({
      content: [{ type: "text", text }],
      structuredContent: { text },
    }),
  );

  server.registerTool(
    "server_info",
    {
      description: "Return the server name, version, and transport.",
      inputSchema: {},
      outputSchema: {
        name: z.string(),
        version: z.string(),
        transport: z.literal(SERVER_INFO.transport),
      },
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(SERVER_INFO),
        },
      ],
      structuredContent: { ...SERVER_INFO },
    }),
  );

  return server;
}

function validateOrigin(
  allowedOrigins: ReadonlySet<string>,
): (request: Request, response: Response, next: NextFunction) => void {
  return (request, response, next) => {
    const origin = request.get("origin");

    if (origin !== undefined && !allowedOrigins.has(origin)) {
      response.status(403).json({
        jsonrpc: "2.0",
        error: {
          code: -32_000,
          message: "Forbidden origin.",
        },
        id: null,
      });
      return;
    }

    next();
  };
}

function methodNotAllowed(response: Response): void {
  response
    .set("Allow", "POST")
    .status(405)
    .json({
      jsonrpc: "2.0",
      error: {
        code: -32_000,
        message: "Method not allowed.",
      },
      id: null,
    });
}

export function createApp(options: AppOptions = {}) {
  const host = options.host ?? process.env.HOST ?? "127.0.0.1";
  const port = options.port ?? DEFAULT_PORT;
  const allowedOrigins = new Set(
    LOOPBACK_HOSTS.map((loopbackHost) => `http://${loopbackHost}:${port}`),
  );
  const app = createMcpExpressApp({
    host,
    allowedHosts: LOOPBACK_HOSTS,
  });

  app.get("/health", (_request, response) => {
    response.json({
      status: "ok",
      ...SERVER_INFO,
    });
  });

  app.use("/mcp", validateOrigin(allowedOrigins));

  app.post("/mcp", async (request, response) => {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      enableJsonResponse: true,
      sessionIdGenerator: undefined,
    });

    try {
      await server.connect(transport);
      response.once("close", () => {
        void server.close().catch((error: unknown) => {
          console.error("Failed to close MCP request resources:", error);
        });
      });
      await transport.handleRequest(request, response, request.body);
    } catch (error) {
      console.error("Failed to handle MCP request:", error);

      if (!response.headersSent) {
        response.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32_603,
            message: "Internal server error.",
          },
          id: null,
        });
      } else {
        response.end();
      }
    }
  });

  app.all("/mcp", (_request, response) => {
    methodNotAllowed(response);
  });

  return app;
}
