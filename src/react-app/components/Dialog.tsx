import { useRef, useState, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";

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
  const [returnFocus] = useState(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return null;
    // Menu items unmount when selected; return to their trigger instead.
    const triggerId = active.closest('[role="menu"]')?.getAttribute("aria-labelledby");
    return (triggerId ? document.getElementById(triggerId) : null) ?? active;
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        {...(!description ? { "aria-describedby": undefined } : {})}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (initialFocusRef?.current ?? closeRef.current)?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
        }}
        onEscapeKeyDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="grid min-w-0 gap-2">
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </div>
          <DialogClose asChild>
            <Button ref={closeRef} variant="ghost" size="icon" type="button" aria-label="閉じる">
              <X aria-hidden="true" />
            </Button>
          </DialogClose>
        </header>
        {children}
      </DialogContent>
    </Dialog>
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
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  return (
    <DialogFrame
      title={title}
      description={message}
      onClose={() => onResolve(false)}
      initialFocusRef={danger ? cancelRef : confirmRef}
    >
      <div className="flex flex-col-reverse gap-2 p-5 sm:flex-row sm:justify-end">
        <Button ref={cancelRef} variant="outline" type="button" onClick={() => onResolve(false)}>
          キャンセル
        </Button>
        <Button
          ref={confirmRef}
          variant={danger ? "destructive" : "default"}
          type="button"
          onClick={() => onResolve(true)}
        >
          {confirmLabel}
        </Button>
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
    <DialogFrame title={title} description={message} onClose={onClose} initialFocusRef={closeRef}>
      <div className="flex justify-end p-5">
        <Button ref={closeRef} type="button" onClick={onClose}>
          {closeLabel}
        </Button>
      </div>
    </DialogFrame>
  );
}
