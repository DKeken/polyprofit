export function Badge({
  children,
  color = "zinc",
  className = "",
}: {
  children: React.ReactNode;
  color?: "zinc" | "emerald" | "red" | "sky" | "amber" | "violet" | "teal" | "indigo" | "rose";
  className?: string;
}) {
  const colors: Record<string, string> = {
    zinc: "bg-zinc-800 text-zinc-400 border-zinc-700",
    emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-800/50",
    red: "bg-red-500/10 text-red-400 border-red-800/50",
    sky: "bg-sky-500/10 text-sky-400 border-sky-800/50",
    amber: "bg-amber-500/10 text-amber-400 border-amber-800/50",
    violet: "bg-violet-500/10 text-violet-400 border-violet-800/50",
    teal: "bg-teal-500/10 text-teal-400 border-teal-800/50",
    indigo: "bg-indigo-500/10 text-indigo-400 border-indigo-800/50",
    rose: "bg-rose-500/10 text-rose-400 border-rose-800/50",
  };

  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[10px] font-medium font-mono border ${
        colors[color] || colors.zinc
      } ${className}`}
    >
      {children}
    </span>
  );
}
