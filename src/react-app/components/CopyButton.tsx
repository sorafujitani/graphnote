import { useEffect, useRef, useState, type RefObject } from "react";

type Props = {
  targetRef: RefObject<HTMLElement | null>;
  className?: string;
};

type Result = "copied" | "selected";

const LABEL: Record<Result, string> = {
  copied: "コピーしました",
  selected: "選択しました",
};

const ANNOUNCEMENT: Record<Result, string> = {
  copied: "コピーしました",
  selected: "コピーできないためテキストを選択しました",
};

/** Copies the target's text and selects it when the Clipboard API is unavailable. */
export function CopyButton({ targetRef, className }: Props) {
  const [result, setResult] = useState<Result | null>(null);
  const [status, setStatus] = useState("");
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function finish(next: Result) {
    // Empty the live region first so an identical message is announced again.
    setStatus("");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setResult(null);
      setStatus("");
    }, 1500);
    requestAnimationFrame(() => {
      setResult(next);
      setStatus(ANNOUNCEMENT[next]);
    });
  }

  async function copy() {
    const target = targetRef.current;
    if (!target) return;
    const text = target.textContent ?? "";
    try {
      await navigator.clipboard.writeText(text);
      finish("copied");
    } catch {
      const range = document.createRange();
      range.selectNodeContents(target);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      finish("selected");
    }
  }

  return (
    <>
      <button
        className={`btn btn-secondary ${className ?? ""}`}
        type="button"
        onClick={() => void copy()}
      >
        {result ? LABEL[result] : "コピー"}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {status}
      </span>
    </>
  );
}
