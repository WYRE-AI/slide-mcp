import { AsyncLocalStorage } from 'node:async_hooks';
import { logger } from './utils/logger.js';
import { SlideApiError, SlideAuthError, SlideRateLimitError } from './types.js';
import type {
  AgentPassphraseRaw,
  AgentRaw,
  ImageExportRaw,
  NetworkIPSecConnRaw,
  NetworkRaw,
  NetworkWGPeerRaw,
  PageParams,
  SlideCredentials,
  SlidePaginatedResponse,
  VirtualMachineRaw,
} from './types.js';

export const BASE_URL = 'https://api.slide.tech';

// Request-scoped credential store. In gateway mode the HTTP layer runs each
// request inside runWithCredentials({apiToken}); getCredentials() reads
// from it. Falls back to process.env for stdio/single-tenant mode.
const credStore = new AsyncLocalStorage<SlideCredentials>();

export function runWithCredentials<T>(creds: SlideCredentials, fn: () => T): T {
  return credStore.run(creds, fn);
}

export function getCredentials(): SlideCredentials | null {
  const scoped = credStore.getStore();
  if (scoped?.apiToken) return scoped;
  const apiToken = process.env.SLIDE_API_TOKEN;
  if (!apiToken) {
    logger.warn('Missing credentials', { hasApiToken: !!apiToken });
    return null;
  }
  return { apiToken };
}

function buildQuery(params: Record<string, unknown> = {}): URLSearchParams {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    qs.append(key, String(value));
  }
  return qs;
}

