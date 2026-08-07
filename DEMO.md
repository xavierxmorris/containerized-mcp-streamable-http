# Demo: containerized Streamable HTTP MCP in GitHub Copilot

This presenter guide demonstrates GitHub Copilot Desktop using two safe tools
from an MCP server running in a local container.

## What the experiment answers

Yes: GitHub Copilot Desktop can act as an MCP client for this local,
containerized server. It can connect to
`http://127.0.0.1:3000/mcp`, list `server_info` and `echo`, and invoke both
tools.

The transport is stateless, JSON-only Streamable HTTP. It does not use stdio,
legacy HTTP+SSE, SSE response streams, or sessions.

```text
GitHub Copilot Desktop
        |
        | type: http (Streamable HTTP)
        v
http://127.0.0.1:3000/mcp
        |
        v
Local container: containerized-mcp-streamable-http
        |
        +-- server_info
        +-- echo
```

## Prerequisites

- GitHub Copilot Desktop/App with access to MCP servers
- Docker Desktop or Podman
- Git

If an organization manages the Copilot account, its MCP policy and allowlist
must permit repository or user-defined MCP servers.

## 1. Clone the standalone repository

```shell
git clone https://github.com/xavierxmorris/containerized-mcp-streamable-http.git
cd containerized-mcp-streamable-http
```

The committed `.github/mcp.json` configures the endpoint as type `http` and
allowlists only `echo` and `server_info`.

## 2. Build the container

Docker:

```shell
docker build -t containerized-mcp-streamable-http .
```

Podman:

```shell
podman build -t containerized-mcp-streamable-http .
```

## 3. Start on host loopback only

Docker:

```shell
docker run --rm -d --name containerized-mcp-streamable-http \
  -p 127.0.0.1:3000:3000 containerized-mcp-streamable-http
```

Podman:

```shell
podman run --rm -d --name containerized-mcp-streamable-http \
  -p 127.0.0.1:3000:3000 containerized-mcp-streamable-http
```

The application binds to `0.0.0.0` inside the container. The publish option
restricts host access to `127.0.0.1`.

## 4. Verify health and the method boundary

PowerShell:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health
try {
  Invoke-WebRequest http://127.0.0.1:3000/mcp
} catch {
  $_.Exception.Response.StatusCode.value__
}
```

macOS or Linux:

```shell
curl http://127.0.0.1:3000/health
curl -i http://127.0.0.1:3000/mcp
```

Expected health response:

```json
{
  "status": "ok",
  "name": "containerized-mcp-streamable-http",
  "version": "1.0.0",
  "transport": "Streamable HTTP (JSON-only)"
}
```

`GET /mcp` must return `405 Method Not Allowed` with `Allow: POST`. `/health`
is deliberately separate.

## 5. Connect GitHub Copilot Desktop

1. Open this repository as a local project.
2. Trust the project when prompted.
3. Start a new project session after the container is running.
4. Confirm the `containerized-mcp-streamable-http` server lists `server_info`
   and `echo`.
5. Ask:

   ```text
   Use the containerized-mcp-streamable-http server_info tool and show its exact result.
   ```

Expected tool result:

```json
{
  "name": "containerized-mcp-streamable-http",
  "version": "1.0.0",
  "transport": "Streamable HTTP (JSON-only)"
}
```

## 6. Invoke `echo`

Ask:

```text
Use the containerized-mcp-streamable-http echo tool with exactly "hello from Copilot Desktop".
```

Expected result:

```text
hello from Copilot Desktop
```

`echo` accepts only strings from 1 through 10,000 characters. Empty strings,
non-strings, and oversized strings are rejected by the tool schema.

## 7. Optional CLI check

Copilot CLI supports the same committed project configuration. From the
trusted repository root:

```shell
copilot mcp get containerized-mcp-streamable-http
```

Then launch `copilot` and invoke the same tools.

## 8. Stop only this demo container

Docker:

```shell
docker stop containerized-mcp-streamable-http
```

Podman:

```shell
podman stop containerized-mcp-streamable-http
```

Because it was started with `--rm`, it is removed automatically.

## Evidence boundary

On 2026-08-07, the source implementation from which this standalone repository
was extracted was verified with MCP SDK 1.30.0, six passing tests, Docker, and
a fresh Copilot Desktop-managed project session:

```text
server_info -> returned the expected source server name, version, and transport
echo("desktop-app-client-ok") -> desktop-app-client-ok
```

That result proves the client/container experiment for the source
implementation. The standalone extraction has renamed metadata and a more
precise transport label. On 2026-08-07, the standalone extraction passed
`npm ci`, type-check lint, all six tests, the TypeScript build, Docker image
build/run, HTTP boundary checks, and official MCP SDK client calls for
initialization, tool listing, `server_info`, and `echo`. Podman was unavailable.
No fresh Desktop test was run against this repository. Do not present the prior
source result as a fresh standalone Desktop test; use the steps above for a
live demonstration.

## Troubleshooting

| Symptom | Resolution |
| --- | --- |
| Copilot does not list the tools | Confirm container health, trust the project, and start a new Copilot session. |
| MCP content is blocked by an administrator | Ask the organization administrator to enable MCP and allow this server/configuration source. |
| Port 3000 is already in use | Stop the conflicting process or publish a different loopback port and update the MCP URL. |
| `GET /mcp` returns 405 | Expected. Use `/health`; MCP clients use `POST /mcp`. |
| A remote/cloud Copilot session cannot connect | `127.0.0.1` is that remote environment, not the presenter's laptop. This demo targets local sessions. |

For production or shared use, add HTTPS, OAuth-based authentication and
authorization, deployment-specific Origin validation, managed secrets, network
restrictions, and enterprise MCP policy/allowlist governance.
