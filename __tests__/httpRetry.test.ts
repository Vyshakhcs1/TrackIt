import axios, { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { attachRetry } from '../src/shared/api/retry';

const options = { retries: 2, baseDelayMs: 1, maxDelayMs: 2 };

function failure(config: InternalAxiosRequestConfig, status?: number) {
  return status === undefined
    ? new AxiosError('Network Error', 'ERR_NETWORK', config)
    : new AxiosError('Request failed', 'ERR_BAD_RESPONSE', config, null, {
        status,
        statusText: '',
        headers: {},
        data: {},
        config,
      });
}

function createClient(outcomes: (number | undefined | 'ok')[]) {
  const sleep = jest.fn().mockResolvedValue(undefined);
  const adapter = jest.fn<ReturnType<AxiosAdapter>, Parameters<AxiosAdapter>>(async config => {
    const outcome = outcomes.shift();
    if (outcome === 'ok') {
      return { status: 200, statusText: 'OK', headers: {}, data: { ok: true }, config };
    }
    throw failure(config, outcome);
  });
  const client = axios.create({ adapter });
  attachRetry(client, { ...options, sleep });
  return { client, adapter, sleep };
}

describe('attachRetry', () => {
  it('retries a network failure and returns the later success', async () => {
    const { client, adapter, sleep } = createClient([undefined, 503, 'ok']);

    await expect(client.post('/syncLocalToServer', { steps: 1 })).resolves.toMatchObject({
      data: { ok: true },
    });

    expect(adapter).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(adapter.mock.calls[2][0].data).toBe(adapter.mock.calls[0][0].data);
  });

  it('does not retry client errors such as invalid credentials', async () => {
    const { client, adapter, sleep } = createClient([401, 'ok']);

    await expect(client.post('/login', {})).rejects.toMatchObject({
      response: { status: 401 },
    });

    expect(adapter).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('gives up after the configured retries and rethrows the last error', async () => {
    const { client, adapter } = createClient([503, 503, 503, 'ok']);

    await expect(client.get('/fetchAllData')).rejects.toMatchObject({
      response: { status: 503 },
    });

    expect(adapter).toHaveBeenCalledTimes(3);
  });
});
