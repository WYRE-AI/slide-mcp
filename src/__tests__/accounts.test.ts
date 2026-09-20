import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleAccountTool } from '../tools/accounts.js';
import { runWithCredentials } from '../client.js';
import { jsonResponse, textOf } from './test-helpers.js';

describe('handleAccountTool', () => {
  const fetchMock = vi.fn();
  const creds = { apiToken: 'token-1' };

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('slide_list_accounts sends the Bearer token and forwards pagination/sort params', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ pagination: { next_offset: 10 }, data: [{ account_id: 'a1', account_name: 'Acme MSP' }] })
    );

    const result = await runWithCredentials(creds, () =>
      handleAccountTool('slide_list_accounts', { limit: 25, sort_by: 'name', sort_asc: true })
    );

    expect(result.isError).toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(url).pathname).toBe('/v1/account');
    expect(new URL(url).searchParams.get('limit')).toBe('25');
    expect(new URL(url).searchParams.get('sort_by')).toBe('name');
    expect(new URL(url).searchParams.get('sort_asc')).toBe('true');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-1');
    expect(JSON.parse(textOf(result)).data[0].account_id).toBe('a1');
  });

  it('slide_get_account fetches a single account by ID', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ account_id: 'a1', account_name: 'Acme MSP' }));

    const result = await runWithCredentials(creds, () => handleAccountTool('slide_get_account', { account_id: 'a1' }));

    expect(new URL(fetchMock.mock.calls[0][0] as string).pathname).toBe('/v1/account/a1');
    expect(JSON.parse(textOf(result)).account_name).toBe('Acme MSP');
  });

  it('surfaces a 401 as a readable auth error rather than throwing', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'unauthorized' }, 401));

    const result = await runWithCredentials(creds, () => handleAccountTool('slide_get_account', { account_id: 'a1' }));

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/rejected the API token/i);
  });

  it('returns a credential error without calling fetch when no token is configured', async () => {
    const result = await handleAccountTool('slide_list_accounts', {});

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/SLIDE_API_TOKEN/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
