import { useEffect } from "react";

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: (e: KeyboardEvent) => void;
  /** Skip when focus is in an editable field (default true) */
  ignoreInputs?: boolean;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

export function useKeyboardShortcuts(
  shortcuts: KeyboardShortcut[],
  enabled = true
): void {
  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(e: KeyboardEvent) {
      for (const sc of shortcuts) {
        const ignoreInputs = sc.ignoreInputs !== false;
        if (ignoreInputs && isEditableTarget(e.target)) continue;

        const keyMatch = e.key.toLowerCase() === sc.key.toLowerCase();
        const ctrlMatch = Boolean(sc.ctrl) === (e.ctrlKey || e.metaKey);
        const shiftMatch = Boolean(sc.shift) === e.shiftKey;
        const altMatch = Boolean(sc.alt) === e.altKey;

        if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
          e.preventDefault();
          sc.handler(e);
          return;
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shortcuts, enabled]);
}
