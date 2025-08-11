import { PaymentRail, QuoteInput, CreatePaymentInput, CreatePaymentResult, Asset } from './PaymentRail';
import { createInvoiceDirect } from '../routes/transaction';

export const EvmNativeRail: PaymentRail = {
  kind: 'evm-native',
  supports: ({ to, amount }) => Boolean((to.destination.evm || to.destination.address) && (!amount.asset.tokenAddress) && (amount.asset.symbol === 'ETH')),
  async quote({ amount }: QuoteInput) {
    return {
      rail: 'evm-native',
      total: amount,
      fee: { value: '0', asset: amount.asset as Asset },
      etaSeconds: 15,
    };
  },
  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const addr = input.to.destination.evm || input.to.destination.address;
    if (!addr) throw new Error('Missing EVM destination address');
    const payTo = { chain: 'sepolia' as const, address: addr };
    const inv = await createInvoiceDirect({
      amount: { value: input.amount.value, symbol: 'ETH' as any },
      payTo,
      memo: (input.meta as any)?.memo,
    });
    return { id: inv.id, link: inv.link, rail: 'evm-native', routeId: inv.id } as any;
  },
  async getStatus() { return { status: 'succeeded' }; },
};

export const NearNativeRail: PaymentRail = {
  kind: 'near-native',
  supports: ({ to, amount }) => Boolean(to.destination.near || (to.destination.address && amount.asset.symbol === 'NEAR')),
  async quote({ amount }: QuoteInput) {
    return { rail: 'near-native', total: amount, fee: { value: '0', asset: amount.asset }, etaSeconds: 15 };
  },
  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    // For demo, reuse invoice (NEAR support in invoice could be extended later)
    const inv = await createInvoiceDirect({
      amount: { value: input.amount.value, symbol: 'NEAR' as any },
      payTo: { chain: 'near', address: input.to.destination.near || input.to.destination.address! },
      memo: (input.meta as any)?.memo,
    });
    return { id: inv.id, link: inv.link, rail: 'near-native', routeId: inv.id } as any;
  },
  async getStatus() { return { status: 'succeeded' }; },
};


