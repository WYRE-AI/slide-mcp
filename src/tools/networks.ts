import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getCredentials, getNetwork, listNetworks } from '../client.js';
import type { CallToolResult } from './types.js';
import { CREATED_RANGE_PROPERTIES, PAGE_PARAMS_PROPERTIES, errorResult, requireCredentials, sortParams, textResult } from './shared.js';

export const NETWORK_TOOLS: Tool[] = [
  {
    name: 'slide_list_networks',
    description:
      'List disaster-recovery networks, filterable by client and creation date. IPsec connections and WireGuard peers are included with their non-secret fields only - the live IPsec pre-shared key and WireGuard private key are never returned, even though the underlying Slide API includes them.',
    inputSchema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'Filter networks belonging to a specific client.' },
        ...PAGE_PARAMS_PROPERTIES,
        ...sortParams(['id'], 'id'),
        ...CREATED_RANGE_PROPERTIES,
      },
    },
  },
  {
    name: 'slide_get_network',
    description:
      'Get a single disaster-recovery network by ID - port forwards, IPsec connections, and WireGuard peers. Same secret redaction as slide_list_networks: no IPsec PSK, no WireGuard private key.',
    inputSchema: {
      type: 'object',
      properties: {
        network_id: { type: 'string', description: 'Network ID.' },
      },
      required: ['network_id'],
    },
  },
];

const TOOL_NAMES = new Set(NETWORK_TOOLS.map((t) => t.name));
export function isNetworkTool(name: string): boolean {
  return TOOL_NAMES.has(name);
}

export async function handleNetworkTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const creds = getCredentials();
  const missing = requireCredentials(creds);
  if (missing) return missing;

  try {
    if (name === 'slide_list_networks') {
      return textResult(
        await listNetworks(creds!, {
          client_id: args.client_id as string | undefined,
          offset: args.offset as number | undefined,
          limit: args.limit as number | undefined,
          sort_by: args.sort_by as 'id' | undefined,
          sort_asc: args.sort_asc as boolean | undefined,
          created_after: args.created_after as string | undefined,
          created_before: args.created_before as string | undefined,
        })
      );
    }

    if (name === 'slide_get_network') {
      return textResult(await getNetwork(creds!, args.network_id as string));
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (err) {
    return errorResult((err as Error).message);
  }
}
