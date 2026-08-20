import { db } from "@/lib/db";

/** Returns the given dialect id plus all descendant ids (for hierarchical filtering). */
export async function dialectWithDescendants(dialectId: string): Promise<string[]> {
  const all = await db.dialectNode.findMany({ select: { id: true, parentId: true } });
  const ids = new Set([dialectId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of all) {
      if (n.parentId && ids.has(n.parentId) && !ids.has(n.id)) {
        ids.add(n.id);
        grew = true;
      }
    }
  }
  return [...ids];
}

/** Returns the given dialect id plus all ancestor ids (records attached at a
 * common parent node also apply to child dialects). */
export async function dialectWithAncestors(dialectId: string): Promise<string[]> {
  const ids: string[] = [dialectId];
  let cursor: string | null = dialectId;
  while (cursor) {
    const node: { parentId: string | null } | null = await db.dialectNode.findUnique({
      where: { id: cursor },
      select: { parentId: true },
    });
    cursor = node?.parentId ?? null;
    if (cursor) ids.push(cursor);
  }
  return ids;
}
