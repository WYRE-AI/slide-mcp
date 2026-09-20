import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  getAgent,
  getAgentFileVersions,
  getAgentServices,
  getCredentials,
  listAgents,
  searchAgentFiles,
} from '../client.js';
import type { CallToolResult } from './types.js';
import { PAGE_PARAMS_PROPERTIES, errorResult, requireCredentials, sortParams, textResult } from './shared.js';

export const AGENT_TOOLS: Tool[] = [
  {
    name: 'slide_list_agents',
    description:
      'List agents (protected systems - servers, workstations, NAS shares - each paired to a Slide device), filterable by device, client, type, and pairing date. Never returns the agent-encryption passphrase, even if one is set - see slide_get_agent.',
    inputSchema: {
      type: 'object',
      properties: {
        device_id: { type: 'string', description: 'Filter agents paired to a specific device.' },
        client_id: { type: 'string', description: 'Filter agents belonging to a specific client.' },
        ...PAGE_PARAMS_PROPERTIES,
        ...sortParams(['id', 'hostname', 'name'], 'hostname'),
        paired_after: { type: 'string', description: 'Filter agents to after a specific pairing timestamp (RFC3339 format).' },
        paired_before: { type: 'string', description: 'Filter agents to before a specific pairing timestamp (RFC3339 format).' },
        agent_type: { type: 'string', enum: ['windows', 'linux', 'nas'], description: 'Filter agents by type.' },
      },
    },
  },
  {
    name: 'slide_get_agent',
    description:
      "Get a single agent by ID - backup schedule, retention policy, volumes, alert configs, and connection info. If the agent has user-managed passphrases, only their names/IDs are returned, never the passphrase value itself.",
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent ID.' },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'slide_search_agent_files',
    description: "Search the file paths indexed on an agent's protected system (requires file indexing to be enabled on the agent).",
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent ID.' },
        search_term: { type: 'string', description: 'The search term for file paths. Must be URL-encoded.' },
        ...PAGE_PARAMS_PROPERTIES,
        ...sortParams(['path', 'last_modified', 'file_size'], 'path'),
      },
      required: ['agent_id', 'search_term'],
    },
  },
  {
    name: 'slide_get_agent_file_versions',
    description: 'Get the snapshot versions available for a specific file path on an agent.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent ID.' },
        path: { type: 'string', description: 'The path of the file to get versions for. Must be URL-encoded.' },
        ...PAGE_PARAMS_PROPERTIES,
        ...sortParams(['created_time', 'last_modified', 'file_size'], 'created_time'),
      },
      required: ['agent_id', 'path'],
    },
  },
  {
    name: 'slide_get_agent_services',
    description: 'Get the list of backed-up services (e.g. installed applications, database engines) detected on an agent.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Agent ID.' },
      },
      required: ['agent_id'],
    },
  },
];

const TOOL_NAMES = new Set(AGENT_TOOLS.map((t) => t.name));
export function isAgentTool(name: string): boolean {
  return TOOL_NAMES.has(name);
}

export async function handleAgentTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const creds = getCredentials();
  const missing = requireCredentials(creds);
  if (missing) return missing;

  try {
    if (name === 'slide_list_agents') {
      return textResult(
        await listAgents(creds!, {
          device_id: args.device_id as string | undefined,
          client_id: args.client_id as string | undefined,
          offset: args.offset as number | undefined,
          limit: args.limit as number | undefined,
          sort_by: args.sort_by as 'id' | 'hostname' | 'name' | undefined,
          sort_asc: args.sort_asc as boolean | undefined,
          paired_after: args.paired_after as string | undefined,
          paired_before: args.paired_before as string | undefined,
          agent_type: args.agent_type as 'windows' | 'linux' | 'nas' | undefined,
        })
      );
    }

    if (name === 'slide_get_agent') {
      return textResult(await getAgent(creds!, args.agent_id as string));
    }

    if (name === 'slide_search_agent_files') {
      return textResult(
        await searchAgentFiles(creds!, args.agent_id as string, {
          search_term: args.search_term as string,
          offset: args.offset as number | undefined,
          limit: args.limit as number | undefined,
          sort_by: args.sort_by as 'path' | 'last_modified' | 'file_size' | undefined,
          sort_asc: args.sort_asc as boolean | undefined,
        })
      );
    }

    if (name === 'slide_get_agent_file_versions') {
      return textResult(
        await getAgentFileVersions(creds!, args.agent_id as string, {
          path: args.path as string,
          offset: args.offset as number | undefined,
          limit: args.limit as number | undefined,
          sort_by: args.sort_by as 'created_time' | 'last_modified' | 'file_size' | undefined,
          sort_asc: args.sort_asc as boolean | undefined,
        })
      );
    }

    if (name === 'slide_get_agent_services') {
      return textResult(await getAgentServices(creds!, args.agent_id as string));
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (err) {
    return errorResult((err as Error).message);
  }
}
