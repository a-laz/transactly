### Next.js example (route handler)

```ts
// app/api/invoice/route.ts
import { createClient } from 'openapi-fetch';
import type { paths } from '@/sdk/types';

const client = createClient<paths>({ baseUrl: process.env.BASE_URL! + '/api' });

export async function POST(req: Request) {
  const headers = { 'x-api-key': process.env.API_KEY! } as const;
  const body = await req.json();
  const r = await client.POST('/enhanced/invoice', { headers, body });
  return Response.json(r.data ?? r.error, { status: r.response.status });
}
```

In your Next.js `next.config.js`, ensure `BASE_URL` and `API_KEY` envs are present at runtime, and place the generated `sdk/types.ts` in `src/sdk/types.ts`.


