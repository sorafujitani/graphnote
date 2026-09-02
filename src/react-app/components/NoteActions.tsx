import { createContext, use, type ReactNode } from "react";

export type NoteActions = {
  onChange: (nodeId: string, patch: { title?: string; body?: string }) => void;
  onResize: (nodeId: string, size: { x: number; y: number; width: number; height: number }) => void;
  onRequestChild: (nodeId: string) => void;
  onToggleTask: (nodeId: string, index: number) => void;
  onToggleCollapse: (nodeId: string) => void;
};

const NoteActionsContext = createContext<NoteActions | null>(null);

export function NoteActionsProvider({
  value,
  children,
}: {
  value: NoteActions;
  children: ReactNode;
}) {
  return <NoteActionsContext value={value}>{children}</NoteActionsContext>;
}

export function useNoteActions(): NoteActions {
  const actions = use(NoteActionsContext);
  if (!actions) {
    throw new Error("useNoteActions must be used within NoteActionsProvider");
  }
  return actions;
}
