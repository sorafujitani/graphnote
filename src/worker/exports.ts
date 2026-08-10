import { QUOTA } from "../shared/quota";
import type { GraphExport } from "../shared/types";

export async function putGraphExport(
  bucket: R2Bucket,
  userId: string,
  payload: GraphExport,
): Promise<string> {
  // Random suffix keeps same-millisecond exports from overwriting each other.
  const suffix = crypto.randomUUID().slice(0, 8);
  const key = `exports/${userId}/${payload.graph.id}/${payload.exportedAt.replace(/[:.]/g, "-")}-${suffix}.json`;
  await bucket.put(key, JSON.stringify(payload, null, 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
  await pruneOldExports(bucket, userId, payload.graph.id);
  return key;
}

async function pruneOldExports(bucket: R2Bucket, userId: string, graphId: string): Promise<void> {
  const prefix = `exports/${userId}/${graphId}/`;
  const listed = await bucket.list({ prefix });
  const objects = [...listed.objects].sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));
  const stale = objects.slice(QUOTA.maxExportsKeptPerGraph);
  await Promise.all(stale.map((obj) => bucket.delete(obj.key)));
}

export type ExportEntry = { name: string; size: number; uploaded: string };

export async function listGraphExports(
  bucket: R2Bucket,
  userId: string,
  graphId: string,
): Promise<ExportEntry[]> {
  const prefix = `exports/${userId}/${graphId}/`;
  const listed = await bucket.list({ prefix });
  return listed.objects
    .map((obj) => ({
      name: obj.key.slice(prefix.length),
      size: obj.size,
      uploaded: obj.uploaded.toISOString(),
    }))
    .sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
}

export async function getGraphExport(
  bucket: R2Bucket,
  userId: string,
  graphId: string,
  name: string,
): Promise<string | null> {
  if (name.includes("/") || name.includes("..")) return null;
  const object = await bucket.get(`exports/${userId}/${graphId}/${name}`);
  if (!object) return null;
  return object.text();
}

export async function deleteUserExports(bucket: R2Bucket, userId: string): Promise<void> {
  const prefix = `exports/${userId}/`;
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor });
    await Promise.all(page.objects.map((obj) => bucket.delete(obj.key)));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}
