import { useEffect, useId, useRef, useState, type ReactNode } from "react";

type Props = {
  children: (close: () => void) => ReactNode;
};

export function AppMenu({ children }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        className="btn btn-secondary grid size-10 place-items-center px-0 py-0"
        type="button"
        aria-label="メニュー"
        aria-haspopup="true"
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
          id={panelId}
          className="panel absolute top-full right-0 z-30 mt-2 grid min-w-48 gap-1 p-2"
        >
          {children(close)}
        </div>
      ) : null}
    </div>
  );
}
