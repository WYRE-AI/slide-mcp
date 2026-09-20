/**
 * These are the load-bearing scope-boundary tests for this connector: Slide's
 * real API returns live secrets (agent passphrase, IPsec PSK, WireGuard
 * private key, VNC password, image-export Samba password) alongside
 * otherwise-useful non-secret data. Every one of those fields must never
 * reach a tool result. See README's Scope section.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleAgentTool } from '../tools/agents.js';
import { handleNetworkTool } from '../tools/networks.js';
import { handleRestoreImageTool } from '../tools/restore-image.js';
import { handleRestoreVirtTool } from '../tools/restore-virt.js';
import { runWithCredentials } from '../client.js';
import { jsonResponse, textOf } from './test-helpers.js';

describe('secret redaction', () => {
  const fetchMock = vi.fn();
  const creds = { apiToken: 'token-1' };

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('slide_get_agent strips passphrases[].passphrase but keeps the passphrase name/id', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        agent_id: 'a1',
        hostname: 'db01',
        passphrases: [{ agent_passphrase_id: 'p1', name: 'primary', passphrase: 'super-secret-value' }],
      })
    );

    const result = await runWithCredentials(creds, () => handleAgentTool('slide_get_agent', { agent_id: 'a1' }));

    const text = textOf(result);
    expect(text).not.toMatch(/super-secret-value/);
    const parsed = JSON.parse(text);
    expect(parsed.passphrases).toEqual([{ agent_passphrase_id: 'p1', name: 'primary' }]);
    expect(parsed.hostname).toBe('db01');
  });

  it('slide_list_agents strips passphrases[].passphrase from every item in the list', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        pagination: {},
        data: [
          { agent_id: 'a1', passphrases: [{ agent_passphrase_id: 'p1', name: 'primary', passphrase: 'secret-1' }] },
          { agent_id: 'a2', passphrases: [] },
        ],
      })
    );

    const result = await runWithCredentials(creds, () => handleAgentTool('slide_list_agents', {}));

    const text = textOf(result);
    expect(text).not.toMatch(/secret-1/);
    const parsed = JSON.parse(text);
    expect(parsed.data[0].passphrases).toEqual([{ agent_passphrase_id: 'p1', name: 'primary' }]);
  });

  it('slide_list_networks strips ipsec_conns[].psk and wg_peers[].wg_private_key from every item in the list', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        pagination: {},
        data: [
          {
            network_id: 'n1',
            name: 'dr-net',
            ipsec_conns: [{ ipsec_id: 'i1', name: 'main-office', psk: 'shh-ipsec-key' }],
            wg_peers: [
              { wg_peer_id: 'w1', peer_name: 'laptop', wg_public_key: 'pub-key-ok', wg_private_key: 'shh-wg-key' },
            ],
          },
          { network_id: 'n2', name: 'empty-net', ipsec_conns: [], wg_peers: [] },
        ],
      })
    );

    const result = await runWithCredentials(creds, () => handleNetworkTool('slide_list_networks', {}));

    const text = textOf(result);
    expect(text).not.toMatch(/shh-ipsec-key/);
    expect(text).not.toMatch(/shh-wg-key/);
    const parsed = JSON.parse(text);
    expect(parsed.data[0].ipsec_conns).toEqual([{ ipsec_id: 'i1', name: 'main-office' }]);
    expect(parsed.data[0].wg_peers).toEqual([{ wg_peer_id: 'w1', peer_name: 'laptop', wg_public_key: 'pub-key-ok' }]);
  });

  it('slide_get_network strips ipsec_conns[].psk and wg_peers[].wg_private_key, keeps wg_public_key', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        network_id: 'n1',
        name: 'dr-net',
        ipsec_conns: [{ ipsec_id: 'i1', name: 'main-office', psk: 'shh-ipsec-key' }],
        wg_peers: [
          { wg_peer_id: 'w1', peer_name: 'laptop', wg_public_key: 'pub-key-ok', wg_private_key: 'shh-wg-key' },
        ],
      })
    );

    const result = await runWithCredentials(creds, () => handleNetworkTool('slide_get_network', { network_id: 'n1' }));

    const text = textOf(result);
    expect(text).not.toMatch(/shh-ipsec-key/);
    expect(text).not.toMatch(/shh-wg-key/);
    const parsed = JSON.parse(text);
    expect(parsed.ipsec_conns).toEqual([{ ipsec_id: 'i1', name: 'main-office' }]);
    expect(parsed.wg_peers).toEqual([{ wg_peer_id: 'w1', peer_name: 'laptop', wg_public_key: 'pub-key-ok' }]);
  });

  it('slide_list_image_exports strips the Samba password from every item in the list', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        pagination: {},
        data: [
          { image_export_id: 'ie1', image_type: 'vhdx', password: 'shh-samba-pw' },
          { image_export_id: 'ie2', image_type: 'raw', password: 'shh-samba-pw-2' },
        ],
      })
    );

    const result = await runWithCredentials(creds, () => handleRestoreImageTool('slide_list_image_exports', {}));

    const text = textOf(result);
    expect(text).not.toMatch(/shh-samba-pw/);
    const parsed = JSON.parse(text);
    expect(parsed.data).toEqual([
      { image_export_id: 'ie1', image_type: 'vhdx' },
      { image_export_id: 'ie2', image_type: 'raw' },
    ]);
  });

  it('slide_get_image_export strips the Samba password', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ image_export_id: 'ie1', image_type: 'vhdx', password: 'shh-samba-pw' })
    );

    const result = await runWithCredentials(creds, () =>
      handleRestoreImageTool('slide_get_image_export', { image_export_id: 'ie1' })
    );

    const text = textOf(result);
    expect(text).not.toMatch(/shh-samba-pw/);
    expect(JSON.parse(text)).toEqual({ image_export_id: 'ie1', image_type: 'vhdx' });
  });

  it('slide_list_virtual_machines strips vnc_password from every item, keeps vnc connection info and vnc_enabled', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        pagination: {},
        data: [
          {
            virt_id: 'v1',
            vnc_enabled: true,
            vnc: [{ host: '192.168.1.53', port: 12345, type: 'local' }],
            vnc_password: 'shh-vnc-pw',
          },
          { virt_id: 'v2', vnc_enabled: false, vnc: [], vnc_password: 'shh-vnc-pw-2' },
        ],
      })
    );

    const result = await runWithCredentials(creds, () => handleRestoreVirtTool('slide_list_virtual_machines', {}));

    const text = textOf(result);
    expect(text).not.toMatch(/shh-vnc-pw/);
    const parsed = JSON.parse(text);
    expect(parsed.data[0].vnc_enabled).toBe(true);
    expect(parsed.data[0].vnc).toEqual([{ host: '192.168.1.53', port: 12345, type: 'local' }]);
    expect(parsed.data[0].vnc_password).toBeUndefined();
    expect(parsed.data[1].vnc_password).toBeUndefined();
  });

  it('slide_get_virtual_machine strips vnc_password but keeps vnc connection info and vnc_enabled', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        virt_id: 'v1',
        vnc_enabled: true,
        vnc: [{ host: '192.168.1.53', port: 12345, type: 'local' }],
        vnc_password: 'shh-vnc-pw',
      })
    );

    const result = await runWithCredentials(creds, () =>
      handleRestoreVirtTool('slide_get_virtual_machine', { virt_id: 'v1' })
    );

    const text = textOf(result);
    expect(text).not.toMatch(/shh-vnc-pw/);
    const parsed = JSON.parse(text);
    expect(parsed.vnc_enabled).toBe(true);
    expect(parsed.vnc).toEqual([{ host: '192.168.1.53', port: 12345, type: 'local' }]);
    expect(parsed.vnc_password).toBeUndefined();
  });
});
