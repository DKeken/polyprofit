export function Stat({
  label,
  value,
  highlight,
  className = "",
}: {
  label: string;
  value: string;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <span className="text-[9px] font-mono text-zinc-600 uppercase">
        {label}
      </span>
      <span
        className={`text-[10px] font-mono ${
          highlight ? "text-emerald-400" : "text-zinc-400"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
