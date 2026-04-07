/**
 * Global toast notification system.
 *
 * Only exports React components + the context/hook so Fast Refresh works.
 * The useWhaleAlerts hook lives in ./useWhaleAlerts.ts
 */
import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { Info, CheckCircle2, AlertTriangle, XCircle, Search, X } from "lucide-react";

export type ToastType = "info" | "success" | "warning" | "error" | "whale";

export interface Toast {
  id: number;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number; // ms, default 5000
}

interface ToastCtx {
  addToast: (t: Omit<Toast, "id">) => void;
  removeToast: (id: number) => void;
}

const Ctx = createContext<ToastCtx>({
  addToast: () => {},
  removeToast: () => {},
});

export function useToast() {
  return useContext(Ctx);
}

const COLORS: Record<ToastType, { bar: string; icon: React.ReactNode; bg: string; border: string }> = {
  info:    { bar: "bg-sky-500",     icon: <Info className="w-4 h-4 text-sky-400" />,  bg: "bg-zinc-900",  border: "border-sky-700/50" },
  success: { bar: "bg-emerald-500", icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,   bg: "bg-zinc-900",  border: "border-emerald-700/50" },
  warning: { bar: "bg-amber-500",   icon: <AlertTriangle className="w-4 h-4 text-amber-400" />,  bg: "bg-zinc-900",  border: "border-amber-700/50" },
  error:   { bar: "bg-red-500",     icon: <XCircle className="w-4 h-4 text-red-400" />,   bg: "bg-zinc-900",  border: "border-red-700/50" },
  whale:   { bar: "bg-violet-500",  icon: <Search className="w-4 h-4 text-violet-400" />,  bg: "bg-zinc-950",  border: "border-violet-600/60" },
};

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: () => void }) {
  const [visible, setVisible] = useState(false);
  const c = COLORS[toast.type];

  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true), 20);
    const dur = toast.duration ?? 5000;
    const t2 = setTimeout(() => {
      setVisible(false);
      setTimeout(onRemove, 300);
    }, dur);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [toast.duration, onRemove]);

  return (
    <div
      className={`relative flex items-start gap-3 rounded-xl border p-3.5 shadow-2xl shadow-black/50 transition-all duration-300 max-w-sm w-full overflow-hidden ${c.bg} ${c.border} ${
        visible ? "translate-x-0 opacity-100" : "translate-x-4 opacity-0"
      }`}
    >
      {/* Accent bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${c.bar}`} />

      {/* Icon */}
      <span className="text-base leading-none shrink-0 pl-1">{c.icon}</span>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-mono font-semibold text-zinc-100">{toast.title}</p>
        {toast.message && (
          <p className="text-[10px] font-mono text-zinc-400 mt-0.5 leading-relaxed">
            {toast.message}
          </p>
        )}
      </div>

      {/* Close */}
      <button
        onClick={() => {
          setVisible(false);
          setTimeout(onRemove, 300);
        }}
        className="text-zinc-600 hover:text-zinc-300 transition-colors text-[10px] font-mono shrink-0"
      >
        ✕
      </button>

      {/* Timer progress bar */}
      <div
        className={`absolute bottom-0 left-0 h-0.5 ${c.bar} opacity-40`}
        style={{ animation: `toast-shrink ${toast.duration ?? 5000}ms linear forwards` }}
      />
    </div>
  );
}

let toastIdCounter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((t: Omit<Toast, "id">) => {
    const id = ++toastIdCounter;
    setToasts((prev) => {
      const next = [...prev, { ...t, id }];
      return next.length > 5 ? next.slice(-5) : next;
    });
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <Ctx.Provider value={{ addToast, removeToast }}>
      {children}
      {/* Toast stack — fixed top-right overlay */}
      <div
        className="fixed top-4 right-4 flex flex-col gap-2 items-end pointer-events-none"
        style={{ zIndex: 9999 }}
      >
        <style>{`
          @keyframes toast-shrink {
            from { width: 100%; }
            to { width: 0%; }
          }
        `}</style>
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem toast={t} onRemove={() => removeToast(t.id)} />
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
