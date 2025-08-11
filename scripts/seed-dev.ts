import 'dotenv/config';
import { db } from '../src/db/client';
import { invoices, invoicePayments, tabItems, tabParticipants, tabs } from '../src/db/schema';
import { InvoiceRepo, type EnhancedInvoiceRecord } from '../src/repositories/invoices';
import { TabsRepo, type TabRecord } from '../src/repositories/tabs';
import { eq } from 'drizzle-orm';

function rid(prefix = ''): string {
  return `${prefix}${Math.random().toString(36).slice(2, 10)}`;
}

async function resetIfRequested() {
  const shouldReset = process.argv.includes('--reset');
  if (!shouldReset) return;
  console.log('Resetting tables (dev)…');
  // Delete children first to avoid FK-like constraints
  await db.delete(invoicePayments);
  await db.delete(invoices);
  await db.delete(tabItems);
  await db.delete(tabParticipants);
  await db.delete(tabs);
  console.log('Tables cleared.');
}

async function seedTabs() {
  console.log('Seeding tabs…');
  const t1: TabRecord = {
    id: rid('tab_'),
    name: 'Team Lunch',
    owner: { id: 'maria', address: '0x1111111111111111111111111111111111111111' },
    symbol: 'ETH',
    settlementChain: 'sepolia',
    participants: [
      { id: 'maria', address: '0x1111111111111111111111111111111111111111' },
      { id: 'alex', address: '0x2222222222222222222222222222222222222222' },
      { id: 'jordan', address: '0x3333333333333333333333333333333333333333' },
    ],
    items: [],
    status: 'open',
  };
  await TabsRepo.create(t1);
  await TabsRepo.addItem(t1.id, { id: rid('ch_'), by: 'maria', amount: { value: '0.04', symbol: 'ETH' }, memo: 'salads', ts: Date.now() - 60_000 });
  await TabsRepo.addItem(t1.id, { id: rid('ch_'), by: 'alex', amount: { value: '0.02', symbol: 'ETH' }, memo: 'drinks', ts: Date.now() - 30_000 });

  const t2: TabRecord = {
    id: rid('tab_'),
    name: 'Conference Coffee',
    owner: { id: 'sam', address: '0x4444444444444444444444444444444444444444' },
    symbol: 'ETH',
    settlementChain: 'sepolia',
    participants: [
      { id: 'sam', address: '0x4444444444444444444444444444444444444444' },
      { id: 'lee', address: '0x5555555555555555555555555555555555555555' },
    ],
    items: [],
    status: 'open',
  };
  await TabsRepo.create(t2);
  await TabsRepo.addItem(t2.id, { id: rid('ch_'), by: 'sam', amount: { value: '0.015', symbol: 'ETH' }, memo: 'coffee round', ts: Date.now() - 20_000 });

  // Optionally mark one as settled to demo closed tabs
  await TabsRepo.updateSettlement(t2.id, {
    invoiceIds: ['inv-demo-1'],
    links: ['http://localhost:3000/enhanced-pay/inv-demo-1'],
    pairs: [{ debtor: 'lee', creditor: 'sam', link: 'http://localhost:3000/enhanced-pay/inv-demo-1' }],
  });
  console.log('Tabs seeded:', t1.id, t2.id);
}

async function seedInvoices() {
  console.log('Seeding invoices…');
  const inv1: EnhancedInvoiceRecord = {
    id: rid('inv_'),
    amount: { value: '0.01', asset: { symbol: 'ETH' } },
    payTo: { chain: 'ethereum', address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
    memo: 'Sample ETH invoice',
    createdAt: Date.now(),
    status: 'open',
    supportedRails: ['evm-native'],
  };
  await InvoiceRepo.create(inv1);

  const inv2: EnhancedInvoiceRecord = {
    id: rid('inv_'),
    amount: { value: '1', asset: { symbol: 'NEAR' } },
    payTo: { chain: 'near', address: 'receiver.testnet' },
    memo: 'Sample NEAR invoice (paid)',
    createdAt: Date.now() - 120_000,
    status: 'paid',
    supportedRails: ['near-native'],
  };
  await InvoiceRepo.create(inv2);
  await InvoiceRepo.addPayment(inv2.id, {
    id: rid('pay_'),
    rail: 'near-native',
    chain: 'near',
    from: 'payer-1',
    amount: inv2.amount.value,
    symbol: inv2.amount.asset.symbol,
    status: 'succeeded',
  });
  console.log('Invoices seeded:', inv1.id, inv2.id);
}

async function main() {
  await resetIfRequested();
  await seedTabs();
  await seedInvoices();
  console.log('Seed complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


