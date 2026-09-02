import { QUOTA } from "../shared/quota";
import type { GraphExport } from "../shared/types";

export type ExportKind = "manual" | "auto";

const AUTO_SUFFIX = "-auto.json";

function isAuto(name: string): boolean {
  return name.endsWith(AUTO_SUFFIX);
}

export async function putGraphExport(
  bucket: R2Bucket,
  userId: string,
  payload: GraphExport,
  kind: ExportKind = "manual",
): Promise<string> {
  const key = exportKey(userId, payload, kind);
  // Nightly backups skip pretty-printing: the cron's CPU budget is shared by every note.
  await bucket.put(key, JSON.stringify(payload, null, kind === "auto" ? 0 : 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
  await pruneOldExports(bucket, userId, payload.graph.id);
  return key;
}

function exportKey(userId: string, payload: GraphExport, kind: ExportKind): string {
  const stamp = payload.exportedAt.replace(/[:.]/g, "-");
  // Random suffix keeps same-millisecond exports from overwriting each other;
  // nightly backups are one per day, so their suffix marks the kind instead.
  const name =
    kind === "auto" ? `${stamp}${AUTO_SUFFIX}` : `${stamp}-${crypto.randomUUID().slice(0, 8)}.json`;
  return `exports/${userId}/${payload.graph.id}/${name}`;
}

/** Manual exports and nightly backups have separate retention so neither evicts the other. */
async function pruneOldExports(bucket: R2Bucket, userId: string, graphId: string): Promise<void> {
  const prefix = `exports/${userId}/${graphId}/`;
  const listed = await bucket.list({ prefix });
  const objects = [...listed.objects].sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));
  const stale = [
    ...objects.filter((obj) => !isAuto(obj.key)).slice(QUOTA.maxExportsKeptPerGraph),
    ...objects.filter((obj) => isAuto(obj.key)).slice(QUOTA.maxAutoBackupsKeptPerGraph),
  ];
  await Promise.all(stale.map((obj) => bucket.delete(obj.key)));
}

export type ExportEntry = { name: string; size: number; uploaded: string; kind: ExportKind };

export async function listGraphExports(
  bucket: R2Bucket,
  userId: string,
  graphId: string,
): Promise<ExportEntry[]> {
  const prefix = `exports/${userId}/${graphId}/`;
  const listed = await bucket.list({ prefix });
  return listed.objects
    .map((obj) => {
      const name = obj.key.slice(prefix.length);
      return {
        name,
        size: obj.size,
        uploaded: obj.uploaded.toISOString(),
        kind: isAuto(name) ? ("auto" as const) : ("manual" as const),
      };
    })
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
  await deletePrefix(bucket, `exports/${userId}/`);
}

/** Backups of a purged note would otherwise sit in R2 forever, unreachable. */
export async function deleteGraphExports(
  bucket: R2Bucket,
  userId: string,
  graphId: string,
): Promise<void> {
  await deletePrefix(bucket, `exports/${userId}/${graphId}/`);
}

async function deletePrefix(bucket: R2Bucket, prefix: string): Promise<void> {
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor });
    await Promise.all(page.objects.map((obj) => bucket.delete(obj.key)));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}
