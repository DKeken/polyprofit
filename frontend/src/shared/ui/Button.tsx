interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
}

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: ButtonProps) {
  let base =
    "font-mono rounded-md border transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center";

  if (size === "sm") {
    base += " px-2.5 py-1 text-[10px] md:text-[11px]";
  } else {
    base += " px-4 py-1.5 text-xs";
  }

  if (variant === "primary") {
    base +=
      " bg-emerald-500/20 text-emerald-400 border-emerald-700/50 hover:bg-emerald-500/30";
  } else if (variant === "danger") {
    base += " bg-red-950/40 text-red-400 border-red-900/50 hover:bg-red-900/40 hover:text-red-300 hover:border-red-700/50 shadow-[0_0_10px_rgba(248,113,113,0.1)] hover:shadow-[0_0_15px_rgba(248,113,113,0.2)]";
  } else if (variant === "ghost") {
    base += " border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50";
  } else {
    // secondary
    base += " bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500";
  }

  return <button className={`${base} ${className}`} {...props} />;
}
