import createClient from 'openapi-fetch';
import type { paths } from '../sdk/types';

async function main() {
  const BASE = process.env.BASE || 'http://localhost:3000';
  const KEY = process.env.API_KEY || 'dev_key_123';

  const client = createClient<paths>({ baseUrl: `${BASE}/api` });
  const headers = { 'x-api-key': KEY } as const;

  // Create enhanced invoice
  const create = await client.POST('/enhanced/invoice', {
    headers,
    body: {
      amount: { value: '0.01', asset: { symbol: 'ETH', chain: 'ethereum' } },
      payTo: { asset: { symbol: 'ETH', chain: 'ethereum' }, address: '0x0000000000000000000000000000000000000001' },
    } as any,
  });
  if (create.error) throw create.error;
  const invId = (create.data as any).invoice.id as string;
  console.log('created invoice:', invId);

  // Execute
  const exec = await client.POST('/enhanced/pay/{id}/execute', {
    params: { path: { id: invId } },
    headers,
    body: {
      from: { id: 'payer-1', asset: { symbol: 'ETH', chain: 'ethereum' } },
      preferredRail: 'evm-native',
    } as any,
  });
  if (exec.error) throw exec.error;
  console.log('executed:', exec.data);

  // Status
  const status = await client.GET('/enhanced/pay/{id}/status', { params: { path: { id: invId } }, headers });
  console.log('status:', status.data);
}

main().catch((e) => { console.error(e); process.exit(1); });


