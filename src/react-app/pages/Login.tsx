import { useState, type FormEvent } from "react";
import { ApiError, api } from "../api";

type Props = {
	onSuccess: () => void;
};

export function Login({ onSuccess }: Props) {
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	async function onSubmit(event: FormEvent) {
		event.preventDefault();
		setBusy(true);
		setError(null);
		try {
			await api.login(password);
			onSuccess();
		} catch (err) {
			setError(err instanceof ApiError ? err.message : "login failed");
		} finally {
			setBusy(false);
		}
	}

	return (
		<div
			className="app-shell"
			style={{
				display: "grid",
				placeItems: "center",
				padding: "2rem",
			}}
		>
			<form
				className="panel"
				onSubmit={onSubmit}
				style={{
					width: "min(420px, 100%)",
					padding: "2rem",
					display: "grid",
					gap: "1.25rem",
				}}
			>
				<div>
					<p className="muted" style={{ margin: "0 0 0.35rem" }}>
						graphnote
					</p>
					<h1 style={{ margin: 0, fontSize: "1.8rem" }}>Sign in</h1>
					<p className="muted" style={{ margin: "0.5rem 0 0" }}>
						Personal graph notes on Cloudflare Workers.
					</p>
				</div>
				<label className="field">
					<span>Password</span>
					<input
						type="password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						autoFocus
						required
					/>
				</label>
				{error ? <p className="error-text">{error}</p> : null}
				<button className="btn accent" type="submit" disabled={busy}>
					{busy ? "Signing in…" : "Enter"}
				</button>
			</form>
		</div>
	);
}
