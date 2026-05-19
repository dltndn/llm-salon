export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(await formatHttpError(response, url));
  }

  return (await response.json()) as T;
}

export async function postJson<T>(
  url: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(await formatHttpError(response, url));
  }

  return (await response.json()) as T;
}

async function formatHttpError(
  response: Response,
  url: string,
): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown };

    if (typeof body.message === 'string') {
      return body.message;
    }
  } catch {
    // Fall through to the generic status message.
  }

  return `HTTP ${response.status} from ${url}`;
}
