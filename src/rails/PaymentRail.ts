export type RailKind =
  | 'evm-native'        // ETH on EVM (chainId)
  | 'evm-erc20'         // ERC-20 on EVM (tokenAddress)
  | 'near-native'       // NEAR
  | 'near-nep141'       // NEP-141 tokens on NEAR
  | 'ach'
  | 'card'
  | 'cross-chain';      // Multi-step cross-chain route

export type Asset = {
  chainId?: number;           // 11155111 for Sepolia, etc. (for EVM)
  symbol: string;             // 'ETH' | 'USDC' | 'NEAR' | ...
  tokenAddress?: string;      // for ERC-20 / NEP-141
  decimals?: number;          // optional
  chain?: string;             // 'ethereum' | 'near' | 'polygon' | etc.
};

export type Amount = { value: string; asset: Asset };

export type Destination = { 
  address?: string; 
  asset?: Asset; 
  evm?: string; 
  near?: string; 
  bankToken?: string; 
  cardToken?: string;
  // Cross-chain destinations
  polygon?: string;
  arbitrum?: string;
  optimism?: string;
  base?: string;
};

export type QuoteInput = {
  amount: Amount;
  from: { id: string; asset?: Asset };  // Source asset info
  to: { id: string; destination: Destination };
  meta?: Record<string, unknown>;
};

export type RouteStep = { 
  kind: 'send' | 'swap' | 'bridge' | 'aggregate'; 
  from?: Asset; 
  to?: Asset; 
  provider?: string;
  chain?: string;
  estimatedTime?: number;
  fee?: { value: string; asset: Asset };
  details?: string;
};

export type Quote = {
  rail: RailKind;
  total: Amount;
  fee: { value: string; asset: Asset };
  etaSeconds: number;
  route?: RouteStep[];
  details?: string;
  // Cross-chain specific
  bridgeProvider?: string;
  slippageTolerance?: number;
  minimumReceived?: Amount;
};

export type CreatePaymentInput = QuoteInput & { 
  idempotencyKey: string; 
  callbackUrl?: string;
  // Cross-chain specific
  slippageTolerance?: number;
  deadline?: number;
};

export type CreatePaymentResult = { 
  id: string; 
  link?: string; 
  rail: RailKind; 
  raw?: unknown;
  // Cross-chain specific
  routeId?: string;
  trackingUrl?: string;
};

export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'bridging' | 'swapping';

export interface PaymentRail {
  kind: RailKind;
  supports(input: QuoteInput): boolean;
  quote(input: QuoteInput): Promise<Quote>;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  getStatus(id: string): Promise<{ status: PaymentStatus; raw?: unknown; routeProgress?: RouteStep[] }>;
}


