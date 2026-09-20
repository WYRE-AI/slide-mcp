import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getClient, getCredentials, listClients } from '../client.js';
import type { CallToolResult } from './types.js';
import { CREATED_RANGE_PROPERTIES, PAGE_PARAMS_PROPERTIES, errorResult, requireCredentials, sortParams, textResult } from './shared.js';

export const CLIENT_TOOLS: Tool[] = [
  {
    name: 'slide_list_clients',
    description: 'List clients (the MSP\'s end customers), filterable by creation date.',
    inputSchema: {
      type: 'object',
      properties: {
        ...PAGE_PARAMS_PROPERTIES,
        ...sortParams(['id'], 'id'),
        ...CREATED_RANGE_PROPERTIES,
      },
    },
  },
  {
    name: 'slide_get_client',
    description: 'Get a single client by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'Client ID.' },
      },
      required: ['client_id'],
    },
  },
];

const TOOL_NAMES = new Set(CLIENT_TOOLS.map((t) => t.name));
export function isClientTool(name: string): boolean {
  return TOOL_NAMES.has(name);
}

export async function handleClientTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const creds = getCredentials();
  const missing = requireCredentials(creds);
  if (missing) return missing;

  try {
    if (name === 'slide_list_clients') {
      return textResult(
        await listClients(creds!, {
          offset: args.offset as number | undefined,
          limit: args.limit as number | undefined,
          sort_by: args.sort_by as 'id' | undefined,
          sort_asc: args.sort_asc as boolean | undefined,
          created_after: args.created_after as string | undefined,
          created_before: args.created_before as string | undefined,
        })
      );
    }

    if (name === 'slide_get_client') {
      return textResult(await getClient(creds!, args.client_id as string));
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (err) {
    return errorResult((err as Error).message);
  }
}
