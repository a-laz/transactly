import { PaymentRail, QuoteInput, CreatePaymentInput, CreatePaymentResult } from './PaymentRail';

export const AchRail: PaymentRail = {
  kind: 'ach',
  supports: ({ to }) => Boolean(to.destination.bankToken),
  async quote({ amount }: QuoteInput) {
    const feeVal = (Number(amount.value) * 0.008 + 0.25).toFixed(2);
    return {
      rail: 'ach',
      total: amount,
      fee: { value: feeVal, asset: { symbol: 'USD' } as any },
      etaSeconds: 24 * 60 * 60, // ~1 day
      details: 'ACH (simulated)',
    };
  },
  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const id = 'ach_' + Math.random().toString(36).slice(2, 10);
    return { id, rail: 'ach', raw: { simulated: true, input } };
  },
  async getStatus() { return { status: 'pending' }; },
};


