import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getAlert, getCredentials, listAlerts } from '../client.js';
import type { CallToolResult } from './types.js';
import { CREATED_RANGE_PROPERTIES, PAGE_PARAMS_PROPERTIES, errorResult, requireCredentials, sortParams, textResult } from './shared.js';

export const ALERT_TOOLS: Tool[] = [
  {
    name: 'slide_list_alerts',
    description: 'List alerts (e.g. device offline, agent backup failed, storage low), filterable by device, agent, resolved status, and creation date.',
    inputSchema: {
      type: 'object',
      properties: {
        device_id: { type: 'string', description: 'Filter alerts for a specific device.' },
        agent_id: { type: 'string', description: 'Filter alerts for a specific agent.' },
        resolved: { type: 'boolean', description: 'Filter by whether the alert has been resolved.' },
        ...PAGE_PARAMS_PROPERTIES,
        ...sortParams(['created'], 'created'),
        ...CREATED_RANGE_PROPERTIES,
      },
    },
  },
  {
    name: 'slide_get_alert',
    description: 'Get a single alert by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        alert_id: { type: 'string', description: 'Alert ID.' },
      },
      required: ['alert_id'],
    },
  },
];

const TOOL_NAMES = new Set(ALERT_TOOLS.map((t) => t.name));
export function isAlertTool(name: string): boolean {
  return TOOL_NAMES.has(name);
}

export async function handleAlertTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const creds = getCredentials();
  const missing = requireCredentials(creds);
  if (missing) return missing;

  try {
    if (name === 'slide_list_alerts') {
      return textResult(
        await listAlerts(creds!, {
          device_id: args.device_id as string | undefined,
          agent_id: args.agent_id as string | undefined,
          resolved: args.resolved as boolean | undefined,
          offset: args.offset as number | undefined,
          limit: args.limit as number | undefined,
          sort_by: args.sort_by as 'created' | undefined,
          sort_asc: args.sort_asc as boolean | undefined,
          created_after: args.created_after as string | undefined,
          created_before: args.created_before as string | undefined,
        })
      );
    }

    if (name === 'slide_get_alert') {
      return textResult(await getAlert(creds!, args.alert_id as string));
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (err) {
    return errorResult((err as Error).message);
  }
}
