# @transactly/sdk

TypeScript SDK generated from the Transactly OpenAPI.

## Install

```bash
npm i @transactly/sdk
```

## Usage

```ts
import { createTransactlyClient } from '@transactly/sdk';

const { client, authHeaders } = createTransactlyClient({
  baseUrl: 'https://your-base/api',
  apiKey: process.env.API_KEY,
});

const r = await client.GET('/crosschain/routes', { headers: authHeaders });
console.log(r.data);
```


