import { db } from "../db/client";
import { apiKeyVersions, apiKeys, orgs, projects, quotas } from "../db/schema";
import { eq } from "drizzle-orm";

export const OrgsRepo = {
  async create(id: string, name: string) { await db.insert(orgs).values({ id, name }); },
  async list() { return db.select().from(orgs); },
};

export const ProjectsRepo = {
  async create(id: string, orgId: string, name: string) { await db.insert(projects).values({ id, orgId, name }); },
  async listByOrg(orgId: string) { return db.select().from(projects).where(eq(projects.orgId, orgId)); },
};

export const KeysRepo = {
  async create(args: { id: string; projectId: string; prefix: string; hash: string; salt: string; alias?: string; scope?: string; expiresAt?: number | null }) {
    await db.insert(apiKeys).values({ id: args.id, projectId: args.projectId, prefix: args.prefix, keyHash: args.hash, salt: args.salt, alias: args.alias ?? null, scope: args.scope ?? null, expiresAt: args.expiresAt ?? null });
    await db.insert(apiKeyVersions).values({ id: `${args.id}-v1`, apiKeyId: args.id, prefix: args.prefix, keyHash: args.hash, salt: args.salt });
  },
  async getByPrefix(prefix: string) { return (await db.select().from(apiKeys).where(eq(apiKeys.prefix, prefix)).limit(1))[0] || null; },
  async revoke(id: string) { await db.update(apiKeys).set({ status: 'revoked' }).where(eq(apiKeys.id, id)); },
};

export const QuotasRepo = {
  async upsert(projectId: string, period: 'minute' | 'hour' | 'day', limit: number, burst: number) {
    const id = `${projectId}:${period}`;
    await db.delete(quotas).where(eq(quotas.id, id));
    await db.insert(quotas).values({ id, projectId, period, limit, burst });
  },
  async list(projectId: string) { return db.select().from(quotas).where(eq(quotas.projectId, projectId)); },
};


