import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  browseFileRestore,
  getCredentials,
  getFileRestore,
  getFileRestorePush,
  listFileRestorePushes,
  listFileRestores,
} from '../client.js';
import type { CallToolResult } from './types.js';
import { CREATED_RANGE_PROPERTIES, PAGE_PARAMS_PROPERTIES, errorResult, requireCredentials, sortParams, textResult } from './shared.js';

export const RESTORE_FILE_TOOLS: Tool[] = [
  {
    name: 'slide_list_file_restores',
    description: 'List file restores (a snapshot exposed for browsing/downloading individual files), filterable by creation date.',
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
    name: 'slide_get_file_restore',
    description: 'Get a single file restore by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        file_restore_id: { type: 'string', description: 'File restore ID.' },
      },
      required: ['file_restore_id'],
    },
  },
  {
    name: 'slide_browse_file_restore',
    description: 'Browse the files and folders exposed by a file restore, optionally at a specific path.',
    inputSchema: {
      type: 'object',
      properties: {
        file_restore_id: { type: 'string', description: 'File restore ID.' },
        path: { type: 'string', description: 'Path to browse within the restore. Defaults to the root.' },
        ...PAGE_PARAMS_PROPERTIES,
      },
      required: ['file_restore_id'],
    },
  },
  {
    name: 'slide_list_file_restore_pushes',
    description: 'List push operations (copying a restored file back to a protected system) for a file restore, filterable by start/end time range.',
    inputSchema: {
      type: 'object',
      properties: {
        file_restore_id: { type: 'string', description: 'File restore ID.' },
        ...PAGE_PARAMS_PROPERTIES,
        ...sortParams(['start_time'], 'start_time'),
        start_time_after: { type: 'string', description: 'Filter to pushes started after a specific timestamp (RFC3339 format).' },
        start_time_before: { type: 'string', description: 'Filter to pushes started before a specific timestamp (RFC3339 format).' },
        end_time_after: { type: 'string', description: 'Filter to pushes ended after a specific timestamp (RFC3339 format).' },
        end_time_before: { type: 'string', description: 'Filter to pushes ended before a specific timestamp (RFC3339 format).' },
      },
      required: ['file_restore_id'],
    },
  },
  {
    name: 'slide_get_file_restore_push',
    description: 'Get the status of a single file restore push operation.',
    inputSchema: {
      type: 'object',
      properties: {
        file_restore_id: { type: 'string', description: 'File restore ID.' },
        file_restore_push_id: { type: 'string', description: 'File restore push ID.' },
      },
      required: ['file_restore_id', 'file_restore_push_id'],
    },
  },
];

const TOOL_NAMES = new Set(RESTORE_FILE_TOOLS.map((t) => t.name));
export function isRestoreFileTool(name: string): boolean {
  return TOOL_NAMES.has(name);
}

export async function handleRestoreFileTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const creds = getCredentials();
  const missing = requireCredentials(creds);
  if (missing) return missing;

  try {
    if (name === 'slide_list_file_restores') {
      return textResult(
        await listFileRestores(creds!, {
          offset: args.offset as number | undefined,
          limit: args.limit as number | undefined,
          sort_by: args.sort_by as 'id' | undefined,
          sort_asc: args.sort_asc as boolean | undefined,
          created_after: args.created_after as string | undefined,
          created_before: args.created_before as string | undefined,
        })
      );
    }

    if (name === 'slide_get_file_restore') {
      return textResult(await getFileRestore(creds!, args.file_restore_id as string));
    }

    if (name === 'slide_browse_file_restore') {
      return textResult(
        await browseFileRestore(creds!, args.file_restore_id as string, {
          path: args.path as string | undefined,
          offset: args.offset as number | undefined,
          limit: args.limit as number | undefined,
        })
      );
    }

    if (name === 'slide_list_file_restore_pushes') {
      return textResult(
        await listFileRestorePushes(creds!, args.file_restore_id as string, {
          offset: args.offset as number | undefined,
          limit: args.limit as number | undefined,
          sort_by: args.sort_by as 'start_time' | undefined,
          sort_asc: args.sort_asc as boolean | undefined,
          start_time_after: args.start_time_after as string | undefined,
          start_time_before: args.start_time_before as string | undefined,
          end_time_after: args.end_time_after as string | undefined,
          end_time_before: args.end_time_before as string | undefined,
        })
      );
    }

    if (name === 'slide_get_file_restore_push') {
      return textResult(
        await getFileRestorePush(creds!, args.file_restore_id as string, args.file_restore_push_id as string)
      );
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (err) {
    return errorResult((err as Error).message);
  }
}
