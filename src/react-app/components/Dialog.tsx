import { useEffect, useRef, type ReactNode, type RefObject } from "react";

type DialogFrameProps = {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
};

export function DialogFrame({
  title,
  description,
  onClose,
  children,
  initialFocusRef,
}: DialogFrameProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    (initialFocusRef?.current ?? closeRef.current)?.focus();
  }, [initialFocusRef]);
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-4"
      onMouseDown={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        className="panel max-h-[min(42rem,calc(100vh-2rem))] w-full max-w-2xl overflow-hidden"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
            return;
          }
          if (event.key !== "Tab") return;
          const focusable = [
            ...event.currentTarget.querySelectorAll<HTMLElement>(
              'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          ];
          if (focusable.length === 0) return;
          const first = focusable[0] as HTMLElement;
          const last = focusable.at(-1) as HTMLElement;
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 id="app-dialog-title" className="m-0 font-brand text-xl font-bold">
              {title}
            </h2>
            {description ? <p className="mt-1 mb-0 text-sm text-muted">{description}</p> : null}
          </div>
          <button
            ref={closeRef}
            className="btn btn-ghost grid size-9 place-items-center p-0 text-xl"
            type="button"
            aria-label="閉じる"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

export type ConfirmRequest = {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
};

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger = false,
  onResolve,
}: ConfirmRequest & { onResolve: (ok: boolean) => void }) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  return (
    <DialogFrame title={title} onClose={() => onResolve(false)} initialFocusRef={confirmRef}>
      <div className="grid gap-5 p-5">
        <p className="m-0 text-sm leading-relaxed text-body">{message}</p>
        <div className="flex justify-end gap-2">
          <button className="btn btn-secondary" type="button" onClick={() => onResolve(false)}>
            キャンセル
          </button>
          <button
            ref={confirmRef}
            className={`btn ${danger ? "btn-danger" : "btn-accent"}`}
            type="button"
            onClick={() => onResolve(true)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </DialogFrame>
  );
}

export function AlertDialog({
  title,
  message,
  closeLabel = "閉じる",
  onClose,
}: {
  title: string;
  message: string;
  closeLabel?: string;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  return (
    <DialogFrame title={title} onClose={onClose} initialFocusRef={closeRef}>
      <div className="grid gap-5 p-5">
        <p className="m-0 text-sm leading-relaxed text-body">{message}</p>
        <div className="flex justify-end">
          <button ref={closeRef} className="btn btn-accent" type="button" onClick={onClose}>
            {closeLabel}
          </button>
        </div>
      </div>
    </DialogFrame>
  );
}
