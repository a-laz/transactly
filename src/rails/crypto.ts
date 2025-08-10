import { PaymentRail, QuoteInput, CreatePaymentInput, CreatePaymentResult, Currency } from './PaymentRail';
import { createInvoiceDirect } from '../routes/transaction';

export const CryptoRail: PaymentRail = {
  kind: 'crypto',
  supports: ({ to }) => Boolean(to.destination.evm || to.destination.near),
  async quote({ amount }: QuoteInput) {
    return {
      rail: 'crypto',
      total: amount,
      fee: { value: '0', currency: amount.currency as Currency },
      etaSeconds: 15,
    };
  },
  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const payTo = input.to.destination.evm
      ? { chain: 'sepolia' as const, address: input.to.destination.evm }
      : { chain: 'near' as const, address: input.to.destination.near! };
    const inv = await createInvoiceDirect({
      amount: { value: input.amount.value, symbol: input.amount.currency as any },
      payTo,
      memo: (input.meta as any)?.memo,
    });
    return { id: inv.id, link: inv.link, rail: 'crypto' };
  },
  async getStatus() { return { status: 'pending' }; },
};


