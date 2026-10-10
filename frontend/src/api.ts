export const API_TOKEN = 'obs_front_prod_9921_sec';

export function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers || {});
  headers.set('x-observatorio-token', API_TOKEN);

  return fetch(url, {
    ...options,
    headers,
  });
}
