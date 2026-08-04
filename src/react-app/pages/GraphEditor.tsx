import { useGraphEditor } from "../logic/useGraphEditor";
import { GraphEditorView } from "../ui/graph-editor/GraphEditorView";

type Props = {
  graphId: string;
  onBack: () => void;
  onLogout: () => void;
};

export function GraphEditor({ graphId, onBack, onLogout }: Props) {
  const controller = useGraphEditor({ graphId, onBack });
  return <GraphEditorView controller={controller} onBack={onBack} onLogout={onLogout} />;
}
