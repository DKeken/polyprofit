/**
 * Tabs — controlled tab strip. The parent owns the active value, children
 * are simple `{ id, label, render }` rows. No router coupling.
 */
import type { ReactNode } from "react";

export interface TabSpec<T extends string = string> {
  id: T;
  label: ReactNode;
  badge?: ReactNode;
  disabled?: boolean;
}

export interface TabsProps<T extends string = string> {
  tabs: TabSpec<T>[];
  active: T;
  onChange: (id: T) => void;
  className?: string;
}

export function Tabs<T extends string = string>({
  tabs,
  active,
  onChange,
  className = "",
}: TabsProps<T>) {
  return (
    <div
      role="tablist"
      data-testid="tabs"
      className={`flex items-center gap-1 border-b border-zinc-800/60 ${className}`}
    >
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            disabled={t.disabled}
            onClick={() => !t.disabled && onChange(t.id)}
            className={`relative h-8 px-3 text-[10px] font-mono uppercase tracking-wider transition-colors flex items-center gap-1.5 ${
              isActive
                ? "text-zinc-100"
                : t.disabled
                  ? "text-zinc-600 cursor-not-allowed"
                  : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t.label}
            {t.badge && <span data-testid="tab-badge">{t.badge}</span>}
            {isActive && (
              <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-emerald-400 rounded-full" />
            )}
          </button>
        );
      })}
    </div>
  );
}
