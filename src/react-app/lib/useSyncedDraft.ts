import { useState } from "react";

/**
 * Local editable draft that tracks an external value.
 * Syncs during render (React-recommended) instead of useEffect.
 */
export function useSyncedDraft(value: string) {
  const [draft, setDraft] = useState(value);
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    setDraft(value);
  }
  return [draft, setDraft] as const;
}
