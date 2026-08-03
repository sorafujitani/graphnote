import { QUOTA } from "../shared/quota";
import type { GraphExport } from "../shared/types";

export async function putGraphExport(
  bucket: R2Bucket,
  userId: string,
  payload: GraphExport,
): Promise<string> {
  const key = `exports/${userId}/${payload.graph.id}/${payload.exportedAt.replace(/[:.]/g, "-")}.json`;
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

export async function deleteUserExports(bucket: R2Bucket, userId: string): Promise<void> {
  const prefix = `exports/${userId}/`;
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor });
    await Promise.all(page.objects.map((obj) => bucket.delete(obj.key)));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}
