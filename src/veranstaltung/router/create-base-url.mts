import type { HonoRequest } from 'hono';

export const createBaseUrl = (req: HonoRequest): string => {
  const url = new URL(req.url);
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
};
