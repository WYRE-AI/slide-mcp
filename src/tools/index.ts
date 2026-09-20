import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ACCOUNT_TOOLS, handleAccountTool, isAccountTool } from './accounts.js';
import { AGENT_TOOLS, handleAgentTool, isAgentTool } from './agents.js';
import { ALERT_TOOLS, handleAlertTool, isAlertTool } from './alerts.js';
import { AUDIT_TOOLS, handleAuditTool, isAuditTool } from './audits.js';
import { BACKUP_TOOLS, handleBackupTool, isBackupTool } from './backups.js';
import { BILLING_TOOLS, handleBillingTool, isBillingTool } from './billing.js';
import { CLIENT_TOOLS, handleClientTool, isClientTool } from './clients.js';
import { DEVICE_TOOLS, handleDeviceTool, isDeviceTool } from './devices.js';
import { NETWORK_TOOLS, handleNetworkTool, isNetworkTool } from './networks.js';
import { RESTORE_FILE_TOOLS, handleRestoreFileTool, isRestoreFileTool } from './restore-file.js';
import { RESTORE_IMAGE_TOOLS, handleRestoreImageTool, isRestoreImageTool } from './restore-image.js';
import { RESTORE_VIRT_TOOLS, handleRestoreVirtTool, isRestoreVirtTool } from './restore-virt.js';
import { SNAPSHOT_TOOLS, handleSnapshotTool, isSnapshotTool } from './snapshots.js';
import { USER_TOOLS, handleUserTool, isUserTool } from './users.js';
import type { CallToolResult } from './types.js';

export const ALL_TOOLS: Tool[] = [
  ...ACCOUNT_TOOLS,
  ...AGENT_TOOLS,
  ...ALERT_TOOLS,
  ...AUDIT_TOOLS,
  ...BACKUP_TOOLS,
  ...BILLING_TOOLS,
  ...CLIENT_TOOLS,
  ...DEVICE_TOOLS,
  ...NETWORK_TOOLS,
  ...RESTORE_FILE_TOOLS,
  ...RESTORE_IMAGE_TOOLS,
  ...RESTORE_VIRT_TOOLS,
  ...SNAPSHOT_TOOLS,
  ...USER_TOOLS,
];

export async function dispatchToolCall(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  if (isAccountTool(name)) return handleAccountTool(name, args);
  if (isAgentTool(name)) return handleAgentTool(name, args);
  if (isAlertTool(name)) return handleAlertTool(name, args);
  if (isAuditTool(name)) return handleAuditTool(name, args);
  if (isBackupTool(name)) return handleBackupTool(name, args);
  if (isBillingTool(name)) return handleBillingTool(name, args);
  if (isClientTool(name)) return handleClientTool(name, args);
  if (isDeviceTool(name)) return handleDeviceTool(name, args);
  if (isNetworkTool(name)) return handleNetworkTool(name, args);
  if (isRestoreFileTool(name)) return handleRestoreFileTool(name, args);
  if (isRestoreImageTool(name)) return handleRestoreImageTool(name, args);
  if (isRestoreVirtTool(name)) return handleRestoreVirtTool(name, args);
  if (isSnapshotTool(name)) return handleSnapshotTool(name, args);
  if (isUserTool(name)) return handleUserTool(name, args);
  return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
}
