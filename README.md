# Slide MCP Server

MCP server for [Slide](https://slide.tech/)'s backup/BDR (business continuity/disaster recovery) API - account, agent, device, network, backup, snapshot, and restore visibility, for AI assistants and the WYRE Conduit gateway.

## Authentication

Slide authenticates with a **static bearer API token**, issued per-account in the Slide Console (Settings > API Keys) - not OAuth. This connector never mints or refreshes anything: it only ever holds a live token, sent as `Authorization: Bearer <token>` to `api.slide.tech`. In gateway mode the token arrives per-request via the `X-Slide-Api-Token` header and a request missing that header is rejected. In local/stdio mode, and in HTTP `AUTH_MODE=env`, it's read from `SLIDE_API_TOKEN`.

## Configuration

Copy [`.env.example`](.env.example) and set the variables below. Leave `CONDUIT_S2S_SECRET` empty in that file.

| Env var | Description |
|---|---|
| `SLIDE_API_TOKEN` | Static bearer API token, issued in the Slide Console. Required for stdio and for HTTP `AUTH_MODE=env`. The gateway Compose service does not set it. |
| `MCP_TRANSPORT` | `stdio` (default) or `http`. |
| `AUTH_MODE` | `env` (default, reads `SLIDE_API_TOKEN`) or `gateway` (requires `X-Slide-Api-Token` on each `/mcp` request and never falls back to the environment). The Docker image and Compose file set `gateway`. |
| `CONDUIT_S2S_SECRET` | Required for HTTP. HMAC key for `X-Gateway-S2S` on `/mcp`. Generate with `openssl rand -hex 32`. If this is empty or a known placeholder (`changeme`, `your-s2s-secret`, `replace-with-a-real-secret`, and the other public example values), the HTTP server logs an error and exits non-zero. The value is never logged. Compose will not start when it is unset or empty. |
| `MCP_ALLOW_INSECURE_DEV` | Set to exactly `1` to start HTTP without `CONDUIT_S2S_SECRET`. Logs a warning, does not enforce `X-Gateway-S2S`, and binds `127.0.0.1` only (a wider `MCP_HTTP_HOST` is ignored). A known placeholder secret still refuses to start. Local development only. |
| `MCP_HTTP_HOST` | Bind address when `MCP_TRANSPORT=http`. Defaults to `127.0.0.1`. Honored when `CONDUIT_S2S_SECRET` is set. The container image sets `0.0.0.0`. With no secret, the listener is `127.0.0.1` only. |
| `MCP_HTTP_PORT` | HTTP port. Defaults to `8080`. |
| `LOG_LEVEL` | `debug` \| `info` (default) \| `warn` \| `error`. |

`/health` and `/healthz` stay unauthenticated and do not read credentials. The stdio transport does not use `CONDUIT_S2S_SECRET`.

### HTTP authentication

With `MCP_TRANSPORT=http` and `CONDUIT_S2S_SECRET` set, every `/mcp` request must include `X-Gateway-S2S`. The check is `verifyS2sHeader` in [`src/s2s-verify.ts`](src/s2s-verify.ts): the header value is `t=<unix seconds>,v1=<hex>`, where the hex is HMAC-SHA256 of the literal string `t=<unix seconds>` keyed with `CONDUIT_S2S_SECRET` (64 lowercase hex characters). The timestamp must be within 300 seconds of the server clock. A missing or invalid header is HTTP 401, before the Slide token is read.

```bash
TS=$(date +%s)
SIG=$(printf 't=%s' "$TS" | openssl dgst -sha256 -hmac "$CONDUIT_S2S_SECRET" -hex | awk '{print $NF}')
curl -sS http://127.0.0.1:8080/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H "X-Gateway-S2S: t=${TS},v1=${SIG}" \
  -H "X-Slide-Api-Token: $SLIDE_API_TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

In `AUTH_MODE=gateway`, `/mcp` also requires `X-Slide-Api-Token`. That header is the only credential source for the request. A missing header is HTTP 401 and does not fall back to `SLIDE_API_TOKEN`.

`AUTH_MODE=env` still requires a valid `X-Gateway-S2S` header, then uses `SLIDE_API_TOKEN` when the request does not carry `X-Slide-Api-Token`.

## Tools

### Accounts
- `slide_list_accounts` - list accounts, filterable by creation date.
- `slide_get_account` - get a single account by ID.

### Agents
- `slide_list_agents` - list agents (protected systems), filterable by device, client, type, and pairing date.
- `slide_get_agent` - get a single agent by ID (backup schedule, retention, volumes, alert configs).
- `slide_search_agent_files` - search the indexed file paths on an agent's protected system.
- `slide_get_agent_file_versions` - get the snapshot versions available for a file path on an agent.
- `slide_get_agent_services` - get the backed-up services detected on an agent.

### Alerts
- `slide_list_alerts` - list alerts, filterable by device, agent, resolved status, and creation date.
- `slide_get_alert` - get a single alert by ID.

### Audits
- `slide_list_audit_logs` - list audit log entries, filterable by action, resource type, client, and time range.
- `slide_list_audit_actions` - list the full set of audit action names.
- `slide_list_audit_resource_types` - list the full set of audit resource type names.
- `slide_get_audit_log` - get a single audit log entry by ID.

### Backups
- `slide_list_backups` - list backup attempts, filterable by agent, snapshot, device, and time range.
- `slide_get_backup` - get a single backup attempt by ID.

### Billing
- `slide_list_billing_credit_memos` - list billing credit memos.
- `slide_list_billing_invoices` - list billing invoices.
- `slide_list_billing_subscriptions` - list subscriptions and device licenses.

### Clients
- `slide_list_clients` - list clients (the MSP's end customers), filterable by creation date.
- `slide_get_client` - get a single client by ID.

### Devices
- `slide_list_devices` - list devices (physical/virtual Slide Boxes), filterable by client and creation date.
- `slide_get_device` - get a single device by ID.
- `slide_get_device_network` - get a device's network configuration.
- `slide_list_device_vlans` - list a device's configured VLANs.
- `slide_get_device_vlan` - get a single VLAN on a device by ID.

### Networks
- `slide_list_networks` - list disaster-recovery networks, filterable by client and creation date.
- `slide_get_network` - get a single network by ID (port forwards, IPsec connections, WireGuard peers).

### Restores (File)
- `slide_list_file_restores` - list file restores, filterable by creation date.
- `slide_get_file_restore` - get a single file restore by ID.
- `slide_browse_file_restore` - browse the files/folders exposed by a file restore.
- `slide_list_file_restore_pushes` - list push operations for a file restore, filterable by time range.
- `slide_get_file_restore_push` - get the status of a single file restore push.

### Restores (Image)
- `slide_list_image_exports` - list image exports, filterable by creation date.
- `slide_get_image_export` - get a single image export by ID.
- `slide_browse_image_export` - browse the files/folders exposed by an image export.

### Restores (Virtual Machine)
- `slide_list_virtual_machines` - list virtual machines created from a snapshot, filterable by creation date.
- `slide_get_virtual_machine` - get a single virtual machine by ID.

### Snapshots
- `slide_list_snapshots` - list snapshots, filterable by agent, location/deletion state, and time range.
- `slide_get_snapshot` - get a single snapshot by ID.
- `slide_get_snapshot_service_verification` - get service-verification results for a snapshot.

### Users
- `slide_list_users` - list users, filterable by creation date.
- `slide_get_user` - get a single user by ID.
- `slide_get_user_avatar` - get a user's avatar image (base64 data URL).

## Scope

**This is a deliberately read-only, non-credential-exposing v1 surface**, covering all 43 of Slide's non-secret-exposing GET endpoints. Slide is backup/DR infrastructure - several of its real endpoints return live secrets, and every mutating endpoint is out of scope for v1. None of the excluded material is implemented here, by design, not by oversight. Every tool is classified `isAdmin: true` in the Conduit wiring, given the sensitivity of backup/DR infrastructure data (client environments, device inventories, network topology).

**Secret-bearing fields - stripped from an otherwise-useful response, never implemented as a pass-through:**
- `Agent.passphrases[].passphrase` (the live agent-encryption passphrase) - stripped from `slide_list_agents` / `slide_get_agent`. The passphrase's `name` and `agent_passphrase_id` are kept.
- `Network.ipsec_conns[].psk` (the live IPsec pre-shared key) - stripped from `slide_list_networks` / `slide_get_network`.
- `Network.wg_peers[].wg_private_key` (the live WireGuard private key) - stripped from the same two tools. `wg_public_key` is not secret and is kept.
- `VirtualMachine.vnc_password` (the live VNC password) - stripped from `slide_list_virtual_machines` / `slide_get_virtual_machine`. The `vnc` connection-info array (host/port/websocket URI) and `vnc_enabled` are not secret and are kept.
- `ImageExport.password` (the live Samba password for the exported share) - stripped from `slide_list_image_exports` / `slide_get_image_export`. This field isn't one of Slide's headline "secret" endpoints, but it's the same class of live credential material as the four above, so it's held to the same bar.

**Hard-excluded (mutating) - every POST/PATCH/PUT/DELETE endpoint, never implemented:** creating/updating clients, networks, devices, agents, VLANs; starting backups; creating file/image/VM restores and push operations; managing IPsec connections, port forwards, and WireGuard peers; agent passphrase add/delete; device reboot/poweroff; and all other writes across every tag. This is real destructive/mutating infrastructure (delete client, delete network, delete restore, reboot device) - out of scope for v1 by design.

**Out of v1 scope** (not credential/provisioning, just not part of this connector's structured-data surface):
- `GET /v1/billing/credit-memo/{id}/pdf` (`BillingCreditMemoPDF`) - returns raw `application/pdf` binary, not structured data.
- `GET /v1/billing/invoice/{id}/pdf` (`BillingInvoicePDF`) - same.

They can be added as a follow-up if there's demand, after a deliberate scope decision - not by default.

## Credential scope

**This connector's own code is read-only by construction — but Slide also offers a real way to make the underlying credential read-only too, and we recommend using it.**

Slide documents six account roles: Account Owner, Account Admin, Business Continuity Technician, Billing, and **Read Only** (read-only access to all resources). An API token inherits the role of whoever generates it in the Slide Console (Settings → API Keys).

**Recommended: generate this connector's API token from a dedicated user with the Read Only role**, not from an Account Owner/Admin user. This means that even if the token is ever exposed outside Conduit's control (a credential-store compromise, a misconfigured log, etc.), it cannot be used to delete backups, restores, networks, or devices — matching this connector's own read-only code with a read-only credential, rather than relying on the connector's code as the only safeguard.

Two separate claims, kept at different confidence levels:
- **Structurally verified (checked directly, stated with full confidence):** this connector's own code makes zero mutating calls (`client.ts` has exactly one HTTP verb function, `doGet`), and strips five live secret fields (agent passphrase, IPsec PSK, WireGuard private key, VM VNC password, image-export Samba password) from every response before it reaches a tool result — see `secret-redaction.test.ts`.
- **Vendor-documented, not independently verified (hedged deliberately):** whether the Read Only role's restriction is enforced server-side against every mutating endpoint (vs. merely hidden in the console UI) has not been tested against a live Read Only account. This role is also opt-in, not default — a token from an Account Owner/Admin user (the common case for a fresh account) has no such restriction.

**Do not read this connector, or this README, as having established that every Slide token is read-only** — only that this connector's own code never attempts a mutation, and that Slide offers (but does not default to) a way to make the credential itself read-only as well.

## Development

```bash
npm install
npm run build
npm test
npm run lint   # tsc --noEmit
```

## Docker

The image listens on `0.0.0.0` inside the container (`MCP_HTTP_HOST`) and defaults to `AUTH_MODE=gateway`. Publish the port on loopback and pass the S2S secret. In gateway mode the Slide token arrives on each request as `X-Slide-Api-Token`. It is not read from the environment.

```bash
docker build -t slide-mcp .
docker run \
  -e CONDUIT_S2S_SECRET="$CONDUIT_S2S_SECRET" \
  -p 127.0.0.1:8080:8080 \
  slide-mcp
```

Compose refuses to start when `CONDUIT_S2S_SECRET` is unset or empty. The gateway service does not set `SLIDE_API_TOKEN` and does not use `env_file`, so a project `.env` cannot inject a static vendor credential. Compose still interpolates `CONDUIT_S2S_SECRET` from that file. The published port is `127.0.0.1:8080:8080`:

```bash
CONDUIT_S2S_SECRET="$CONDUIT_S2S_SECRET" docker compose up
```

Single-tenant HTTP (`AUTH_MODE=env`) still requires the S2S secret, then uses `SLIDE_API_TOKEN`:

```bash
docker run \
  -e CONDUIT_S2S_SECRET="$CONDUIT_S2S_SECRET" \
  -e AUTH_MODE=env \
  -e SLIDE_API_TOKEN="$SLIDE_API_TOKEN" \
  -p 127.0.0.1:8080:8080 \
  slide-mcp
```

Local HTTP without a secret is development-only. It binds `127.0.0.1` only (a non-loopback `MCP_HTTP_HOST`, including `0.0.0.0`, is ignored and the override is logged) and logs a warning:

```bash
MCP_TRANSPORT=http MCP_ALLOW_INSECURE_DEV=1 npm run start:http
```
