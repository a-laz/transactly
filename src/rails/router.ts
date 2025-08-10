import { PaymentRail, QuoteInput } from './PaymentRail';
import { EvmNativeRail, NearNativeRail } from './crypto';
import { AchRail } from './ach';
import { CardRail } from './card';

const RAILS: PaymentRail[] = [AchRail, CardRail, EvmNativeRail, NearNativeRail];

export function listRails() { return RAILS.map(r => r.kind); }

export function pickRail(input: QuoteInput): PaymentRail {
  const candidates = RAILS.filter(r => r.supports(input));
  if (!candidates.length) throw new Error('No available rails for destination');
  const pref = (input.meta as any)?.preferredSettlement as undefined | 'ach' | 'crypto' | 'card';
  const byPref = pref ? candidates.find(c => c.kind === pref) : undefined;
  return byPref || candidates[0];
}


