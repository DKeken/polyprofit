/**
 * IconButton — square button for single-icon actions. Forces an aria-label
 * because there is no visible text.
 */
import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  /** Required: the accessible name. */
  "aria-label": string;
  size?: "sm" | "md";
  variant?: "ghost" | "primary" | "danger";
}

export function IconButton({
  icon,
  size = "md",
  variant = "ghost",
  className = "",
  ...rest
}: IconButtonProps) {
  const dim = size === "sm" ? "w-7 h-7" : "w-8 h-8";
  const variants = {
    ghost: "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60",
    primary: "text-emerald-400 hover:bg-emerald-500/10 border border-emerald-700/40",
    danger: "text-red-400 hover:bg-red-500/10 border border-red-900/40",
  } as const;
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center rounded-md transition-colors ${dim} ${variants[variant]} disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
      {...rest}
    >
      {icon}
    </button>
  );
}
