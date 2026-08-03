import { useEffect, useState, type FormEvent } from "react";
import type { Graph } from "../../shared/types";
import { ApiError, api } from "../api";
import { isEditableTarget } from "../lib/keyboard";

type Props = {
	onOpen: (graphId: string) => void;
	onLogout: () => void;
};

export function GraphList({ onOpen, onLogout }: Props) {
	const [graphs, setGraphs] = useState<Graph[]>([]);
	const [title, setTitle] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [activeIndex, setActiveIndex] = useState(0);

	async function refresh() {
		setLoading(true);
		setError(null);
		try {
			const data = await api.listGraphs();
			setGraphs(data.graphs);
			setActiveIndex((prev) =>
				data.graphs.length === 0 ? 0 : Math.min(prev, data.graphs.length - 1),
			);
		} catch (err) {
			setError(err instanceof ApiError ? err.message : "failed to load");
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		void refresh();
	}, []);

	async function onCreate(event?: FormEvent) {
		event?.preventDefault();
		try {
			const { graph } = await api.createGraph(title.trim() || "Untitled note");
			setTitle("");
			onOpen(graph.id);
		} catch (err) {
			setError(err instanceof ApiError ? err.message : "create failed");
		}
	}

	async function onDelete(graphId: string) {
		if (!confirm("Delete this note and all of its nodes?")) return;
		try {
			await api.deleteGraph(graphId);
			await refresh();
		} catch (err) {
			setError(err instanceof ApiError ? err.message : "delete failed");
		}
	}

	useEffect(() => {
		function onKeyDown(event: globalThis.KeyboardEvent) {
			if (isEditableTarget(event.target)) {
				if (event.key === "Escape") {
					(document.activeElement as HTMLElement | null)?.blur();
				}
				return;
			}

			if (event.key === "n") {
				event.preventDefault();
				document.querySelector<HTMLInputElement>("[data-new-note-input]")?.focus();
				return;
			}

			if (event.key === "ArrowDown") {
				event.preventDefault();
				setActiveIndex((prev) =>
					graphs.length === 0 ? 0 : Math.min(prev + 1, graphs.length - 1),
				);
				return;
			}

			if (event.key === "ArrowUp") {
				event.preventDefault();
				setActiveIndex((prev) => Math.max(prev - 1, 0));
				return;
			}

			if (event.key === "Enter") {
				const graph = graphs[activeIndex];
				if (!graph) return;
				event.preventDefault();
				onOpen(graph.id);
				return;
			}

			if (event.key === "Backspace" || event.key === "Delete") {
				const graph = graphs[activeIndex];
				if (!graph) return;
				event.preventDefault();
				void onDelete(graph.id);
			}
		}

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [activeIndex, graphs, onOpen]);

	return (
		<div className="app-shell" style={{ padding: "1.5rem" }}>
			<header
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "end",
					gap: "1rem",
					marginBottom: "1.5rem",
				}}
			>
				<div>
					<p className="muted" style={{ margin: 0 }}>
						graphnote
					</p>
					<h1 style={{ margin: "0.2rem 0 0", fontSize: "2rem" }}>Notes</h1>
				</div>
				<button className="btn secondary" type="button" onClick={onLogout}>
					Log out
				</button>
			</header>

			<form
				className="panel"
				onSubmit={(event) => void onCreate(event)}
				style={{
					display: "flex",
					gap: "0.75rem",
					padding: "1rem",
					marginBottom: "1rem",
					alignItems: "center",
				}}
			>
				<input
					data-new-note-input
					style={{
						flex: 1,
						border: "1px solid var(--line)",
						borderRadius: 10,
						padding: "0.65rem 0.8rem",
					}}
					placeholder="New note title"
					value={title}
					onChange={(e) => setTitle(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Escape") {
							e.preventDefault();
							(e.target as HTMLInputElement).blur();
						}
					}}
				/>
				<button className="btn accent" type="submit">
					Create
				</button>
			</form>

			{error ? <p className="error-text">{error}</p> : null}
			{loading ? <p className="muted">Loading notes…</p> : null}
			<p className="mono muted" style={{ fontSize: "0.78rem", marginBottom: "0.75rem" }}>
				N focus create · ↑↓ select · Enter open · ⌫ delete
			</p>

			<div style={{ display: "grid", gap: "0.75rem" }}>
				{graphs.map((graph, index) => {
					const active = index === activeIndex;
					return (
						<article
							key={graph.id}
							className="panel"
							style={{
								padding: "1rem 1.1rem",
								display: "flex",
								justifyContent: "space-between",
								gap: "1rem",
								alignItems: "center",
								outline: active ? "2px solid var(--accent)" : "none",
								background: active ? "var(--accent-soft)" : "var(--bg-elevated)",
							}}
						>
							<button
								type="button"
								className="btn ghost"
								onClick={() => onOpen(graph.id)}
								onFocus={() => setActiveIndex(index)}
								style={{
									textAlign: "left",
									padding: 0,
									flex: 1,
								}}
							>
								<div style={{ fontWeight: 600, fontSize: "1.05rem" }}>
									{graph.title}
								</div>
								<div className="muted mono" style={{ fontSize: "0.8rem" }}>
									updated {new Date(graph.updated_at).toLocaleString()}
								</div>
							</button>
							<button
								className="btn secondary"
								type="button"
								onClick={() => void onDelete(graph.id)}
							>
								Delete
							</button>
						</article>
					);
				})}
				{!loading && graphs.length === 0 ? (
					<p className="muted">No notes yet. Press N then Enter to create one.</p>
				) : null}
			</div>
		</div>
	);
}
