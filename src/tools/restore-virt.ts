import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getCredentials, getVirtualMachine, listVirtualMachines } from '../client.js';
import type { CallToolResult } from './types.js';
import { CREATED_RANGE_PROPERTIES, PAGE_PARAMS_PROPERTIES, errorResult, requireCredentials, sortParams, textResult } from './shared.js';

export const RESTORE_VIRT_TOOLS: Tool[] = [
  {
    name: 'slide_list_virtual_machines',
    description:
      'List virtual machines created from a snapshot, filterable by creation date. VNC connection info (host/port/websocket URI) is included, but the live VNC password is never returned even though the underlying Slide API includes it.',
    inputSchema: {
      type: 'object',
      properties: {
        ...PAGE_PARAMS_PROPERTIES,
        ...sortParams(['created'], 'created'),
        ...CREATED_RANGE_PROPERTIES,
      },
    },
  },
  {
    name: 'slide_get_virtual_machine',
    description:
      'Get a single virtual machine by ID - state, CPU/memory, network config, RDP endpoint. Same secret redaction as slide_list_virtual_machines: no VNC password.',
    inputSchema: {
      type: 'object',
      properties: {
        virt_id: { type: 'string', description: 'Virtual machine ID.' },
      },
      required: ['virt_id'],
    },
  },
];

const TOOL_NAMES = new Set(RESTORE_VIRT_TOOLS.map((t) => t.name));
export function isRestoreVirtTool(name: string): boolean {
  return TOOL_NAMES.has(name);
}

export async function handleRestoreVirtTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const creds = getCredentials();
  const missing = requireCredentials(creds);
  if (missing) return missing;

  try {
    if (name === 'slide_list_virtual_machines') {
      return textResult(
        await listVirtualMachines(creds!, {
          offset: args.offset as number | undefined,
          limit: args.limit as number | undefined,
          sort_by: args.sort_by as 'created' | undefined,
          sort_asc: args.sort_asc as boolean | undefined,
          created_after: args.created_after as string | undefined,
          created_before: args.created_before as string | undefined,
        })
      );
    }

    if (name === 'slide_get_virtual_machine') {
      return textResult(await getVirtualMachine(creds!, args.virt_id as string));
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (err) {
    return errorResult((err as Error).message);
  }
}
