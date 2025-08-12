import createClient from 'openapi-fetch';
import type { paths } from './types';

export type { paths };

export type CreateClientOptions = {
  baseUrl: string;     // e.g., https://your-base/api
  apiKey?: string;     // if provided, sent as x-api-key
};

export function createTransactlyClient(opts: CreateClientOptions) {
  // openapi-fetch is ESM-first; default import works in ESM, but tsup CJS bundle may require .default
  // Attempt both to maximize compatibility
  const anyCreate: any = (createClient as any)?.default || (createClient as any);
  const client = anyCreate<paths>({ baseUrl: opts.baseUrl });
  const authHeaders = opts.apiKey ? { 'x-api-key': opts.apiKey } : undefined;
  return { client, authHeaders };
}


