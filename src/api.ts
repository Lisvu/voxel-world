export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function api<T>(path: string, options: { method?: string; body?: unknown; keepalive?: boolean } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: options.method ?? 'GET', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Voxel-Client': 'web' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(15000), keepalive: options.keepalive,
    });
  } catch { throw new ApiError(0, '无法连接服务器，请检查网络后重试'); }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, typeof data?.message === 'string' ? data.message : '请求失败，请稍后重试');
  return data as T;
}
