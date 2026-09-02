import type { PublicUser } from "../../shared/types";
import { useGraphList } from "../logic/useGraphList";
import { GraphListView } from "../ui/GraphListView";

type Props = {
  user: PublicUser | null;
  onOpen: (graphId: string, nodeId?: string) => void;
  onLogout: () => void;
  onOpenTokens: () => void;
  onOpenHelp: () => void;
  onDeleteAccount: () => void;
};

export function GraphList(props: Props) {
  const controller = useGraphList({ onOpen: props.onOpen });
  return <GraphListView controller={controller} {...props} />;
}
