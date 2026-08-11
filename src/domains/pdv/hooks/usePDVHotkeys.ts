import { useEffect, useCallback } from "react";

interface PDVHotkeyHandlers {
  onF2?: () => void;
  onF4?: () => void;
  onF8?: () => void;
  onEsc?: () => void;
  onEnter?: () => void;
}

export function usePDVHotkeys(handlers: PDVHotkeyHandlers) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

    switch (e.key) {
      case "F2": e.preventDefault(); handlers.onF2?.(); break;
      case "F4": e.preventDefault(); handlers.onF4?.(); break;
      case "F8": e.preventDefault(); handlers.onF8?.(); break;
      case "Escape": if (!isInput) { e.preventDefault(); handlers.onEsc?.(); } break;
      case "Enter": if (isInput) { e.preventDefault(); handlers.onEnter?.(); } break;
    }
  }, [handlers]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
