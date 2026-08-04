import { useLogin } from "../logic/useLogin";
import { LoginView } from "../ui/LoginView";

type Props = {
  onOpenLegal: (page: "terms" | "privacy") => void;
};

export function Login({ onOpenLegal }: Props) {
  const controller = useLogin();
  return <LoginView controller={controller} onOpenLegal={onOpenLegal} />;
}
