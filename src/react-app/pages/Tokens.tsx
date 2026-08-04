import { useTokens } from "../logic/useTokens";
import { TokensView } from "../ui/TokensView";

type Props = {
  onBack: () => void;
};

export function Tokens({ onBack }: Props) {
  const controller = useTokens();
  return <TokensView controller={controller} onBack={onBack} />;
}
