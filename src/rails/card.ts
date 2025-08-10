import { PaymentRail, QuoteInput, CreatePaymentInput, CreatePaymentResult } from './PaymentRail';

// Placeholder for a future card rail (e.g., Stripe/Adyen)
export const CardRail: PaymentRail = {
  kind: 'card',
  supports: ({ to }) => Boolean(to.destination.cardToken),
  async quote({ amount }: QuoteInput) {
    const feeVal = (Number(amount.value) * 0.029 + 0.3).toFixed(2);
    return { rail: 'card', total: amount, fee: { value: feeVal, asset: { symbol: 'USD' } as any }, etaSeconds: 15, details: 'Card (simulated)' };
  },
  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const id = 'card_' + Math.random().toString(36).slice(2, 10);
    return { id, rail: 'card', raw: { simulated: true, input } };
  },
  async getStatus() { return { status: 'pending' }; },
};


