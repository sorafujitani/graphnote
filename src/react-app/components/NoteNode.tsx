import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import {
	useEffect,
	useState,
	type ChangeEvent,
	type FocusEvent,
	type KeyboardEvent,
	type MouseEvent,
} from "react";

export type NoteNodeData = {
	title: string;
	body: string;
	selectedCascade?: boolean;
	hovered?: boolean;
	onChange?: (patch: { title?: string; body?: string }) => void;
	onRequestChild?: () => void;
};

export type NoteFlowNode = Node<NoteNodeData, "note">;

export function NoteNode({ id, data, selected }: NodeProps<NoteFlowNode>) {
	const [title, setTitle] = useState(data.title);
	const [body, setBody] = useState(data.body);
	const active = selected || data.selectedCascade || data.hovered;

	useEffect(() => {
		setTitle(data.title);
	}, [data.title]);

	useEffect(() => {
		setBody(data.body);
	}, [data.body]);

	function stopMouse(event: MouseEvent) {
		event.stopPropagation();
	}

	function commitTitle() {
		if (title !== data.title) data.onChange?.({ title });
	}

	function commitBody() {
		if (body !== data.body) data.onChange?.({ body });
	}

	function blurEditor() {
		commitTitle();
		commitBody();
		(document.activeElement as HTMLElement | null)?.blur();
	}

	function onTitleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
		if (event.key === "Tab" && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
			event.preventDefault();
			event.stopPropagation();
			commitTitle();
			(event.target as HTMLInputElement).blur();
			data.onRequestChild?.();
			return;
		}
		event.stopPropagation();
		if (event.key === "Escape") {
			event.preventDefault();
			setTitle(data.title);
			(event.target as HTMLInputElement).blur();
			return;
		}
		if (event.key === "Enter") {
			event.preventDefault();
			commitTitle();
			const bodyField = document.querySelector<HTMLTextAreaElement>(
				`[data-node-id="${id}"][data-node-field="body"]`,
			);
			bodyField?.focus();
		}
	}

	function onBodyKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
		if (event.key === "Tab" && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
			event.preventDefault();
			event.stopPropagation();
			commitBody();
			(event.target as HTMLTextAreaElement).blur();
			data.onRequestChild?.();
			return;
		}
		event.stopPropagation();
		if (event.key === "Escape") {
			event.preventDefault();
			setBody(data.body);
			(event.target as HTMLTextAreaElement).blur();
			return;
		}
		if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			blurEditor();
		}
	}

	function onTitleChange(event: ChangeEvent<HTMLInputElement>) {
		setTitle(event.target.value);
	}

	function onBodyChange(event: ChangeEvent<HTMLTextAreaElement>) {
		setBody(event.target.value);
	}

	function onTitleBlur(_event: FocusEvent<HTMLInputElement>) {
		commitTitle();
	}

	function onBodyBlur(_event: FocusEvent<HTMLTextAreaElement>) {
		commitBody();
	}

	return (
		<div
			style={{
				position: "relative",
				minWidth: 200,
				width: 220,
				background: active ? "var(--accent-soft)" : "white",
				border: `1.5px solid ${active ? "var(--accent)" : "var(--line)"}`,
				borderRadius: 12,
				padding: "0.65rem 0.75rem",
				boxShadow: "var(--shadow)",
				outline: data.hovered && !selected ? "2px dashed var(--accent)" : "none",
				outlineOffset: 2,
			}}
		>
			{data.hovered ? (
				<div
					className="mono"
					style={{
						position: "absolute",
						top: -22,
						right: 0,
						fontSize: "0.68rem",
						color: "var(--accent)",
						background: "var(--bg-elevated)",
						border: "1px solid var(--line)",
						borderRadius: 6,
						padding: "0.1rem 0.35rem",
						pointerEvents: "none",
						whiteSpace: "nowrap",
					}}
				>
					Tab · child
				</div>
			) : null}
			<Handle type="target" position={Position.Left} />
			<input
				className="nodrag nopan"
				data-node-id={id}
				data-node-field="title"
				value={title}
				placeholder="Untitled"
				aria-label={`Title for node ${id}`}
				onMouseDown={stopMouse}
				onClick={stopMouse}
				onDoubleClick={stopMouse}
				onKeyDown={onTitleKeyDown}
				onChange={onTitleChange}
				onBlur={onTitleBlur}
				style={{
					width: "100%",
					border: "none",
					outline: "none",
					background: "transparent",
					fontWeight: 600,
					fontSize: "0.95rem",
					color: "var(--ink)",
					padding: 0,
					marginBottom: 6,
				}}
			/>
			<textarea
				className="nodrag nopan nowheel"
				data-node-id={id}
				data-node-field="body"
				value={body}
				placeholder="Write here…"
				aria-label={`Body for node ${id}`}
				rows={3}
				onMouseDown={stopMouse}
				onClick={stopMouse}
				onDoubleClick={stopMouse}
				onKeyDown={onBodyKeyDown}
				onChange={onBodyChange}
				onBlur={onBodyBlur}
				style={{
					width: "100%",
					border: "none",
					outline: "none",
					resize: "none",
					background: "transparent",
					fontSize: "0.82rem",
					lineHeight: 1.4,
					color: "var(--muted)",
					padding: 0,
					display: "block",
				}}
			/>
			<Handle type="source" position={Position.Right} />
		</div>
	);
}
