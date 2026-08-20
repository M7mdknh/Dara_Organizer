import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { recordRevision } from "@/services/revisions";

/**
 * Flat, admin-editable taxonomies share one shape (name/nameAr/description/
 * enabled/sortOrder). Dialects and categories are trees and have their own
 * handlers. All changes are recorded as revisions.
 */

export const FLAT_TAXONOMIES = {
  topics: db.topic,
  intents: db.intent,
  situations: db.situation,
  registers: db.register,
  functions: db.conversationalFunction,
} as const;

export type FlatTaxonomyKey = keyof typeof FLAT_TAXONOMIES;

export function taxonomyModel(type: string) {
  const model = FLAT_TAXONOMIES[type as FlatTaxonomyKey];
  if (!model) throw new ApiError(404, `Unknown taxonomy: ${type}`);
  // Delegates share the same CRUD surface for our fields.
  return model as unknown as {
    findMany: (args?: unknown) => Promise<Record<string, unknown>[]>;
    findUnique: (args: unknown) => Promise<Record<string, unknown> | null>;
    create: (args: unknown) => Promise<Record<string, unknown>>;
    update: (args: unknown) => Promise<Record<string, unknown>>;
    delete: (args: unknown) => Promise<Record<string, unknown>>;
  };
}

export const flatTaxonomySchema = z.object({
  name: z.string().min(1),
  nameAr: z.string().nullish(),
  description: z.string().nullish(),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function listFlatTaxonomy(type: string) {
  return taxonomyModel(type).findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
}

export async function createFlatTaxonomy(type: string, data: z.infer<typeof flatTaxonomySchema>, userId: string) {
  const created = await taxonomyModel(type).create({ data });
  await recordRevision(db, {
    entityType: `taxonomy:${type}`,
    entityId: String(created.id),
    kind: "CREATE",
    newValue: created,
    userId,
  });
  return created;
}

export async function updateFlatTaxonomy(
  type: string,
  id: string,
  data: Partial<z.infer<typeof flatTaxonomySchema>>,
  userId: string,
) {
  const model = taxonomyModel(type);
  const before = await model.findUnique({ where: { id } });
  if (!before) throw new ApiError(404, "Not found");
  const updated = await model.update({ where: { id }, data });
  await recordRevision(db, {
    entityType: `taxonomy:${type}`,
    entityId: id,
    kind: "UPDATE",
    oldValue: before,
    newValue: updated,
    userId,
  });
  return updated;
}

export async function deleteFlatTaxonomy(type: string, id: string, userId: string) {
  const model = taxonomyModel(type);
  const before = await model.findUnique({ where: { id } });
  if (!before) throw new ApiError(404, "Not found");
  await model.delete({ where: { id } });
  await recordRevision(db, {
    entityType: `taxonomy:${type}`,
    entityId: id,
    kind: "DELETE",
    oldValue: before,
    userId,
  });
}
