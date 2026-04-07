import type { ReactNode } from "react";

interface PanelProps {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Panel({ title, action, children, className = "" }: PanelProps) {
  return (
    <div
      className={`flex flex-col min-h-0 bg-zinc-800/50 border border-zinc-700/50 rounded-xl overflow-hidden ${className}`}
    >
      {(title || action) && (
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-700/40 shrink-0">
          <span className="text-[11px] font-mono uppercase tracking-widest text-zinc-500 font-medium">
            {title}
          </span>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
    </div>
  );
}