async function doGet<T>(
  creds: SlideCredentials,
  path: string,
  query?: Record<string, unknown>
): Promise<T> {
  const qs = query ? buildQuery(query).toString() : '';
  const url = `${BASE_URL}${path}${qs ? `?${qs}` : ''}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${creds.apiToken}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });

  // 401 (invalid/expired token) and 429 (rate-limited) are distinct failure
  // modes with distinct remediations - grouping them under one generic
  // auth-error class hides a transient rate limit behind a message that
  // reads like a bad/expired token.
  if (res.status === 401) {
    throw new SlideAuthError(`Slide rejected the API token (HTTP 401): ${path}`);
  }
  if (res.status === 429) {
    throw new SlideRateLimitError(`Slide rate-limited the request (HTTP 429): ${path}`);
  }
  if (!res.ok) {
    throw new SlideApiError(`Slide ${path} failed: HTTP ${res.status}`, res.status);
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------
// Sanitizers - strip live secrets out of raw upstream responses before
// they ever reach a tool result. Applied to both list and single-get
// responses. See README's Scope section for the full accounting of what's
// excluded and why; each of these mirrors one named exclusion there.
// ---------------------------------------------------------------------

/** Strips `passphrases[].passphrase` (the live agent-encryption passphrase) from an Agent object. */
export function sanitizeAgent<T extends AgentRaw>(agent: T): Omit<T, 'passphrases'> & { passphrases?: Omit<AgentPassphraseRaw, 'passphrase'>[] } {
  if (!agent || typeof agent !== 'object') return agent;
  const { passphrases, ...rest } = agent;
  if (!passphrases) return rest as typeof rest & { passphrases?: undefined };
  return {
    ...rest,
    passphrases: passphrases.map(({ passphrase: _passphrase, ...safe }) => safe),
  } as Omit<T, 'passphrases'> & { passphrases?: Omit<AgentPassphraseRaw, 'passphrase'>[] };
}

/** Strips `ipsec_conns[].psk` (IPsec pre-shared key) and `wg_peers[].wg_private_key` (WireGuard private key) from a Network object. */
export function sanitizeNetwork<T extends NetworkRaw>(network: T): T {
  if (!network || typeof network !== 'object') return network;
  const sanitized: NetworkRaw = { ...network };
  if (network.ipsec_conns) {
    sanitized.ipsec_conns = network.ipsec_conns.map(
      ({ psk: _psk, ...safe }: NetworkIPSecConnRaw) => safe
    );
  }
  if (network.wg_peers) {
    sanitized.wg_peers = network.wg_peers.map(
      ({ wg_private_key: _wg_private_key, ...safe }: NetworkWGPeerRaw) => safe
    );
  }
  return sanitized as T;
}

/** Strips `vnc_password` (live VNC password) from a VirtualMachine object. `vnc` (host/port/websocket_uri) and `vnc_enabled` are not secret and are kept. */
export function sanitizeVirtualMachine<T extends VirtualMachineRaw>(vm: T): Omit<T, 'vnc_password'> {
  if (!vm || typeof vm !== 'object') return vm;
  const { vnc_password: _vnc_password, ...safe } = vm;
  return safe;
}

/** Strips `password` (live Samba password for the exported share) from an ImageExport object. */
export function sanitizeImageExport<T extends ImageExportRaw>(image: T): Omit<T, 'password'> {
  if (!image || typeof image !== 'object') return image;
  const { password: _password, ...safe } = image;
  return safe;
}

function sanitizeList<T>(resp: SlidePaginatedResponse<T>, sanitize: (item: T) => unknown): SlidePaginatedResponse<unknown> {
  return { ...resp, data: (resp.data || []).map(sanitize) };
}

// ---------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------

export interface ListAccountsParams extends PageParams {
  sort_by?: 'name';
  sort_asc?: boolean;
  created_after?: string;
  created_before?: string;
}

export async function listAccounts(creds: SlideCredentials, params: ListAccountsParams = {}) {
  return doGet<SlidePaginatedResponse<Record<string, unknown>>>(creds, '/v1/account', { ...params });
}

export async function getAccount(creds: SlideCredentials, accountId: string) {
  return doGet<Record<string, unknown>>(creds, `/v1/account/${encodeURIComponent(accountId)}`);
}

// ---------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------

export interface ListAgentsParams extends PageParams {
  device_id?: string;
  client_id?: string;
  sort_by?: 'id' | 'hostname' | 'name';
  sort_asc?: boolean;
  paired_before?: string;
  paired_after?: string;
  agent_type?: 'windows' | 'linux' | 'nas';
}

export async function listAgents(creds: SlideCredentials, params: ListAgentsParams = {}) {
  const raw = await doGet<SlidePaginatedResponse<AgentRaw>>(creds, '/v1/agent', { ...params });
  return sanitizeList(raw, sanitizeAgent);
}

export async function getAgent(creds: SlideCredentials, agentId: string) {
  const raw = await doGet<AgentRaw>(creds, `/v1/agent/${encodeURIComponent(agentId)}`);
  return sanitizeAgent(raw);
}

export interface SearchAgentFilesParams extends PageParams {
  search_term: string;
  sort_by?: 'path' | 'last_modified' | 'file_size';
  sort_asc?: boolean;
}

export async function searchAgentFiles(creds: SlideCredentials, agentId: string, params: SearchAgentFilesParams) {
  return doGet<SlidePaginatedResponse<Record<string, unknown>>>(
    creds,
    `/v1/agent/${encodeURIComponent(agentId)}/file-search`,
    { ...params }
  );
}

export interface GetAgentFileVersionsParams extends PageParams {
  path: string;
  sort_by?: 'created_time' | 'last_modified' | 'file_size';
  sort_asc?: boolean;
}

export async function getAgentFileVersions(creds: SlideCredentials, agentId: string, params: GetAgentFileVersionsParams) {
  return doGet<SlidePaginatedResponse<Record<string, unknown>>>(
    creds,
    `/v1/agent/${encodeURIComponent(agentId)}/file-search/version`,
    { ...params }
  );
}

export async function getAgentServices(creds: SlideCredentials, agentId: string) {
  return doGet<{ data: Record<string, unknown>[] }>(creds, `/v1/agent/${encodeURIComponent(agentId)}/service`);
}

// ---------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------

export interface ListAlertsParams extends PageParams {
  device_id?: string;
  agent_id?: string;
  resolved?: boolean;
  sort_by?: 'created';
  sort_asc?: boolean;
  created_after?: string;
  created_before?: string;
}

export async function listAlerts(creds: SlideCredentials, params: ListAlertsParams = {}) {
  return doGet<SlidePaginatedResponse<Record<string, unknown>>>(creds, '/v1/alert', { ...params });
}

export async function getAlert(creds: SlideCredentials, alertId: string) {
  return doGet<Record<string, unknown>>(creds, `/v1/alert/${encodeURIComponent(alertId)}`);
}

// ---------------------------------------------------------------------
// Audits
// ---------------------------------------------------------------------

export interface ListAuditLogsParams extends PageParams {
  audit_action_name?: string;
  audit_resource_type_name?: string;
  client_id?: string;
  sort_by?: 'audit_time';
  sort_asc?: boolean;
  audit_time_before?: string;
  audit_time_after?: string;
}

export async function listAuditLogs(creds: SlideCredentials, params: ListAuditLogsParams = {}) {
  return doGet<SlidePaginatedResponse<Record<string, unknown>>>(creds, '/v1/audit', { ...params });
}

export interface ListAuditActionsParams extends PageParams {
  sort_by?: 'name';
  sort_asc?: boolean;
}

export async function listAuditActions(creds: SlideCredentials, params: ListAuditActionsParams = {}) {
  return doGet<SlidePaginatedResponse<Record<string, unknown>>>(creds, '/v1/audit/action', { ...params });
}

export interface ListAuditResourceTypesParams extends PageParams {
  sort_by?: 'name';
  sort_asc?: boolean;
}

export async function listAuditResourceTypes(creds: SlideCredentials, params: ListAuditResourceTypesParams = {}) {
  return doGet<SlidePaginatedResponse<Record<string, unknown>>>(creds, '/v1/audit/resource', { ...params });
}

export async function getAuditLog(creds: SlideCredentials, auditId: string) {
  return doGet<Record<string, unknown>>(creds, `/v1/audit/${encodeURIComponent(auditId)}`);
}

// ---------------------------------------------------------------------
// Backups
// ---------------------------------------------------------------------

export interface ListBackupsParams extends PageParams {
  agent_id?: string;
  snapshot_id?: string;
  device_id?: string;
  backup_started_after?: string;
  backup_started_before?: string;
  backup_ended_after?: string;
  backup_ended_before?: string;
  sort_by?: 'id' | 'start_time';
  sort_asc?: boolean;
}

export async function listBackups(creds: SlideCredentials, params: ListBackupsParams = {}) {
  return doGet<SlidePaginatedResponse<Record<string, unknown>>>(creds, '/v1/backup', { ...params });
}

export async function getBackup(creds: SlideCredentials, backupId: string) {
  return doGet<Record<string, unknown>>(creds, `/v1/backup/${encodeURIComponent(backupId)}`);
}

// ---------------------------------------------------------------------
// Billing
//
// The two PDF-download endpoints (BillingCreditMemoPDF, BillingInvoicePDF)
// are deliberately NOT implemented here: they return raw `application/pdf`
// binary, not structured JSON data - same "not tool-shaped" call as
// cyberqp-mcp's excluded installer-download endpoint. See README's Scope
// section.
// ---------------------------------------------------------------------

export interface ListBillingParams extends PageParams {}

export async function listBillingCreditMemos(creds: SlideCredentials, params: ListBillingParams = {}) {
  return doGet<SlidePaginatedResponse<Record<string, unknown>>>(creds, '/v1/billing/credit-memo', { ...params });
}

export async function listBillingInvoices(creds: SlideCredentials, params: ListBillingParams = {}) {
  return doGet<SlidePaginatedResponse<Record<string, unknown>>>(creds, '/v1/billing/invoice', { ...params });
}

export async function listBillingSubscriptions(creds: SlideCredentials, params: ListBillingParams = {}) {
  return doGet<SlidePaginatedResponse<Record<string, unknown>>>(creds, '/v1/billing/subscription', { ...params });
}

// ---------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------

export interface ListClientsParams extends PageParams {
  sort_by?: 'id';
  sort_asc?: boolean;
  created_after?: string;
  created_before?: string;
}

export async function listClients(creds: SlideCredentials, params: ListClientsParams = {}) {
  return doGet<SlidePaginatedResponse<Record<string, unknown>>>(creds, '/v1/client', { ...params });
}

export async function getClient(creds: SlideCredentials, clientId: string) {
  return doGet<Record<string, unknown>>(creds, `/v1/client/${encodeURIComponent(clientId)}`);
}

// ---------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------

export interface ListDevicesParams extends PageParams {
  sort_by?: 'hostname';
  sort_asc?: boolean;
  client_id?: string;
  created_after?: string;
  created_before?: string;
}

export async function listDevices(creds: SlideCredentials, params: ListDevicesParams = {}) {
  return doGet<SlidePaginatedResponse<Record<string, unknown>>>(creds, '/v1/device', { ...params });
}

export async function getDevice(creds: SlideCredentials, deviceId: string) {
  return doGet<Record<string, unknown>>(creds, `/v1/device/${encodeURIComponent(deviceId)}`);
}

export async function getDeviceNetwork(creds: SlideCredentials, deviceId: string) {
  return doGet<Record<string, unknown>>(creds, `/v1/device/${encodeURIComponent(deviceId)}/network`);
}

export async function listDeviceVlans(creds: SlideCredentials, deviceId: string) {
  return doGet<{ data: Record<string, unknown>[] }>(creds, `/v1/device/${encodeURIComponent(deviceId)}/vlan`);
}

export async function getDeviceVlan(creds: SlideCredentials, deviceId: string, vlanId: string) {
  return doGet<Record<string, unknown>>(
    creds,
    `/v1/device/${encodeURIComponent(deviceId)}/vlan/${encodeURIComponent(vlanId)}`
  );
}

// ---------------------------------------------------------------------
// Networks
// ---------------------------------------------------------------------

export interface ListNetworksParams extends PageParams {
  client_id?: string;
  sort_by?: 'id';
  sort_asc?: boolean;
  created_after?: string;
  created_before?: string;
}

export async function listNetworks(creds: SlideCredentials, params: ListNetworksParams = {}) {
  const raw = await doGet<SlidePaginatedResponse<NetworkRaw>>(creds, '/v1/network', { ...params });
  return sanitizeList(raw, sanitizeNetwork);
}

export async function getNetwork(creds: SlideCredentials, networkId: string) {
  const raw = await doGet<NetworkRaw>(creds, `/v1/network/${encodeURIComponent(networkId)}`);
  return sanitizeNetwork(raw);
}

// ---------------------------------------------------------------------
// Restores (File) + Restores (Push)
// ---------------------------------------------------------------------

export interface ListFileRestoresParams extends PageParams {
  sort_by?: 'id';
  sort_asc?: boolean;
  created_after?: string;
  created_before?: string;
}

export async function listFileRestores(creds: SlideCredentials, params: ListFileRestoresParams = {}) {
  return doGet<SlidePaginatedResponse<Record<string, unknown>>>(creds, '/v1/restore/file', { ...params });
}

export async function getFileRestore(creds: SlideCredentials, fileRestoreId: string) {
  return doGet<Record<string, unknown>>(creds, `/v1/restore/file/${encodeURIComponent(fileRestoreId)}`);
}

export interface BrowseFileRestoreParams extends PageParams {
  path?: string;
}

export async function browseFileRestore(creds: SlideCredentials, fileRestoreId: string, params: BrowseFileRestoreParams = {}) {
  return doGet<SlidePaginatedResponse<Record<string, unknown>>>(
    creds,
    `/v1/restore/file/${encodeURIComponent(fileRestoreId)}/browse`,
    { ...params }
  );
}

export interface ListFileRestorePushesParams extends PageParams {
  sort_by?: 'start_time';
  sort_asc?: boolean;
  start_time_before?: string;
  start_time_after?: string;
  end_time_before?: string;
  end_time_after?: string;
}

export async function listFileRestorePushes(creds: SlideCredentials, fileRestoreId: string, params: ListFileRestorePushesParams = {}) {
  return doGet<SlidePaginatedResponse<Record<string, unknown>>>(
    creds,
    `/v1/restore/file/${encodeURIComponent(fileRestoreId)}/push`,
    { ...params }
  );
}

export async function getFileRestorePush(creds: SlideCredentials, fileRestoreId: string, fileRestorePushId: string) {
  return doGet<Record<string, unknown>>(
    creds,
    `/v1/restore/file/${encodeURIComponent(fileRestoreId)}/push/${encodeURIComponent(fileRestorePushId)}`
  );
}

// ---------------------------------------------------------------------
// Restores (Image)
// ---------------------------------------------------------------------

export interface ListImageExportsParams extends PageParams {
  sort_by?: 'id';
  sort_asc?: boolean;
  created_after?: string;
  created_before?: string;
}

export async function listImageExports(creds: SlideCredentials, params: ListImageExportsParams = {}) {
  const raw = await doGet<SlidePaginatedResponse<ImageExportRaw>>(creds, '/v1/restore/image', { ...params });
  return sanitizeList(raw, sanitizeImageExport);
}

export async function getImageExport(creds: SlideCredentials, imageExportId: string) {
  const raw = await doGet<ImageExportRaw>(creds, `/v1/restore/image/${encodeURIComponent(imageExportId)}`);
  return sanitizeImageExport(raw);
}

export async function browseImageExport(creds: SlideCredentials, imageExportId: string, params: PageParams = {}) {
  return doGet<SlidePaginatedResponse<Record<string, unknown>>>(
    creds,
    `/v1/restore/image/${encodeURIComponent(imageExportId)}/browse`,
    { ...params }
  );
}

// ---------------------------------------------------------------------
// Restores (Virtual Machine)
// ---------------------------------------------------------------------

export interface ListVirtualMachinesParams extends PageParams {
  sort_by?: 'created';
  sort_asc?: boolean;
  created_after?: string;
  created_before?: string;
}

export async function listVirtualMachines(creds: SlideCredentials, params: ListVirtualMachinesParams = {}) {
  const raw = await doGet<SlidePaginatedResponse<VirtualMachineRaw>>(creds, '/v1/restore/virt', { ...params });
  return sanitizeList(raw, sanitizeVirtualMachine);
}

export async function getVirtualMachine(creds: SlideCredentials, virtId: string) {
  const raw = await doGet<VirtualMachineRaw>(creds, `/v1/restore/virt/${encodeURIComponent(virtId)}`);
  return sanitizeVirtualMachine(raw);
}

// ---------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------

export interface ListSnapshotsParams extends PageParams {
  agent_id?: string;
  snapshot_location?:
    | 'exists_local'
    | 'exists_cloud'
    | 'exists_deleted'
    | 'exists_deleted_retention'
    | 'exists_deleted_manual'
    | 'exists_deleted_other'
    | 'location_any';
  backup_started_after?: string;
  backup_started_before?: string;
  backup_ended_after?: string;
  backup_ended_before?: string;
  sort_by?: 'backup_start_time' | 'backup_end_time' | 'created';
  sort_asc?: boolean;
}

export async function listSnapshots(creds: SlideCredentials, params: ListSnapshotsParams = {}) {
  return doGet<SlidePaginatedResponse<Record<string, unknown>>>(creds, '/v1/snapshot', { ...params });
}

export async function getSnapshot(creds: SlideCredentials, snapshotId: string) {
  return doGet<Record<string, unknown>>(creds, `/v1/snapshot/${encodeURIComponent(snapshotId)}`);
}

export async function getSnapshotServiceVerification(creds: SlideCredentials, snapshotId: string) {
  return doGet<Record<string, unknown>>(creds, `/v1/snapshot/${encodeURIComponent(snapshotId)}/service-verification`);
}

// ---------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------

export interface ListUsersParams extends PageParams {
  sort_by?: 'id';
  sort_asc?: boolean;
  created_after?: string;
  created_before?: string;
}

export async function listUsers(creds: SlideCredentials, params: ListUsersParams = {}) {
  return doGet<SlidePaginatedResponse<Record<string, unknown>>>(creds, '/v1/user', { ...params });
}

export async function getUser(creds: SlideCredentials, userId: string) {
  return doGet<Record<string, unknown>>(creds, `/v1/user/${encodeURIComponent(userId)}`);
}

export async function getUserAvatar(creds: SlideCredentials, userId: string) {
  return doGet<{ avatar: string }>(creds, `/v1/user/${encodeURIComponent(userId)}/avatar`);
}
