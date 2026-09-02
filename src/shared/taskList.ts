/** GFM task item: list marker, then `[ ]` / `[x]`. Anchored per line. */
const TASK_ITEM = /^(\s*(?:[-*+]|\d+[.)])\s+\[)( |x|X)(\])/gm;

/**
 * Flips the `index`-th task checkbox in `body` (document order, matching how
 * remark-gfm renders them). Returns the body unchanged when there is no such item.
 */
export function toggleTask(body: string, index: number): string {
  let seen = -1;
  return body.replace(TASK_ITEM, (match, open: string, state: string, close: string) => {
    seen += 1;
    if (seen !== index) return match;
    return `${open}${state === " " ? "x" : " "}${close}`;
  });
}
