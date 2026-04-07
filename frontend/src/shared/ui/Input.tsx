import { forwardRef, type InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", error, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`w-full bg-zinc-800/80 border rounded-md px-3 py-2 text-xs font-mono text-zinc-100 placeholder-zinc-500 outline-none transition-colors ${
          error
            ? "border-red-500/50 focus:border-red-400"
            : "border-zinc-700 focus:border-emerald-500/50 focus:bg-zinc-800"
        } ${className}`}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";
