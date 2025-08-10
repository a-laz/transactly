import { PaymentRail, QuoteInput, CreatePaymentInput, CreatePaymentResult, Asset, Quote, RouteStep } from './PaymentRail';

// Bridge providers and their supported routes
const BRIDGE_PROVIDERS = {
  'stargate': {
    name: 'Stargate',
    supportedRoutes: [
      { from: 'ethereum', to: 'polygon', assets: ['USDC', 'USDT'] },
      { from: 'ethereum', to: 'arbitrum', assets: ['USDC', 'USDT'] },
      { from: 'ethereum', to: 'optimism', assets: ['USDC', 'USDT'] },
      { from: 'ethereum', to: 'base', assets: ['USDC', 'USDT'] },
    ],
    estimatedTime: 300, // 5 minutes
    feePercent: 0.1,
  },
  'axelar': {
    name: 'Axelar',
    supportedRoutes: [
      { from: 'ethereum', to: 'near', assets: ['USDC', 'USDT'] },
      { from: 'polygon', to: 'near', assets: ['USDC', 'USDT'] },
      { from: 'near', to: 'ethereum', assets: ['USDC', 'USDT'] },
    ],
    estimatedTime: 600, // 10 minutes
    feePercent: 0.15,
  },
  'rainbow': {
    name: 'Rainbow Bridge',
    supportedRoutes: [
      { from: 'ethereum', to: 'near', assets: ['ETH', 'USDC'] },
      { from: 'near', to: 'ethereum', assets: ['NEAR', 'USDC'] },
    ],
    estimatedTime: 900, // 15 minutes
    feePercent: 0.05,
  },
  'wormhole': {
    name: 'Wormhole',
    supportedRoutes: [
      { from: 'ethereum', to: 'near', assets: ['USDC', 'USDT'] },
      { from: 'polygon', to: 'near', assets: ['USDC', 'USDT'] },
      { from: 'near', to: 'ethereum', assets: ['USDC', 'USDT'] },
    ],
    estimatedTime: 450, // 7.5 minutes
    feePercent: 0.12,
  },
};

// Swap providers for same-chain asset conversion
const SWAP_PROVIDERS = {
  'uniswap': {
    name: 'Uniswap',
    chains: ['ethereum', 'polygon', 'arbitrum', 'optimism', 'base'],
    feePercent: 0.3,
  },
  'ref-finance': {
    name: 'Ref Finance',
    chains: ['near'],
    feePercent: 0.2,
  },
  '1inch': {
    name: '1inch',
    chains: ['ethereum', 'polygon', 'arbitrum', 'optimism', 'base'],
    feePercent: 0.25,
  },
};

function findBestRoute(from: Asset, to: Asset, amount: string): {
  provider: string;
  route: RouteStep[];
  totalFee: number;
  estimatedTime: number;
} | null {
  const fromChain = from.chain || 'ethereum';
  const toChain = to.chain || 'ethereum';
  
  // Same chain, different asset - need swap
  if (fromChain === toChain && from.symbol !== to.symbol) {
    const swapProvider = Object.entries(SWAP_PROVIDERS).find(([_, config]) => 
      config.chains.includes(fromChain)
    );
    
    if (swapProvider) {
      return {
        provider: swapProvider[0],
        route: [{
          kind: 'swap',
          from,
          to,
          provider: swapProvider[0],
          chain: fromChain,
          estimatedTime: 60,
          fee: { value: (parseFloat(amount) * swapProvider[1].feePercent / 100).toFixed(6), asset: from },
          details: `Swap ${from.symbol} to ${to.symbol} on ${swapProvider[1].name}`,
        }],
        totalFee: parseFloat(amount) * swapProvider[1].feePercent / 100,
        estimatedTime: 60,
      };
    }
  }
  
  // Different chains - need bridge
  if (fromChain !== toChain) {
    const bridgeProvider = Object.entries(BRIDGE_PROVIDERS).find(([_, config]) => 
      config.supportedRoutes.some(route => 
        route.from === fromChain && 
        route.to === toChain && 
        route.assets.includes(from.symbol)
      )
    );
    
    if (bridgeProvider) {
      const config = bridgeProvider[1];
      const route: RouteStep[] = [];
      
      // If different assets, add swap step
      if (from.symbol !== to.symbol) {
        const swapProvider = Object.entries(SWAP_PROVIDERS).find(([_, swapConfig]) => 
          swapConfig.chains.includes(toChain)
        );
        
        if (swapProvider) {
          route.push({
            kind: 'swap',
            from: { ...from, chain: toChain },
            to,
            provider: swapProvider[0],
            chain: toChain,
            estimatedTime: 60,
            fee: { value: (parseFloat(amount) * swapProvider[1].feePercent / 100).toFixed(6), asset: from },
            details: `Swap ${from.symbol} to ${to.symbol} on ${swapProvider[1].name}`,
          });
        }
      }
      
      // Add bridge step
      route.unshift({
        kind: 'bridge',
        from,
        to: { ...from, chain: toChain },
        provider: bridgeProvider[0],
        chain: fromChain,
        estimatedTime: config.estimatedTime,
        fee: { value: (parseFloat(amount) * config.feePercent / 100).toFixed(6), asset: from },
        details: `Bridge ${from.symbol} from ${fromChain} to ${toChain} via ${config.name}`,
      });
      
      const nextProviderKey = (route[1]?.provider || '') as keyof typeof SWAP_PROVIDERS;
      const swapFeePercent = nextProviderKey ? SWAP_PROVIDERS[nextProviderKey].feePercent : 0;
      return {
        provider: bridgeProvider[0],
        route,
        totalFee: parseFloat(amount) * (config.feePercent / 100 + (route.length > 1 ? swapFeePercent / 100 : 0)),
        estimatedTime: config.estimatedTime + (route.length > 1 ? 60 : 0),
      };
    }
  }
  
  return null;
}

