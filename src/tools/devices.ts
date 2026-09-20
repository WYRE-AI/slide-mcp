import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  getCredentials,
  getDevice,
  getDeviceNetwork,
  getDeviceVlan,
  listDeviceVlans,
  listDevices,
} from '../client.js';
import type { CallToolResult } from './types.js';
import { CREATED_RANGE_PROPERTIES, PAGE_PARAMS_PROPERTIES, errorResult, requireCredentials, sortParams, textResult } from './shared.js';

export const DEVICE_TOOLS: Tool[] = [
  {
    name: 'slide_list_devices',
    description: 'List devices (physical or virtual Slide Boxes), filterable by client and creation date.',
    inputSchema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'Filter devices belonging to a specific client.' },
        ...PAGE_PARAMS_PROPERTIES,
        ...sortParams(['hostname'], 'hostname'),
        ...CREATED_RANGE_PROPERTIES,
      },
    },
  },
  {
    name: 'slide_get_device',
    description: 'Get a single device by ID - hardware/service model, storage usage, warranty, and service status.',
    inputSchema: {
      type: 'object',
      properties: {
        device_id: { type: 'string', description: 'Device ID.' },
      },
      required: ['device_id'],
    },
  },
  {
    name: 'slide_get_device_network',
    description: "Get a device's network configuration (DNS servers, network mode, gateway/address).",
    inputSchema: {
      type: 'object',
      properties: {
        device_id: { type: 'string', description: 'Device ID.' },
      },
      required: ['device_id'],
    },
  },
  {
    name: 'slide_list_device_vlans',
    description: "List a device's configured VLAN interfaces.",
    inputSchema: {
      type: 'object',
      properties: {
        device_id: { type: 'string', description: 'Device ID.' },
      },
      required: ['device_id'],
    },
  },
  {
    name: 'slide_get_device_vlan',
    description: 'Get a single VLAN interface on a device by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        device_id: { type: 'string', description: 'Device ID.' },
        vlan_id: { type: 'string', description: 'VLAN ID.' },
      },
      required: ['device_id', 'vlan_id'],
    },
  },
];

const TOOL_NAMES = new Set(DEVICE_TOOLS.map((t) => t.name));
export function isDeviceTool(name: string): boolean {
  return TOOL_NAMES.has(name);
}

export async function handleDeviceTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const creds = getCredentials();
  const missing = requireCredentials(creds);
  if (missing) return missing;

  try {
    if (name === 'slide_list_devices') {
      return textResult(
        await listDevices(creds!, {
          client_id: args.client_id as string | undefined,
          offset: args.offset as number | undefined,
          limit: args.limit as number | undefined,
          sort_by: args.sort_by as 'hostname' | undefined,
          sort_asc: args.sort_asc as boolean | undefined,
          created_after: args.created_after as string | undefined,
          created_before: args.created_before as string | undefined,
        })
      );
    }

    if (name === 'slide_get_device') {
      return textResult(await getDevice(creds!, args.device_id as string));
    }

    if (name === 'slide_get_device_network') {
      return textResult(await getDeviceNetwork(creds!, args.device_id as string));
    }

    if (name === 'slide_list_device_vlans') {
      return textResult(await listDeviceVlans(creds!, args.device_id as string));
    }

    if (name === 'slide_get_device_vlan') {
      return textResult(await getDeviceVlan(creds!, args.device_id as string, args.vlan_id as string));
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (err) {
    return errorResult((err as Error).message);
  }
}
