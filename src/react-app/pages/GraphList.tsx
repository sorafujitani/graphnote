import { useGraphList } from "../logic/useGraphList";
import { GraphListView } from "../ui/GraphListView";

type Props = {
  onOpen: (graphId: string) => void;
  onLogout: () => void;
  onOpenTokens: () => void;
  onDeleteAccount: () => void;
};

export function GraphList(props: Props) {
  const controller = useGraphList({ onOpen: props.onOpen });
  return <GraphListView controller={controller} {...props} />;
}
