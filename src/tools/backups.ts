import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getBackup, getCredentials, listBackups } from '../client.js';
import type { CallToolResult } from './types.js';
import { PAGE_PARAMS_PROPERTIES, errorResult, requireCredentials, sortParams, textResult } from './shared.js';

export const BACKUP_TOOLS: Tool[] = [
  {
    name: 'slide_list_backups',
    description: 'List backup attempts (each may have succeeded or failed), filterable by agent, snapshot, device, and start/end time range.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Filter backups for a specific agent.' },
        snapshot_id: { type: 'string', description: 'Filter to the backup that produced a specific snapshot.' },
        device_id: { type: 'string', description: 'Filter backups for a specific device.' },
        ...PAGE_PARAMS_PROPERTIES,
        ...sortParams(['id', 'start_time'], 'start_time'),
        backup_started_after: { type: 'string', description: 'Filter to backups started after a specific timestamp (RFC3339 format).' },
        backup_started_before: { type: 'string', description: 'Filter to backups started before a specific timestamp (RFC3339 format).' },
        backup_ended_after: { type: 'string', description: 'Filter to backups completed after a specific timestamp (RFC3339 format).' },
        backup_ended_before: { type: 'string', description: 'Filter to backups completed before a specific timestamp (RFC3339 format).' },
      },
    },
  },
  {
    name: 'slide_get_backup',
    description: 'Get a single backup attempt by ID, including its result and error details if it failed.',
    inputSchema: {
      type: 'object',
      properties: {
        backup_id: { type: 'string', description: 'Backup ID.' },
      },
      required: ['backup_id'],
    },
  },
];

const TOOL_NAMES = new Set(BACKUP_TOOLS.map((t) => t.name));
export function isBackupTool(name: string): boolean {
  return TOOL_NAMES.has(name);
}

export async function handleBackupTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const creds = getCredentials();
  const missing = requireCredentials(creds);
  if (missing) return missing;

  try {
    if (name === 'slide_list_backups') {
      return textResult(
        await listBackups(creds!, {
          agent_id: args.agent_id as string | undefined,
          snapshot_id: args.snapshot_id as string | undefined,
          device_id: args.device_id as string | undefined,
          offset: args.offset as number | undefined,
          limit: args.limit as number | undefined,
          sort_by: args.sort_by as 'id' | 'start_time' | undefined,
          sort_asc: args.sort_asc as boolean | undefined,
          backup_started_after: args.backup_started_after as string | undefined,
          backup_started_before: args.backup_started_before as string | undefined,
          backup_ended_after: args.backup_ended_after as string | undefined,
          backup_ended_before: args.backup_ended_before as string | undefined,
        })
      );
    }

    if (name === 'slide_get_backup') {
      return textResult(await getBackup(creds!, args.backup_id as string));
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (err) {
    return errorResult((err as Error).message);
  }
}
