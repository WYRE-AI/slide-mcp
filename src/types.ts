/**
 * Slide authenticates with a static bearer API token, issued per-account in
 * the Slide Console (Settings > API Keys) - not OAuth. This connector never
 * mints or refreshes anything: it only ever holds a live token, sent as
 * `Authorization: Bearer <token>` to api.slide.tech. See README's
 * Authentication section.
 */
export interface SlideCredentials {
  apiToken: string;
}

/** Thrown when Slide rejects the API token (HTTP 401) - distinct from rate limiting so callers get an honest error. */
export class SlideAuthError extends Error {}

/** Thrown when Slide rate-limits the request (HTTP 429) - distinct from an auth failure. */
export class SlideRateLimitError extends Error {}

/** Thrown for any other non-2xx / unexpected vendor response. */
export class SlideApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

export interface PageParams {
  offset?: number;
  limit?: number;
}

/** Shared paginated-list envelope for every Slide list endpoint (`{ data, pagination }`). */
export interface SlidePaginatedResponse<T> {
  data: T[];
  pagination?: { next_offset?: number };
  [key: string]: unknown;
}

// ---------------------------------------------------------------------
// Secret-bearing shapes. Named here (rather than left as `unknown`) so the
// sanitizers in client.ts can strip exactly these fields by key, and so a
// future change to the upstream response shape doesn't silently stop
// stripping them. See README's Scope section for the full accounting of
// what's excluded and why.
// ---------------------------------------------------------------------

/** Raw Agent.passphrases[] entry - `passphrase` is the live secret that secures the agent's backup data. */
export interface AgentPassphraseRaw {
  agent_passphrase_id?: string;
  name?: string;
  passphrase?: string;
  [key: string]: unknown;
}

export interface AgentRaw {
  agent_id?: string;
  passphrases?: AgentPassphraseRaw[];
  [key: string]: unknown;
}

/** Raw Network.ipsec_conns[] entry - `psk` is the live IPsec pre-shared key. */
export interface NetworkIPSecConnRaw {
  ipsec_id?: string;
  psk?: string;
  [key: string]: unknown;
}

/** Raw Network.wg_peers[] entry - `wg_private_key` is the live WireGuard private key (`wg_public_key` is not secret). */
export interface NetworkWGPeerRaw {
  wg_peer_id?: string;
  wg_private_key?: string;
  [key: string]: unknown;
}

export interface NetworkRaw {
  network_id?: string;
  ipsec_conns?: NetworkIPSecConnRaw[];
  wg_peers?: NetworkWGPeerRaw[];
  [key: string]: unknown;
}

/** Raw VirtualMachine object - `vnc_password` is the live VNC password (the `vnc` connection-info array and `vnc_enabled` flag are not secret). */
export interface VirtualMachineRaw {
  virt_id?: string;
  vnc_password?: string;
  [key: string]: unknown;
}

/** Raw ImageExport object - `password` is the live Samba password for the exported share. */
export interface ImageExportRaw {
  image_export_id?: string;
  password?: string;
  [key: string]: unknown;
}
