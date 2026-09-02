import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { PublicUser } from "../../shared/types";

type Props = {
  /** Signed-in account shown at the top so the user can tell which one this is. */
  user?: PublicUser | null;
  children: (close: () => void) => ReactNode;
};

const ITEM_SELECTOR = "button:not([disabled]), a[href]";

export function AppMenu({ user, children }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeWithEscape = (event: KeyboardEvent | globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeWithEscape);
    panelRef.current?.querySelector<HTMLElement>(ITEM_SELECTOR)?.focus();
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, [open]);

  const close = () => setOpen(false);

  function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = [...(panelRef.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? [])];
    if (items.length === 0) return;
    event.preventDefault();
    const index = items.indexOf(document.activeElement as HTMLElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    items[(index + step + items.length) % items.length]?.focus();
  }

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        className="btn btn-secondary grid size-10 place-items-center px-0 py-0"
        type="button"
        aria-label="メニュー"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true" className="size-5 fill-current">
          <circle cx="4" cy="10" r="1.5" />
          <circle cx="10" cy="10" r="1.5" />
          <circle cx="16" cy="10" r="1.5" />
        </svg>
      </button>
      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="menu"
          aria-label="メニュー"
          className="panel absolute top-full right-0 z-30 mt-2 grid min-w-56 gap-1 p-2"
          onKeyDown={moveFocus}
        >
          {user ? (
            <div className="flex items-center gap-2 px-3 pt-1 pb-2">
              {user.image ? (
                <img src={user.image} alt="" className="size-7 shrink-0 rounded-full" />
              ) : null}
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{user.name}</div>
                <div className="truncate text-xs text-muted">{user.email}</div>
              </div>
            </div>
          ) : null}
          {children(close)}
        </div>
      ) : null}
    </div>
  );
}
