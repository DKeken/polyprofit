/**
 * Card — generic surface with optional header / footer slots.
 * Builds on the same dark-zinc palette as Panel but is composable.
 */
import type { HTMLAttributes, ReactNode } from "react";

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  variant?: "default" | "ghost" | "outline";
}

export function Card({
  title,
  subtitle,
  actions,
  footer,
  variant = "default",
  className = "",
  children,
  ...rest
}: CardProps) {
  let surface =
    "rounded-xl border transition-colors duration-200 flex flex-col min-h-0";
  if (variant === "default") {
    surface += " bg-zinc-900/60 border-zinc-800/60";
  } else if (variant === "outline") {
    surface += " bg-transparent border-zinc-700/60 hover:border-zinc-600/60";
  } else {
    surface += " bg-transparent border-transparent";
  }

  const hasHeader = Boolean(title || subtitle || actions);

  return (
    <div data-testid="card" className={`${surface} ${className}`} {...rest}>
      {hasHeader && (
        <header
          data-testid="card-header"
          className="flex items-start justify-between gap-3 px-4 pt-3 pb-2 border-b border-zinc-800/60"
        >
          <div className="min-w-0">
            {title && (
              <h3 className="text-xs font-mono font-semibold text-zinc-200 uppercase tracking-widest truncate">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-[10px] font-mono text-zinc-500 mt-0.5 truncate">
                {subtitle}
              </p>
            )}
          </div>
          {actions && <div className="shrink-0 flex items-center gap-1">{actions}</div>}
        </header>
      )}
      <div className="flex-1 min-h-0 p-4">{children}</div>
      {footer && (
        <footer
          data-testid="card-footer"
          className="px-4 py-2 border-t border-zinc-800/60 text-[10px] font-mono text-zinc-500"
        >
          {footer}
        </footer>
      )}
    </div>
  );
}
