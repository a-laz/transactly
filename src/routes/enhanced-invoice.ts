import { Hono } from "hono";
import { findOptimalRoute, pickRail } from "../rails/router";
import { Asset, Amount, Destination } from "../rails/PaymentRail";
import { InvoiceRepo, type EnhancedInvoiceRecord } from "../repositories/invoices";

// Enhanced invoice interface
interface EnhancedInvoice {
  id: string;
  amount: Amount;
  payTo: Destination;
  memo?: string;
  createdAt: number;
  status: "open" | "paid" | "expired";
  // Enhanced payment tracking
  payments?: Array<{
    id?: string;
    rail: string;
    routeId?: string;
    chain: string;
    hash?: string;
    from: string;
    amount: string;
    symbol: string;
    chainId?: number;
    status: "pending" | "bridging" | "swapping" | "succeeded" | "failed";
    routeProgress?: any[];
  }>;
  // Cross-chain specific
  supportedRails?: string[];
  optimalRoute?: any;
}

// In-memory store (to be replaced by DB when USE_DB=true)
const ENHANCED_INVOICES = new Map<string, EnhancedInvoice>();
const USE_DB = process.env.USE_DB === 'true';

function toRecord(inv: EnhancedInvoice): EnhancedInvoiceRecord {
  return {
    id: inv.id,
    amount: { value: inv.amount.value, asset: { symbol: inv.amount.asset.symbol } },
    payTo: { chain: inv.payTo?.asset?.chain || inv.amount.asset.chain || 'unknown', address: inv.payTo?.address || '' },
    memo: inv.memo,
    createdAt: inv.createdAt,
    status: inv.status,
    supportedRails: inv.supportedRails,
    payments: inv.payments?.map(p => ({
      rail: p.rail,
      routeId: p.routeId,
      chain: p.chain,
      hash: p.hash,
      from: p.from,
      amount: p.amount,
      symbol: p.symbol,
      chainId: p.chainId,
      status: p.status,
      routeProgress: p.routeProgress,
    })),
  };
}

function fromRecord(r: EnhancedInvoiceRecord): EnhancedInvoice {
  return {
    id: r.id,
    amount: { value: r.amount.value, asset: { symbol: r.amount.asset.symbol } as any },
    payTo: { address: r.payTo.address },
    memo: r.memo,
    createdAt: r.createdAt,
    status: r.status,
    supportedRails: r.supportedRails,
    payments: r.payments?.map(p => ({
      rail: p.rail,
      routeId: p.routeId,
      chain: p.chain,
      hash: p.hash,
      from: p.from,
      amount: p.amount,
      symbol: p.symbol,
      chainId: p.chainId,
      status: p.status,
      routeProgress: p.routeProgress,
    })),
  };
}

async function saveInvoice(invoice: EnhancedInvoice) {
  if (USE_DB) {
    await InvoiceRepo.upsert(toRecord(invoice));
  } else {
    ENHANCED_INVOICES.set(invoice.id, invoice);
  }
}

async function getInvoice(id: string): Promise<EnhancedInvoice | null> {
  if (USE_DB) {
    const r = await InvoiceRepo.getById(id);
    return r ? fromRecord(r) : null;
  }
  return ENHANCED_INVOICES.get(id) || null;
}

async function listInvoices(): Promise<EnhancedInvoice[]> {
  if (USE_DB) {
    const rows = await InvoiceRepo.list();
    return rows.map(fromRecord);
  }
  return Array.from(ENHANCED_INVOICES.values());
}

