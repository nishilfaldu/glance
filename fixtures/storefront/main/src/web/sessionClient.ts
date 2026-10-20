let currentToken: string | null = null;

export function setToken(token: string): void {
  currentToken = token;
}

export async function apiFetch(path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${currentToken}`,
    },
    body: JSON.stringify(body),
  });
}
