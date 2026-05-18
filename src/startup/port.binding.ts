const DEFAULT_PORT_BIND_ATTEMPTS = 10;

type PortBindingListener = (
  port: number,
  host: string,
) => Promise<unknown> | unknown;

function isAddressInUseError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'EADDRINUSE'
  );
}

export async function bindWithPortRetry(
  listen: PortBindingListener,
  requestedPort: number,
  host: string,
  maxAttempts: number = DEFAULT_PORT_BIND_ATTEMPTS,
): Promise<number> {
  let port = requestedPort;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      await listen(port, host);
      return port;
    } catch (error) {
      if (!isAddressInUseError(error) || attempt === maxAttempts - 1) {
        throw error;
      }

      port += 1;
    }
  }

  throw new Error(`Failed to bind to ${host}:${requestedPort}.`);
}
