export function data<T>(value: T, init: ResponseInit = {}) {
  return Response.json({ data: value }, init);
}

export function failure(code: string, message: string, status = 400, field?: string) {
  return Response.json({ error: { code, message, ...(field ? { field } : {}) } }, { status });
}

export async function readJson<T>(request: Request, maximum = 8192): Promise<T> {
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > maximum) throw new Error('BODY_TOO_LARGE');
  const text = await request.text();
  if (new TextEncoder().encode(text).length > maximum) throw new Error('BODY_TOO_LARGE');
  return JSON.parse(text) as T;
}
