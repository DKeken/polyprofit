import { useRef, useEffect } from "react";
import type { LogEntry } from "../hooks/useBot";

const TYPE_STYLES: Record<string, string> = {
  EVAL: "log-eval",
  EXEC: "log-exec",
  FILL: "log-fill",
  ERR: "log-err",
  SYS: "log-sys",
};

export default function ExecutionLog({
  entries,
  connected,
}: {
  entries: LogEntry[];
  connected: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [entries.length]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-5 py-2 border-b border-zinc-800/30">
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
          execution log
        </div>
        <div className="text-[10px] font-mono text-zinc-600">
          {entries.length} entries
        </div>
      </div>

      {/* Log entries */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-5 py-1.5 min-h-0"
      >
        {entries.length === 0 ? (
          <div className="h-full flex items-center justify-center text-zinc-600 text-xs font-mono">
            {connected ? "Waiting for trades..." : "Disconnected"}
          </div>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-start gap-2 py-0.5 text-[11px] font-mono leading-relaxed animate-fade-in"
            >
              <span className={`shrink-0 font-semibold ${TYPE_STYLES[entry.type] ?? "text-zinc-500"}`}>
                {entry.type}
              </span>
              <span className="text-zinc-400 break-all flex-1">{entry.msg}</span>
              <span className="text-zinc-600 shrink-0 text-[10px]">{entry.ts}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