export const CrossChainRail: PaymentRail = {
  kind: 'cross-chain',
  
  supports: ({ from, to, amount }) => {
    const fromChain = from.asset?.chain || 'ethereum';
    const toChain = to.destination.asset?.chain || 'ethereum';
    
    // Support if different chains or different assets
    return fromChain !== toChain || from.asset?.symbol !== to.destination.asset?.symbol;
  },
  
  async quote(input: QuoteInput): Promise<Quote> {
    const fromAsset = input.from.asset || { symbol: 'ETH', chain: 'ethereum' };
    const toAsset = input.to.destination.asset || { symbol: 'ETH', chain: 'ethereum' };
    
    const route = findBestRoute(fromAsset, toAsset, input.amount.value);
    
    if (!route) {
      throw new Error('No available route for this cross-chain transfer');
    }
    
    const slippageTolerance = 0.5; // 0.5%
    const minimumReceived = parseFloat(input.amount.value) * (1 - slippageTolerance / 100);
    
    return {
      rail: 'cross-chain',
      total: input.amount,
      fee: { 
        value: route.totalFee.toFixed(6), 
        asset: fromAsset 
      },
      etaSeconds: route.estimatedTime,
      route: route.route,
      bridgeProvider: route.provider,
      slippageTolerance,
      minimumReceived: { value: minimumReceived.toFixed(6), asset: toAsset },
      details: `Cross-chain transfer via ${route.provider}`,
    };
  },
  
  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const fromAsset = input.from.asset || { symbol: 'ETH', chain: 'ethereum' };
    const toAsset = input.to.destination.asset || { symbol: 'ETH', chain: 'ethereum' };
    
    const route = findBestRoute(fromAsset, toAsset, input.amount.value);
    
    if (!route) {
      throw new Error('No available route for this cross-chain transfer');
    }
    
    // Generate unique route ID
    const routeId = `cross-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    
    // In a real implementation, this would:
    // 1. Call the bridge provider's API
    // 2. Get user signatures for each step
    // 3. Execute the route
    // 4. Track progress
    
    return {
      id: routeId,
      rail: 'cross-chain',
      routeId,
      trackingUrl: `https://bridgescan.com/route/${routeId}`,
      raw: {
        route,
        provider: route.provider,
        steps: route.route.length,
      },
    };
  },
  
  async getStatus(id: string): Promise<{ status: any; raw?: unknown; routeProgress?: RouteStep[] }> {
    // In a real implementation, this would:
    // 1. Query bridge provider for status
    // 2. Check on-chain confirmations
    // 3. Return progress through the route
    
    return {
      status: 'pending',
      routeProgress: [
        { kind: 'bridge', from: { symbol: 'ETH', chain: 'ethereum' }, to: { symbol: 'ETH', chain: 'near' }, provider: 'rainbow', chain: 'ethereum', estimatedTime: 900, details: 'Bridging ETH to NEAR' }
      ],
    };
  },
};
