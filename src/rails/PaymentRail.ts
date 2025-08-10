export type RailKind =
  | 'evm-native'        // ETH on EVM (chainId)
  | 'evm-erc20'         // ERC-20 on EVM (tokenAddress)
  | 'near-native'       // NEAR
  | 'ach'
  | 'card';

export type Asset = {
  chainId?: number;           // 11155111 for Sepolia, etc. (for EVM)
  symbol: string;             // 'ETH' | 'USDC' | 'NEAR' | ...
  tokenAddress?: string;      // for ERC-20 / NEP-141
  decimals?: number;          // optional
};

export type Amount = { value: string; asset: Asset };

export type Destination = { address?: string; asset?: Asset; evm?: string; near?: string; bankToken?: string; cardToken?: string };

export type QuoteInput = {
  amount: Amount;
  from: { id: string };
  to: { id: string; destination: Destination };
  meta?: Record<string, unknown>;
};

export type RouteStep = { kind: 'send' | 'swap' | 'bridge'; from?: Asset; to?: Asset; provider?: string };

export type Quote = {
  rail: RailKind;
  total: Amount;
  fee: { value: string; asset: Asset };
  etaSeconds: number;
  route?: RouteStep[];
  details?: string;
};

export type CreatePaymentInput = QuoteInput & { idempotencyKey: string; callbackUrl?: string };

export type CreatePaymentResult = { id: string; link?: string; rail: RailKind; raw?: unknown };

export type PaymentStatus = 'pending' | 'succeeded' | 'failed';

export interface PaymentRail {
  kind: RailKind;
  supports(input: QuoteInput): boolean;
  quote(input: QuoteInput): Promise<Quote>;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  getStatus(id: string): Promise<{ status: PaymentStatus; raw?: unknown }>;
}


