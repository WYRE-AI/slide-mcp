import type { SlideCredentials } from '../types.js';
import type { CallToolResult } from './types.js';

export function textResult(value: unknown): CallToolResult {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: 'text', text }] };
}

export function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

/** Returns an error CallToolResult if credentials are missing, else null. */
export function requireCredentials(creds: SlideCredentials | null): CallToolResult | null {
  if (!creds) {
    return errorResult('No Slide credentials configured. Set SLIDE_API_TOKEN.');
  }
  return null;
}

/** Shared input-schema fragment for the offset/limit-paginated list endpoints. */
export const PAGE_PARAMS_PROPERTIES = {
  offset: { type: 'number', description: 'Starting index for pagination. Defaults to 0.' },
  limit: { type: 'number', description: 'Number of items to return per page. Defaults to 10.' },
} as const;

/** Shared input-schema fragment for the `sort_by`/`sort_asc` pair, parameterized by the field's allowed values. */
export function sortParams(sortByEnum: readonly string[], defaultField: string) {
  return {
    sort_by: {
      type: 'string',
      enum: sortByEnum,
      description: `Field to sort by. Defaults to "${defaultField}".`,
    },
    sort_asc: { type: 'boolean', description: 'Sort in ascending order. Defaults to false (descending).' },
  } as const;
}

/** Shared input-schema fragment for a `created_after`/`created_before` RFC3339 filter pair. */
export const CREATED_RANGE_PROPERTIES = {
  created_after: { type: 'string', description: 'Filter results to after a specific creation timestamp (RFC3339 format).' },
  created_before: { type: 'string', description: 'Filter results to before a specific creation timestamp (RFC3339 format).' },
} as const;
