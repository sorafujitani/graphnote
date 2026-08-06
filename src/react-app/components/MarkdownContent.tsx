import type { ComponentPropsWithoutRef, MouseEvent } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

function stopSelection(event: MouseEvent<HTMLAnchorElement>) {
  event.stopPropagation();
}

function MarkdownLink({ href, children }: ComponentPropsWithoutRef<"a">) {
  return (
    <a href={href} target="_blank" rel="noreferrer" onClick={stopSelection}>
      {children}
    </a>
  );
}

function MarkdownInput(props: ComponentPropsWithoutRef<"input">) {
  return <input {...props} disabled />;
}

const markdownComponents: Components = {
  a: MarkdownLink,
  input: MarkdownInput,
};

type Props = {
  children: string;
  className?: string;
};

export function MarkdownContent({ children, className }: Props) {
  return (
    <div className={className}>
      <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {children}
      </Markdown>
    </div>
  );
}
