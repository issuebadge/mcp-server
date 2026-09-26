#!/usr/bin/env node
/**
 * IssueBadge MCP server — stdio host.
 *   ISSUEBADGE_API_KEY   required, bearer token from https://app.issuebadge.com/developer/index
 *   ISSUEBADGE_BASE_URL  optional, defaults to https://app.issuebadge.com/api/v1
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';
import { DEFAULT_BASE_URL, IssueBadgeClient } from './issuebadge.js';
import { callTool, InvalidParams, listTools, remoteTools } from './tools.js';
import { createBadgeTool } from './createBadge.js';

export const VERSION = '2.1.0';

const apiKey = (process.env.ISSUEBADGE_API_KEY ?? '').trim();
if (!apiKey) {
  process.stderr.write('issuebadge-mcp-server: ISSUEBADGE_API_KEY is not set. Create a key at https://app.issuebadge.com/developer/index\n');
  process.exit(1);
}

const client = new IssueBadgeClient(apiKey, process.env.ISSUEBADGE_BASE_URL || DEFAULT_BASE_URL);
const tools = [...remoteTools, createBadgeTool];

const server = new Server({ name: 'issuebadge', version: VERSION }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: listTools(tools) }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    return await callTool(tools, request.params.name, request.params.arguments ?? {}, client);
  } catch (err) {
    if (err instanceof InvalidParams) throw new McpError(ErrorCode.InvalidParams, err.message);
    throw new McpError(ErrorCode.InternalError, (err as Error).message);
  }
});

await server.connect(new StdioServerTransport());
