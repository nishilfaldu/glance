export async function send(method: string, url: string, body: unknown) {
  return fetch(url, { method, body: JSON.stringify(body) });
}
