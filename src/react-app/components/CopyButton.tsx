import { useState, type RefObject } from "react";

type Props = {
  text: string;
  targetRef: RefObject<HTMLElement | null>;
  className?: string;
};

/** Copies text and selects its source when the Clipboard API is unavailable. */
export function CopyButton({ text, targetRef, className }: Props) {
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setStatus("コピーしました");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      const target = targetRef.current;
      if (!target) return;
      const range = document.createRange();
      range.selectNodeContents(target);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      setStatus("コピーできないためテキストを選択しました");
    }
  }

  return (
    <>
      <button
        className={`btn btn-secondary ${className ?? ""}`}
        type="button"
        onClick={() => void copy()}
      >
        {copied ? "コピーしました" : "コピー"}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {status}
      </span>
    </>
  );
}
