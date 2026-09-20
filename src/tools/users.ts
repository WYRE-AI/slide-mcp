import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getCredentials, getUser, getUserAvatar, listUsers } from '../client.js';
import type { CallToolResult } from './types.js';
import { CREATED_RANGE_PROPERTIES, PAGE_PARAMS_PROPERTIES, errorResult, requireCredentials, sortParams, textResult } from './shared.js';

export const USER_TOOLS: Tool[] = [
  {
    name: 'slide_list_users',
    description: 'List users (technicians with console access), filterable by creation date.',
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
    name: 'slide_get_user',
    description: 'Get a single user by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: { type: 'string', description: 'User ID.' },
      },
      required: ['user_id'],
    },
  },
  {
    name: 'slide_get_user_avatar',
    description: "Get a user's avatar image, returned as a base64 data URL.",
    inputSchema: {
      type: 'object',
      properties: {
        user_id: { type: 'string', description: 'User ID.' },
      },
      required: ['user_id'],
    },
  },
];

const TOOL_NAMES = new Set(USER_TOOLS.map((t) => t.name));
export function isUserTool(name: string): boolean {
  return TOOL_NAMES.has(name);
}

export async function handleUserTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const creds = getCredentials();
  const missing = requireCredentials(creds);
  if (missing) return missing;

  try {
    if (name === 'slide_list_users') {
      return textResult(
        await listUsers(creds!, {
          offset: args.offset as number | undefined,
          limit: args.limit as number | undefined,
          sort_by: args.sort_by as 'id' | undefined,
          sort_asc: args.sort_asc as boolean | undefined,
          created_after: args.created_after as string | undefined,
          created_before: args.created_before as string | undefined,
        })
      );
    }

    if (name === 'slide_get_user') {
      return textResult(await getUser(creds!, args.user_id as string));
    }

    if (name === 'slide_get_user_avatar') {
      return textResult(await getUserAvatar(creds!, args.user_id as string));
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (err) {
    return errorResult((err as Error).message);
  }
}
