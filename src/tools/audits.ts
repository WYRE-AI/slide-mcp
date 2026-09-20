import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getAuditLog, getCredentials, listAuditActions, listAuditLogs, listAuditResourceTypes } from '../client.js';
import type { CallToolResult } from './types.js';
import { PAGE_PARAMS_PROPERTIES, errorResult, requireCredentials, sortParams, textResult } from './shared.js';

export const AUDIT_TOOLS: Tool[] = [
  {
    name: 'slide_list_audit_logs',
    description: 'List audit log entries, filterable by action name, resource type, client, and audit-time range.',
    inputSchema: {
      type: 'object',
      properties: {
        audit_action_name: { type: 'string', description: 'Filter by audit action name (see slide_list_audit_actions).' },
        audit_resource_type_name: { type: 'string', description: 'Filter by audit resource type name (see slide_list_audit_resource_types).' },
        client_id: { type: 'string', description: 'Filter by client.' },
        ...PAGE_PARAMS_PROPERTIES,
        ...sortParams(['audit_time'], 'audit_time'),
        audit_time_after: { type: 'string', description: 'Filter audit logs to after a specific audit timestamp (RFC3339 format).' },
        audit_time_before: { type: 'string', description: 'Filter audit logs to before a specific audit timestamp (RFC3339 format).' },
      },
    },
  },
  {
    name: 'slide_list_audit_actions',
    description: 'List the full set of audit action names usable in slide_list_audit_logs\' audit_action_name filter.',
    inputSchema: {
      type: 'object',
      properties: {
        ...PAGE_PARAMS_PROPERTIES,
        ...sortParams(['name'], 'name'),
      },
    },
  },
  {
    name: 'slide_list_audit_resource_types',
    description: 'List the full set of audit resource type names usable in slide_list_audit_logs\' audit_resource_type_name filter.',
    inputSchema: {
      type: 'object',
      properties: {
        ...PAGE_PARAMS_PROPERTIES,
        ...sortParams(['name'], 'name'),
      },
    },
  },
  {
    name: 'slide_get_audit_log',
    description: 'Get a single audit log entry by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        audit_id: { type: 'string', description: 'Audit log ID.' },
      },
      required: ['audit_id'],
    },
  },
];

const TOOL_NAMES = new Set(AUDIT_TOOLS.map((t) => t.name));
export function isAuditTool(name: string): boolean {
  return TOOL_NAMES.has(name);
}

export async function handleAuditTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const creds = getCredentials();
  const missing = requireCredentials(creds);
  if (missing) return missing;

  try {
    if (name === 'slide_list_audit_logs') {
      return textResult(
        await listAuditLogs(creds!, {
          audit_action_name: args.audit_action_name as string | undefined,
          audit_resource_type_name: args.audit_resource_type_name as string | undefined,
          client_id: args.client_id as string | undefined,
          offset: args.offset as number | undefined,
          limit: args.limit as number | undefined,
          sort_by: args.sort_by as 'audit_time' | undefined,
          sort_asc: args.sort_asc as boolean | undefined,
          audit_time_after: args.audit_time_after as string | undefined,
          audit_time_before: args.audit_time_before as string | undefined,
        })
      );
    }

    if (name === 'slide_list_audit_actions') {
      return textResult(
        await listAuditActions(creds!, {
          offset: args.offset as number | undefined,
          limit: args.limit as number | undefined,
          sort_by: args.sort_by as 'name' | undefined,
          sort_asc: args.sort_asc as boolean | undefined,
        })
      );
    }

    if (name === 'slide_list_audit_resource_types') {
      return textResult(
        await listAuditResourceTypes(creds!, {
          offset: args.offset as number | undefined,
          limit: args.limit as number | undefined,
          sort_by: args.sort_by as 'name' | undefined,
          sort_asc: args.sort_asc as boolean | undefined,
        })
      );
    }

    if (name === 'slide_get_audit_log') {
      return textResult(await getAuditLog(creds!, args.audit_id as string));
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (err) {
    return errorResult((err as Error).message);
  }
}
