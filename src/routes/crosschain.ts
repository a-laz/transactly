import { Hono } from "hono";
import { findOptimalRoute, pickRail } from "../rails/router";

const app = new Hono();

// Cross-chain payment quote endpoint
app.post("/quote", async (c) => {
  try {
    const body = await c.req.json();
    
    const input = {
      amount: body.amount,
      from: { 
        id: body.from.id, 
        asset: body.from.asset 
      },
      to: { 
        id: body.to.id, 
        destination: body.to.destination 
      },
      meta: body.meta || {},
    };

    const result = await findOptimalRoute(input);
    
    return c.json({
      optimal: {
        rail: result.rail.kind,
        quote: result.quote,
      },
      alternatives: result.alternatives?.map(alt => ({
        rail: alt.rail.kind,
        quote: alt.quote,
      })),
    });
  } catch (error: any) {
    console.error("Cross-chain quote error:", error);
    return c.json({ error: error.message }, 400);
  }
});

// Execute cross-chain payment
app.post("/execute", async (c) => {
  try {
    const body = await c.req.json();
    
    const input = {
      amount: body.amount,
      from: { 
        id: body.from.id, 
        asset: body.from.asset 
      },
      to: { 
        id: body.to.id, 
        destination: body.to.destination 
      },
      meta: body.meta || {},
      idempotencyKey: body.idempotencyKey || `cross-${Date.now()}`,
      callbackUrl: body.callbackUrl,
      slippageTolerance: body.slippageTolerance || 0.5,
      deadline: body.deadline || Date.now() + 30 * 60 * 1000, // 30 minutes
    };

    const rail = pickRail(input);
    const result = await rail.createPayment(input);
    
    return c.json({
      paymentId: result.id,
      rail: result.rail,
      trackingUrl: result.trackingUrl,
      routeId: result.routeId,
      status: 'initiated',
    });
  } catch (error: any) {
    console.error("Cross-chain execute error:", error);
    return c.json({ error: error.message }, 400);
  }
});

// Get payment status
app.get("/status/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const railType = c.req.query("rail");
    
    if (!railType) {
      return c.json({ error: "Rail type required" }, 400);
    }
    
    // Find the rail by type
    const { listRails } = await import("../rails/router");
    const rails = listRails();
    
    if (!rails.includes(railType)) {
      return c.json({ error: "Invalid rail type" }, 400);
    }
    
    // In a real implementation, you'd store rail type with payment ID
    // For now, we'll use a simple mapping
    const railMap: Record<string, any> = {
      'cross-chain': (await import("../rails/bridge")).CrossChainRail,
      'evm-native': (await import("../rails/crypto")).EvmNativeRail,
      'near-native': (await import("../rails/crypto")).NearNativeRail,
    };
    
    const rail = railMap[railType];
    if (!rail) {
      return c.json({ error: "Rail not implemented" }, 400);
    }
    
    const status = await rail.getStatus(id);
    
    return c.json({
      id,
      rail: railType,
      status: status.status,
      routeProgress: status.routeProgress,
      raw: status.raw,
    });
  } catch (error: any) {
    console.error("Cross-chain status error:", error);
    return c.json({ error: error.message }, 400);
  }
});

// List supported routes
app.get("/routes", async (c) => {
  try {
    const { listRails } = await import("../rails/router");
    const rails = listRails();
    
    // Get detailed route information
    const routeInfo = rails.map(rail => {
      switch (rail) {
        case 'cross-chain':
          return {
            rail,
            name: 'Cross-Chain Bridge',
            description: 'Multi-step cross-chain transfers with bridging and swapping',
            supportedChains: ['ethereum', 'near', 'polygon', 'arbitrum', 'optimism', 'base'],
            supportedAssets: ['ETH', 'NEAR', 'USDC', 'USDT'],
            estimatedTime: '5-15 minutes',
            feeRange: '0.05-0.15%',
          };
        case 'evm-native':
          return {
            rail,
            name: 'EVM Native',
            description: 'Direct transfers on EVM chains',
            supportedChains: ['ethereum', 'polygon', 'arbitrum', 'optimism', 'base'],
            supportedAssets: ['ETH', 'MATIC', 'ARB', 'OP'],
            estimatedTime: '15-60 seconds',
            feeRange: 'Gas fees only',
          };
        case 'near-native':
          return {
            rail,
            name: 'NEAR Native',
            description: 'Direct transfers on NEAR',
            supportedChains: ['near'],
            supportedAssets: ['NEAR'],
            estimatedTime: '1-2 seconds',
            feeRange: '~0.001 NEAR',
          };
        default:
          return {
            rail,
            name: rail,
            description: 'Payment rail',
            supportedChains: [],
            supportedAssets: [],
            estimatedTime: 'Unknown',
            feeRange: 'Unknown',
          };
      }
    });
    
    return c.json({ routes: routeInfo });
  } catch (error: any) {
    console.error("Routes error:", error);
    return c.json({ error: error.message }, 400);
  }
});

export default app;
