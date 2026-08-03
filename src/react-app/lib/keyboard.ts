export function isEditableTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	const tag = target.tagName;
	if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
	return target.isContentEditable;
}

export function focusNodeField(
	nodeId: string,
	field: "title" | "body" = "title",
): void {
	const el = document.querySelector<HTMLElement>(
		`[data-node-id="${nodeId}"][data-node-field="${field}"]`,
	);
	el?.focus();
	if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
		const len = el.value.length;
		el.setSelectionRange(len, len);
	}
}

export function nearestNodeId(
	nodes: { id: string; x: number; y: number }[],
	fromId: string,
	direction: "up" | "down" | "left" | "right",
): string | null {
	const from = nodes.find((node) => node.id === fromId);
	if (!from || nodes.length < 2) return null;

	const axis =
		direction === "left" || direction === "right" ? "x" : "y";
	const cross = axis === "x" ? "y" : "x";
	const sign = direction === "right" || direction === "down" ? 1 : -1;

	let best: { id: string; score: number } | null = null;
	for (const node of nodes) {
		if (node.id === fromId) continue;
		const delta = (node[axis] - from[axis]) * sign;
		if (delta <= 8) continue;
		const drift = Math.abs(node[cross] - from[cross]);
		const score = delta + drift * 0.35;
		if (!best || score < best.score) best = { id: node.id, score };
	}
	return best?.id ?? null;
}
