import { createTransactlyClient } from '@transactly/sdk';
const BASE = process.env.BASE;
const KEY = process.env.API_KEY;
const { client, authHeaders } = createTransactlyClient({ baseUrl: BASE, apiKey: KEY });

const run = async () => {
  const routes = await client.GET('/crosschain/routes', { headers: authHeaders });
  console.log('routes:', routes.data);

  const create = await client.POST('/enhanced/invoice', {
    headers: authHeaders,
    body: {
      amount: { value: '0.01', asset: { symbol: 'ETH', chain: 'ethereum' } },
      payTo: { asset: { symbol: 'ETH', chain: 'ethereum' }, address: '0x0000000000000000000000000000000000000001' }
    }
  });
  console.log('created:', create.data);
};
run().catch(e => { console.error(e); process.exit(1); });
