import { useCallback, useState } from "react";
import type { ConfirmRequest } from "../components/Dialog";

export type PendingConfirm = ConfirmRequest & { resolve: (ok: boolean) => void };

/** Promise-shaped in-app confirmation, replacing `window.confirm`. */
export function useConfirm() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const confirm = useCallback(
    (request: ConfirmRequest) =>
      new Promise<boolean>((resolve) => {
        setPending({
          ...request,
          resolve: (ok) => {
            setPending(null);
            resolve(ok);
          },
        });
      }),
    [],
  );
  return { pending, confirm };
}
