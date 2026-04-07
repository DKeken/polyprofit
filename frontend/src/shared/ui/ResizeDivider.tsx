import type { DetailedHTMLProps, HTMLAttributes } from "react";

type ResizeDividerProps = DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement>;

export function ResizeDivider({ className = "", ...props }: ResizeDividerProps) {
  return (
    <div
      {...props}
      className={`w-1.5 shrink-0 mx-1 rounded-full bg-zinc-800 hover:bg-emerald-600/50 cursor-col-resize transition-colors active:bg-emerald-500/70 select-none ${className}`}
    />
  );
}
