import { PaymentRail, QuoteInput } from './PaymentRail';
import { EvmNativeRail, NearNativeRail } from './crypto';
import { AchRail } from './ach';
import { CardRail } from './card';
import { CrossChainRail } from './bridge';

const ENABLE_ACH = process.env.ENABLE_ACH === 'true';
const ENABLE_CARD = process.env.ENABLE_CARD === 'true';

const RAILS: PaymentRail[] = (() => {
  const rails: PaymentRail[] = [
    CrossChainRail,  // Prioritize cross-chain for complex routes
    EvmNativeRail,
    NearNativeRail,
  ];
  if (ENABLE_ACH) rails.push(AchRail);
  if (ENABLE_CARD) rails.push(CardRail);
  return rails;
})();

export function listRails() { return RAILS.map(r => r.kind); }

export function pickRail(input: QuoteInput): PaymentRail {
  const candidates = RAILS.filter(r => r.supports(input));
  if (!candidates.length) throw new Error('No available rails for destination');
  
  const pref = (input.meta as any)?.preferredSettlement as undefined | 'ach' | 'crypto' | 'card' | 'cross-chain';
  const byPref = pref ? candidates.find(c => c.kind === pref) : undefined;
  
  // If no preference, prioritize cross-chain for complex routes
  if (!byPref) {
    const fromChain = input.from.asset?.chain || 'ethereum';
    const toChain = input.to.destination.asset?.chain || 'ethereum';
    const isCrossChain = fromChain !== toChain || input.from.asset?.symbol !== input.to.destination.asset?.symbol;
    
    if (isCrossChain) {
      const crossChainRail = candidates.find(c => c.kind === 'cross-chain');
      if (crossChainRail) return crossChainRail;
    }
  }
  
  return byPref || candidates[0];
}

// Enhanced router with route optimization
export async function findOptimalRoute(input: QuoteInput): Promise<{
  rail: PaymentRail;
  quote: any;
  alternatives?: Array<{ rail: PaymentRail; quote: any }>;
}> {
  const candidates = RAILS.filter(r => r.supports(input));
  if (!candidates.length) throw new Error('No available rails for destination');
  
  // Get quotes from all supported rails
  const quotes = await Promise.all(
    candidates.map(async (rail) => {
      try {
        const quote = await rail.quote(input);
        return { rail, quote };
      } catch (error) {
        console.warn(`Failed to get quote from ${rail.kind}:`, error);
        return null;
      }
    })
  );
  
  const validQuotes = quotes.filter(q => q !== null) as Array<{ rail: PaymentRail; quote: any }>;
  
  if (!validQuotes.length) throw new Error('No valid quotes available');
  
  // Sort by total cost (amount + fees)
  validQuotes.sort((a, b) => {
    const aTotal = parseFloat(a.quote.total.value) + parseFloat(a.quote.fee.value);
    const bTotal = parseFloat(b.quote.total.value) + parseFloat(b.quote.fee.value);
    return aTotal - bTotal;
  });
  
  const optimal = validQuotes[0];
  const alternatives = validQuotes.slice(1, 4); // Top 3 alternatives
  
  return {
    rail: optimal.rail,
    quote: optimal.quote,
    alternatives: alternatives.length > 0 ? alternatives : undefined,
  };
}


