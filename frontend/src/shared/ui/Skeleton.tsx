/**
 * Skeleton — pulse placeholder. Width / height come from Tailwind utility
 * classes via `className`. The default makes a one-line text placeholder.
 */
import type { HTMLAttributes } from "react";

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  rounded?: "sm" | "md" | "lg" | "full";
}

export function Skeleton({ rounded = "md", className = "", ...rest }: SkeletonProps) {
  const radius = {
    sm: "rounded-sm",
    md: "rounded",
    lg: "rounded-lg",
    full: "rounded-full",
  }[rounded];
  return (
    <div
      data-testid="skeleton"
      aria-hidden="true"
      className={`bg-zinc-800/70 animate-pulse ${radius} h-3 w-full ${className}`}
      {...rest}
    />
  );
}
