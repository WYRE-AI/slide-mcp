import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getCredentials, listBillingCreditMemos, listBillingInvoices, listBillingSubscriptions } from '../client.js';
import type { CallToolResult } from './types.js';
import { PAGE_PARAMS_PROPERTIES, errorResult, requireCredentials, textResult } from './shared.js';

// NOTE: the PDF-download endpoints for credit memos and invoices
// (`GET /v1/billing/credit-memo/{id}/pdf`, `GET /v1/billing/invoice/{id}/pdf`)
// are deliberately NOT implemented - they return raw `application/pdf`
// binary, not structured JSON data. See README's Scope section.

export const BILLING_TOOLS: Tool[] = [
  {
    name: 'slide_list_billing_credit_memos',
    description: 'List billing credit memos.',
    inputSchema: {
      type: 'object',
      properties: { ...PAGE_PARAMS_PROPERTIES },
    },
  },
  {
    name: 'slide_list_billing_invoices',
    description: 'List billing invoices.',
    inputSchema: {
      type: 'object',
      properties: { ...PAGE_PARAMS_PROPERTIES },
    },
  },
  {
    name: 'slide_list_billing_subscriptions',
    description: 'List subscriptions and device licenses.',
    inputSchema: {
      type: 'object',
      properties: { ...PAGE_PARAMS_PROPERTIES },
    },
  },
];

const TOOL_NAMES = new Set(BILLING_TOOLS.map((t) => t.name));
export function isBillingTool(name: string): boolean {
  return TOOL_NAMES.has(name);
}

export async function handleBillingTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const creds = getCredentials();
  const missing = requireCredentials(creds);
  if (missing) return missing;

  try {
    const params = { offset: args.offset as number | undefined, limit: args.limit as number | undefined };

    if (name === 'slide_list_billing_credit_memos') {
      return textResult(await listBillingCreditMemos(creds!, params));
    }

    if (name === 'slide_list_billing_invoices') {
      return textResult(await listBillingInvoices(creds!, params));
    }

    if (name === 'slide_list_billing_subscriptions') {
      return textResult(await listBillingSubscriptions(creds!, params));
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (err) {
    return errorResult((err as Error).message);
  }
}
