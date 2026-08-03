import { useRef, useState } from "react";

type Props = {
  command: string;
  /** Short note rendered under the command. */
  hint?: string;
};

/** A copy-to-clipboard shell command, for install and setup instructions. */
export function CommandLine({ command, hint }: Props) {
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard denied (insecure context, policy, permission): select the text
      // so the keyboard shortcut still gets the user there.
      const code = codeRef.current;
      if (!code) return;
      const range = document.createRange();
      range.selectNodeContents(code);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }

  return (
    <div className="command-line">
      <div className="command-line-row">
        <code className="mono" ref={codeRef}>
          {command}
        </code>
        <button className="btn secondary" type="button" onClick={() => void copy()}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {hint ? <p className="muted command-line-hint">{hint}</p> : null}
    </div>
  );
}
