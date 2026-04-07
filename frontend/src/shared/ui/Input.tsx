import { forwardRef, type InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", error, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`w-full bg-zinc-950 border rounded-md px-3 py-2 text-xs font-mono text-zinc-200 placeholder-zinc-700 outline-none transition-colors ${
          error
            ? "border-red-900/50 focus:border-red-500/50"
            : "border-zinc-800 focus:border-emerald-500/50"
        } ${className}`}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";
