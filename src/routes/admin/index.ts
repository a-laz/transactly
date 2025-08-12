import { Hono } from 'hono';
import { OrgsRepo, ProjectsRepo, KeysRepo, QuotasRepo } from '../../repositories/admin';
import { db } from '../../db/client';
import { apiKeys } from '../../db/schema';
import { eq, desc } from 'drizzle-orm';
import { generateApiKey } from '../../utils/api-keys';

const app = new Hono();

function requireAdmin(c: any) {
  const key = c.req.header('x-admin-key') || '';
  const ok = (process.env.ADMIN_API_KEY || '') && key === process.env.ADMIN_API_KEY;
  return ok;
}

app.use('/*', async (c, next) => {
  if (!requireAdmin(c)) return c.json({ error: 'Unauthorized' }, 401);
  await next();
});

app.post('/orgs', async (c) => {
  const b = await c.req.json();
  const id = b.id || `org_${Date.now()}`;
  await OrgsRepo.create(id, b.name || 'Org');
  return c.json({ id });
});

app.get('/orgs', async () => ({ json: await OrgsRepo.list() } as any));

app.post('/projects', async (c) => {
  const b = await c.req.json();
  const id = b.id || `prj_${Date.now()}`;
  await ProjectsRepo.create(id, b.orgId, b.name || 'Project');
  return c.json({ id });
});

app.get('/projects', async (c) => {
  const orgId = c.req.query('orgId')!;
  const rows = await ProjectsRepo.listByOrg(orgId);
  return c.json({ rows });
});

app.post('/keys', async (c) => {
  const b = await c.req.json();
  const gen = generateApiKey(b.prefix || 'txn_dev');
  const id = b.id || `key_${Date.now()}`;
  await KeysRepo.create({ id, projectId: b.projectId, prefix: gen.prefix, hash: gen.hash, salt: gen.salt, alias: b.alias, scope: b.scope, expiresAt: b.expiresAt || null });
  return c.json({ id, apiKey: gen.plaintext });
});

app.post('/keys/:id/revoke', async (c) => {
  await KeysRepo.revoke(c.req.param('id'));
  return c.json({ ok: true });
});

app.get('/keys', async (c) => {
  const projectId = c.req.query('projectId');
  if (!projectId) return c.json({ error: 'projectId required' }, 400);
  const rows = await db.select().from(apiKeys).where(eq(apiKeys.projectId, projectId)).orderBy(desc(apiKeys.createdAt));
  return c.json({ rows });
});

app.post('/quotas', async (c) => {
  const b = await c.req.json();
  await QuotasRepo.upsert(b.projectId, b.period, b.limit, b.burst);
  return c.json({ ok: true });
});

export default app;


