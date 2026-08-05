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
    <div>
      <div className="command-line-row flex items-center gap-2 rounded-[10px] border border-line bg-surface-soft py-[0.45rem] pr-2 pl-[0.7rem]">
        <code
          className="min-w-0 flex-1 overflow-x-auto font-mono text-[0.82rem] whitespace-nowrap"
          ref={codeRef}
        >
          {command}
        </code>
        <button
          className="btn btn-secondary shrink-0 px-[0.6rem] py-[0.3rem] text-[0.78rem]"
          type="button"
          onClick={() => void copy()}
        >
          {copied ? "コピーしました" : "コピー"}
        </button>
      </div>
      {hint ? (
        <p className="mt-[0.3rem] mb-0 text-[0.76rem] leading-normal text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
