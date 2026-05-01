/**
 * Modal — minimal accessible dialog with backdrop and ESC-to-close.
 *
 * No portal / focus trap library: this is a small bot dashboard, not a banking
 * app. We mount inline at the call site; the backdrop covers the viewport.
 */
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Tailwind max-width class, e.g. `max-w-md`. Defaults to `max-w-lg`. */
  width?: string;
  /** When false the user cannot close by clicking the backdrop. ESC still works. */
  dismissOnBackdrop?: boolean;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = "max-w-lg",
  dismissOnBackdrop = true,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === "string" ? title : undefined}
      data-testid="modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* backdrop */}
      <div
        data-testid="modal-backdrop"
        onClick={dismissOnBackdrop ? onClose : undefined}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      {/* panel */}
      <div
        ref={dialogRef}
        className={`relative ${width} w-full bg-zinc-900 border border-zinc-700/60 rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden`}
      >
        {title && (
          <header className="px-4 py-3 border-b border-zinc-800/60 flex items-center justify-between">
            <h2 className="text-sm font-mono font-semibold text-zinc-100">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="text-zinc-500 hover:text-zinc-200 transition-colors text-base px-2 -mr-2"
            >
              ✕
            </button>
          </header>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto p-4">{children}</div>
        {footer && (
          <footer className="px-4 py-3 border-t border-zinc-800/60 flex items-center justify-end gap-2">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
