import { useEffect } from "react";
import type { PublicUser } from "../../shared/types";
import { useGraphEditor } from "../logic/useGraphEditor";
import { documentTitle } from "../lib/routing";
import { GraphEditorView } from "../ui/graph-editor/GraphEditorView";

type Props = {
  graphId: string;
  focusNodeId?: string | null;
  user?: PublicUser | null;
  onBack: () => void;
  onLogout: () => void;
  onOpenTokens: () => void;
};

export function GraphEditor({ graphId, focusNodeId, user, onBack, onLogout, onOpenTokens }: Props) {
  const controller = useGraphEditor({ graphId, focusNodeId, onBack });
  const { state } = controller;

  useEffect(() => {
    document.title =
      state.loadError === "notFound"
        ? documentTitle("notFound")
        : documentTitle("editor", state.graph?.title);
  }, [state.graph?.title, state.loadError]);

  return (
    <GraphEditorView
      controller={controller}
      user={user}
      onBack={onBack}
      onLogout={onLogout}
      onOpenTokens={onOpenTokens}
    />
  );
}
