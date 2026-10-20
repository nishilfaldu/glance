let currentToken: string | null = null;

export function setToken(token: string): void {
  currentToken = token;
}

export async function apiFetch(path: string, body: unknown): Promise<Response> {
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${currentToken}`,
    },
    body: JSON.stringify(body),
  });
  const rotated = res.headers.get("x-session-token");
  if (rotated) currentToken = rotated;
  return res;
}
