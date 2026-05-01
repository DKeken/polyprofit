/**
 * Spinner — tiny inline busy indicator. Pure CSS, no svg dep.
 */
export interface SpinnerProps {
  /** rem-based size; default 1rem (16px) */
  size?: "xs" | "sm" | "md";
  className?: string;
  label?: string;
}

export function Spinner({ size = "sm", className = "", label }: SpinnerProps) {
  const dim = { xs: "w-3 h-3", sm: "w-4 h-4", md: "w-5 h-5" }[size];
  return (
    <span
      role="status"
      aria-label={label ?? "Loading"}
      data-testid="spinner"
      className={`inline-block ${dim} border-2 border-zinc-600 border-t-emerald-400 rounded-full animate-spin ${className}`}
    />
  );
}
