import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getCredentials, getSnapshot, getSnapshotServiceVerification, listSnapshots } from '../client.js';
import type { CallToolResult } from './types.js';
import { PAGE_PARAMS_PROPERTIES, errorResult, requireCredentials, sortParams, textResult } from './shared.js';

const SNAPSHOT_LOCATION_VALUES = [
  'exists_local',
  'exists_cloud',
  'exists_deleted',
  'exists_deleted_retention',
  'exists_deleted_manual',
  'exists_deleted_other',
  'location_any',
] as const;

export const SNAPSHOT_TOOLS: Tool[] = [
  {
    name: 'slide_list_snapshots',
    description: 'List snapshots (taken as part of a successful backup), filterable by agent, location/deletion state, and backup start/end time range.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Filter snapshots for a specific agent.' },
        snapshot_location: {
          type: 'string',
          enum: [...SNAPSHOT_LOCATION_VALUES],
          description:
            'Filter snapshots by location or deleted status. If omitted, defaults to snapshots that exist locally or in the cloud (not deleted).',
        },
        ...PAGE_PARAMS_PROPERTIES,
        ...sortParams(['backup_start_time', 'backup_end_time', 'created'], 'created'),
        backup_started_after: { type: 'string', description: 'Filter to snapshots created after a specific backup start time (RFC3339 format).' },
        backup_started_before: { type: 'string', description: 'Filter to snapshots created before a specific backup start time (RFC3339 format).' },
        backup_ended_after: { type: 'string', description: 'Filter to snapshots completed after a specific backup end time (RFC3339 format).' },
        backup_ended_before: { type: 'string', description: 'Filter to snapshots completed before a specific backup end time (RFC3339 format).' },
      },
    },
  },
  {
    name: 'slide_get_snapshot',
    description: 'Get a single snapshot by ID - its storage locations and any deletions.',
    inputSchema: {
      type: 'object',
      properties: {
        snapshot_id: { type: 'string', description: 'Snapshot ID.' },
      },
      required: ['snapshot_id'],
    },
  },
  {
    name: 'slide_get_snapshot_service_verification',
    description: 'Get service-verification results for a snapshot (confirms which detected services would boot/mount successfully from it).',
    inputSchema: {
      type: 'object',
      properties: {
        snapshot_id: { type: 'string', description: 'Snapshot ID.' },
      },
      required: ['snapshot_id'],
    },
  },
];

const TOOL_NAMES = new Set(SNAPSHOT_TOOLS.map((t) => t.name));
export function isSnapshotTool(name: string): boolean {
  return TOOL_NAMES.has(name);
}

export async function handleSnapshotTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const creds = getCredentials();
  const missing = requireCredentials(creds);
  if (missing) return missing;

  try {
    if (name === 'slide_list_snapshots') {
      return textResult(
        await listSnapshots(creds!, {
          agent_id: args.agent_id as string | undefined,
          snapshot_location: args.snapshot_location as
            | (typeof SNAPSHOT_LOCATION_VALUES)[number]
            | undefined,
          offset: args.offset as number | undefined,
          limit: args.limit as number | undefined,
          sort_by: args.sort_by as 'backup_start_time' | 'backup_end_time' | 'created' | undefined,
          sort_asc: args.sort_asc as boolean | undefined,
          backup_started_after: args.backup_started_after as string | undefined,
          backup_started_before: args.backup_started_before as string | undefined,
          backup_ended_after: args.backup_ended_after as string | undefined,
          backup_ended_before: args.backup_ended_before as string | undefined,
        })
      );
    }

    if (name === 'slide_get_snapshot') {
      return textResult(await getSnapshot(creds!, args.snapshot_id as string));
    }

    if (name === 'slide_get_snapshot_service_verification') {
      return textResult(await getSnapshotServiceVerification(creds!, args.snapshot_id as string));
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (err) {
    return errorResult((err as Error).message);
  }
}
