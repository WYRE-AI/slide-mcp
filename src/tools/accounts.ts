import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getAccount, getCredentials, listAccounts } from '../client.js';
import type { CallToolResult } from './types.js';
import { CREATED_RANGE_PROPERTIES, PAGE_PARAMS_PROPERTIES, errorResult, requireCredentials, sortParams, textResult } from './shared.js';

export const ACCOUNT_TOOLS: Tool[] = [
  {
    name: 'slide_list_accounts',
    description: 'List Slide accounts (the top-level MSP/reseller billing entities), filterable by creation date.',
    inputSchema: {
      type: 'object',
      properties: {
        ...PAGE_PARAMS_PROPERTIES,
        ...sortParams(['name'], 'name'),
        ...CREATED_RANGE_PROPERTIES,
      },
    },
  },
  {
    name: 'slide_get_account',
    description: 'Get a single Slide account by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        account_id: { type: 'string', description: 'Account ID.' },
      },
      required: ['account_id'],
    },
  },
];

const TOOL_NAMES = new Set(ACCOUNT_TOOLS.map((t) => t.name));
export function isAccountTool(name: string): boolean {
  return TOOL_NAMES.has(name);
}

export async function handleAccountTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const creds = getCredentials();
  const missing = requireCredentials(creds);
  if (missing) return missing;

  try {
    if (name === 'slide_list_accounts') {
      return textResult(
        await listAccounts(creds!, {
          offset: args.offset as number | undefined,
          limit: args.limit as number | undefined,
          sort_by: args.sort_by as 'name' | undefined,
          sort_asc: args.sort_asc as boolean | undefined,
          created_after: args.created_after as string | undefined,
          created_before: args.created_before as string | undefined,
        })
      );
    }

    if (name === 'slide_get_account') {
      return textResult(await getAccount(creds!, args.account_id as string));
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (err) {
    return errorResult((err as Error).message);
  }
}
