import { createContext, use, type ComponentPropsWithoutRef, type MouseEvent } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

function stopSelection(event: MouseEvent<HTMLElement>) {
  event.stopPropagation();
}

function MarkdownLink({ href, children }: ComponentPropsWithoutRef<"a">) {
  const internal = href?.startsWith("/g/");
  return (
    <a
      href={href}
      target={internal ? undefined : "_blank"}
      rel={internal ? undefined : "noreferrer"}
      onClick={stopSelection}
    >
      {children}
    </a>
  );
}

/**
 * remark renders task checkboxes in document order; a counter reset on every
 * MarkdownContent render maps each one back to the line `toggleTask` flips.
 */
type TaskContextValue = { nextIndex: () => number; onToggle: (index: number) => void };
const TaskContext = createContext<TaskContextValue | null>(null);

function MarkdownInput(props: ComponentPropsWithoutRef<"input">) {
  const tasks = use(TaskContext);
  if (!tasks || props.type !== "checkbox") return <input {...props} disabled />;
  const index = tasks.nextIndex();
  return (
    <input
      type="checkbox"
      className="nodrag"
      checked={Boolean(props.checked)}
      aria-label={props.checked ? "完了を取り消す" : "完了にする"}
      onMouseDown={stopSelection}
      onDoubleClick={stopSelection}
      onClick={(event) => {
        event.stopPropagation();
        tasks.onToggle(index);
      }}
      onChange={() => {}}
    />
  );
}

const markdownComponents: Components = {
  a: MarkdownLink,
  input: MarkdownInput,
};

type Props = {
  children: string;
  className?: string;
  /** When given, task checkboxes become clickable and report their document-order index. */
  onToggleTask?: (index: number) => void;
};

export function MarkdownContent({ children, className, onToggleTask }: Props) {
  let seen = -1;
  const tasks: TaskContextValue | null = onToggleTask
    ? { nextIndex: () => ++seen, onToggle: onToggleTask }
    : null;
  return (
    <div className={className}>
      <TaskContext value={tasks}>
        <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {children}
        </Markdown>
      </TaskContext>
    </div>
  );
}
