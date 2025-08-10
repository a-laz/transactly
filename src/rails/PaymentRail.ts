export type RailKind = 'crypto' | 'ach' | 'card';

export type Currency = 'USD' | 'USDC' | 'ETH' | 'NEAR';

export type QuoteInput = {
  amount: { value: string; currency: Currency };
  from: { id: string };
  to: {
    id: string;
    destination: {
      evm?: string;
      near?: string;
      bankToken?: string;
      cardToken?: string;
    };
  };
  meta?: Record<string, unknown>;
};

export type Quote = {
  rail: RailKind;
  total: { value: string; currency: Currency };
  fee: { value: string; currency: Currency };
  etaSeconds: number;
  details?: string;
};

export type CreatePaymentInput = QuoteInput & {
  idempotencyKey: string;
  callbackUrl?: string;
};

export type CreatePaymentResult = {
  id: string;
  link?: string; // e.g. crypto invoice link
  rail: RailKind;
  raw?: unknown;
};

export type PaymentStatus = 'pending' | 'succeeded' | 'failed';

export interface PaymentRail {
  kind: RailKind;
  supports(input: QuoteInput): boolean;
  quote(input: QuoteInput): Promise<Quote>;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  getStatus(id: string): Promise<{ status: PaymentStatus; raw?: unknown }>;
}


