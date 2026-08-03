import { useEffect, useState } from "react";
import { ApiError, api } from "./api";
import { GraphEditor } from "./pages/GraphEditor";
import { GraphList } from "./pages/GraphList";
import { Login } from "./pages/Login";

type Screen =
	| { name: "loading" }
	| { name: "login" }
	| { name: "list" }
	| { name: "editor"; graphId: string };

export default function App() {
	const [screen, setScreen] = useState<Screen>({ name: "loading" });

	useEffect(() => {
		api
			.me()
			.then((data) => {
				setScreen(
					data.authenticated ? { name: "list" } : { name: "login" },
				);
			})
			.catch(() => setScreen({ name: "login" }));
	}, []);

	if (screen.name === "loading") {
		return (
			<div className="app-shell" style={{ display: "grid", placeItems: "center" }}>
				<p className="muted">Loading…</p>
			</div>
		);
	}

	if (screen.name === "login") {
		return (
			<Login
				onSuccess={() => setScreen({ name: "list" })}
			/>
		);
	}

	if (screen.name === "editor") {
		return (
			<GraphEditor
				graphId={screen.graphId}
				onBack={() => setScreen({ name: "list" })}
				onLogout={async () => {
					await api.logout();
					setScreen({ name: "login" });
				}}
			/>
		);
	}

	return (
		<GraphList
			onOpen={(graphId) => setScreen({ name: "editor", graphId })}
			onLogout={async () => {
				try {
					await api.logout();
				} catch (error) {
					if (!(error instanceof ApiError)) throw error;
				}
				setScreen({ name: "login" });
			}}
		/>
	);
}
