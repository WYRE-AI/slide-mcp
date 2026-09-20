import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { browseImageExport, getCredentials, getImageExport, listImageExports } from '../client.js';
import type { CallToolResult } from './types.js';
import { CREATED_RANGE_PROPERTIES, PAGE_PARAMS_PROPERTIES, errorResult, requireCredentials, sortParams, textResult } from './shared.js';

export const RESTORE_IMAGE_TOOLS: Tool[] = [
  {
    name: 'slide_list_image_exports',
    description:
      'List image exports (a snapshot exported as an ISCSI/NFS/Samba-mountable disk image), filterable by creation date. The live Samba password is never returned, even though the underlying Slide API includes it.',
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
    name: 'slide_get_image_export',
    description: 'Get a single image export by ID - image type, ISCSI/NFS connection info. Same secret redaction as slide_list_image_exports: no Samba password.',
    inputSchema: {
      type: 'object',
      properties: {
        image_export_id: { type: 'string', description: 'Image export ID.' },
      },
      required: ['image_export_id'],
    },
  },
  {
    name: 'slide_browse_image_export',
    description: 'Browse the files and folders exposed by an image export.',
    inputSchema: {
      type: 'object',
      properties: {
        image_export_id: { type: 'string', description: 'Image export ID.' },
        ...PAGE_PARAMS_PROPERTIES,
      },
      required: ['image_export_id'],
    },
  },
];

const TOOL_NAMES = new Set(RESTORE_IMAGE_TOOLS.map((t) => t.name));
export function isRestoreImageTool(name: string): boolean {
  return TOOL_NAMES.has(name);
}

export async function handleRestoreImageTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const creds = getCredentials();
  const missing = requireCredentials(creds);
  if (missing) return missing;

  try {
    if (name === 'slide_list_image_exports') {
      return textResult(
        await listImageExports(creds!, {
          offset: args.offset as number | undefined,
          limit: args.limit as number | undefined,
          sort_by: args.sort_by as 'id' | undefined,
          sort_asc: args.sort_asc as boolean | undefined,
          created_after: args.created_after as string | undefined,
          created_before: args.created_before as string | undefined,
        })
      );
    }

    if (name === 'slide_get_image_export') {
      return textResult(await getImageExport(creds!, args.image_export_id as string));
    }

    if (name === 'slide_browse_image_export') {
      return textResult(
        await browseImageExport(creds!, args.image_export_id as string, {
          offset: args.offset as number | undefined,
          limit: args.limit as number | undefined,
        })
      );
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (err) {
    return errorResult((err as Error).message);
  }
}