function generateInvoiceId(): string {
  return `inv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const app = new Hono();

// Create enhanced invoice with cross-chain support
app.post("/invoice", async (c) => {
  try {
    const body = await c.req.json();
    
    // Validate required fields
    if (!body?.amount?.value || !body?.amount?.asset || !body?.payTo) {
      return c.json({ 
        error: "amount{value,asset}, payTo required" 
      }, 400);
    }

    const id = generateInvoiceId();
    
    // Create enhanced invoice
    const invoice: EnhancedInvoice = {
      id,
      amount: body.amount,
      payTo: body.payTo,
      memo: body.memo,
      createdAt: Date.now(),
      status: "open",
    };

    // Get supported rails for this invoice
    try {
      const testInput = {
        amount: body.amount,
        from: { id: "payer", asset: body.amount.asset }, // Assume payer has same asset
        to: { id: "payee", destination: body.payTo },
        meta: body.meta || {},
      };
      
      const { listRails } = await import("../rails/router");
      const allRails = listRails();
      const supportedRails = allRails.filter(railType => {
        try {
          const railMap: Record<string, any> = {
            'cross-chain': require("../rails/bridge").CrossChainRail,
            'evm-native': require("../rails/crypto").EvmNativeRail,
            'near-native': require("../rails/crypto").NearNativeRail,
          };
          const rail = railMap[railType];
          return rail && rail.supports(testInput);
        } catch {
          return false;
        }
      });
      
      invoice.supportedRails = supportedRails;
    } catch (error) {
      console.warn("Could not determine supported rails:", error);
      invoice.supportedRails = [];
    }

    await saveInvoice(invoice);

    const base = process.env.PUBLIC_BASE_URL || "http://localhost:3000";
    return c.json({
      invoice,
      payLink: `${base}/enhanced-pay/${id}`,
      supportedRails: invoice.supportedRails,
    });
  } catch (error: any) {
    console.error("Enhanced invoice creation error:", error);
    return c.json({ error: error.message }, 400);
  }
});

// Get enhanced invoice
app.get("/invoice/:id", async (c) => {
  const id = c.req.param("id");
  const invoice = await getInvoice(id);
  if (!invoice) return c.json({ error: "Invoice not found" }, 404);
  return c.json(invoice);
});

// Enhanced quote endpoint using cross-chain rails
app.post("/pay/:id/quote", async (c) => {
  try {
    const id = c.req.param("id");
    const invoice = await getInvoice(id);
    if (!invoice) return c.json({ error: "Invoice not found" }, 404);

    const body = await c.req.json();
    
    if (!body?.from?.asset) {
      return c.json({ error: "from.asset required" }, 400);
    }

    const input = {
      amount: invoice.amount,
      from: { 
        id: body.from.id || "payer", 
        asset: body.from.asset 
      },
      to: { 
        id: "payee", 
        destination: invoice.payTo 
      },
      meta: body.meta || {},
    };

    // Get optimal route and alternatives
    const result = await findOptimalRoute(input);
    
    return c.json({
      invoiceId: id,
      optimal: {
        rail: result.rail.kind,
        quote: result.quote,
      },
      alternatives: result.alternatives?.map(alt => ({
        rail: alt.rail.kind,
        quote: alt.quote,
      })),
      supportedRails: invoice.supportedRails,
    });
  } catch (error: any) {
    console.error("Enhanced quote error:", error);
    return c.json({ error: error.message }, 400);
  }
});

// Enhanced execute endpoint using cross-chain rails
app.post("/pay/:id/execute", async (c) => {
  try {
    const id = c.req.param("id");
    const invoice = await getInvoice(id);
    if (!invoice) return c.json({ error: "Invoice not found" }, 404);
    
    if (invoice.status !== "open") {
      return c.json({ error: `Invoice is ${invoice.status}` }, 400);
    }

    const body = await c.req.json();
    
    if (!body?.from?.asset) {
      return c.json({ error: "from.asset required" }, 400);
    }

    const input = {
      amount: invoice.amount,
      from: { 
        id: body.from.id || "payer", 
        asset: body.from.asset 
      },
      to: { 
        id: "payee", 
        destination: invoice.payTo 
      },
      meta: body.meta || {},
      idempotencyKey: body.idempotencyKey || `inv-${id}-${Date.now()}`,
      callbackUrl: body.callbackUrl,
      slippageTolerance: body.slippageTolerance || 0.5,
      deadline: body.deadline || Date.now() + 30 * 60 * 1000, // 30 minutes
    };

    // Use preferred rail if specified, otherwise pick optimal
    let rail;
    if (body.preferredRail) {
      const railMap: Record<string, any> = {
        'cross-chain': (await import("../rails/bridge")).CrossChainRail,
        'evm-native': (await import("../rails/crypto")).EvmNativeRail,
        'near-native': (await import("../rails/crypto")).NearNativeRail,
      };
      rail = railMap[body.preferredRail];
      if (!rail) {
        return c.json({ error: "Invalid preferred rail" }, 400);
      }
    } else {
      rail = pickRail(input);
    }

    // Execute payment
    const result = await rail.createPayment(input);
    
    // Update invoice with payment info
    invoice.payments = invoice.payments || [];
    const newPayment = {
      id: result.id,
      rail: result.rail,
      routeId: result.routeId,
      chain: body.from.asset.chain || "unknown",
      from: body.from.id || "payer",
      amount: invoice.amount.value,
      symbol: invoice.amount.asset.symbol,
      status: "pending",
    } as const;
    invoice.payments.push(newPayment as any);
    if (USE_DB) {
      await InvoiceRepo.addPayment(id, {
        id: newPayment.id,
        rail: newPayment.rail,
        routeId: newPayment.routeId,
        chain: newPayment.chain,
        hash: undefined,
        from: newPayment.from,
        amount: newPayment.amount,
        symbol: newPayment.symbol,
        chainId: undefined,
        status: newPayment.status,
      });
    }

    // If it's a simple same-chain payment, mark as paid
    if (result.rail === 'evm-native' || result.rail === 'near-native') {
      invoice.status = "paid";
      if (USE_DB) await InvoiceRepo.updateStatus(id, "paid");
    }

    return c.json({
      invoiceId: id,
      paymentId: result.id,
      rail: result.rail,
      trackingUrl: result.trackingUrl,
      routeId: result.routeId,
      status: invoice.status,
      payment: invoice.payments[invoice.payments.length - 1],
    });
  } catch (error: any) {
    console.error("Enhanced execute error:", error);
    return c.json({ error: error.message }, 400);
  }
});

// Get payment status
app.get("/pay/:id/status", async (c) => {
  try {
    const id = c.req.param("id");
    const invoice = await getInvoice(id);
    if (!invoice) return c.json({ error: "Invoice not found" }, 404);

    if (!invoice.payments || invoice.payments.length === 0) {
      return c.json({ error: "No payments found for this invoice" }, 400);
    }

    const latestPayment = invoice.payments[invoice.payments.length - 1];
    
    // Get status from the rail
    const railMap: Record<string, any> = {
      'cross-chain': (await import("../rails/bridge")).CrossChainRail,
      'evm-native': (await import("../rails/crypto")).EvmNativeRail,
      'near-native': (await import("../rails/crypto")).NearNativeRail,
    };
    
    const rail = railMap[latestPayment.rail];
    if (!rail) {
      return c.json({ error: "Rail not found" }, 400);
    }

    const status = await rail.getStatus(latestPayment.routeId || latestPayment.hash || id);
    
    // Update payment status
    latestPayment.status = status.status;
    if (status.routeProgress) {
      latestPayment.routeProgress = status.routeProgress;
    }

    // Update invoice status if payment succeeded
    if (status.status === "succeeded" && invoice.status !== "paid") {
      invoice.status = "paid";
      if (USE_DB) await InvoiceRepo.updateStatus(id, "paid");
    }

    if (USE_DB && latestPayment.id) {
      await InvoiceRepo.updatePayment(latestPayment.id, {
        status: latestPayment.status as any,
        routeProgress: latestPayment.routeProgress,
      });
    }

    return c.json({
      invoiceId: id,
      invoiceStatus: invoice.status,
      payment: latestPayment,
      railStatus: status,
    });
  } catch (error: any) {
    console.error("Enhanced status error:", error);
    return c.json({ error: error.message }, 400);
  }
});

// List all invoices
app.get("/invoices", async (c) => {
  const invoices = await listInvoices();
  return c.json({ invoices });
});

export default app;
