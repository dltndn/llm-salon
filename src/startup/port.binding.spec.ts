import { bindWithPortRetry } from './port.binding';

describe('bindWithPortRetry', () => {
  it('retries the next port when the requested port is already in use', async () => {
    const listen = jest
      .fn()
      .mockRejectedValueOnce({ code: 'EADDRINUSE' })
      .mockResolvedValueOnce(undefined);

    await expect(bindWithPortRetry(listen, 4477, '127.0.0.1')).resolves.toBe(
      4478,
    );

    expect(listen).toHaveBeenNthCalledWith(1, 4477, '127.0.0.1');
    expect(listen).toHaveBeenNthCalledWith(2, 4478, '127.0.0.1');
  });

  it('stops after 10 attempts when every port is in use', async () => {
    const listen = jest.fn().mockRejectedValue({ code: 'EADDRINUSE' });

    await expect(bindWithPortRetry(listen, 4477, '127.0.0.1')).rejects.toEqual({
      code: 'EADDRINUSE',
    });

    expect(listen).toHaveBeenCalledTimes(10);
    expect(listen).toHaveBeenLastCalledWith(4486, '127.0.0.1');
  });

  it('rethrows non-port-conflict errors without retrying', async () => {
    const error = new Error('bind failed');
    const listen = jest.fn().mockRejectedValue(error);

    await expect(bindWithPortRetry(listen, 4477, '127.0.0.1')).rejects.toBe(
      error,
    );

    expect(listen).toHaveBeenCalledTimes(1);
  });
});
