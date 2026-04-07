import { Check } from "lucide-react";
import { forwardRef } from "react";

export type CheckboxProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className = "", ...props }, ref) => {
    return (
      <div className={`relative inline-flex items-center justify-center ${className}`}>
        <input
          type="checkbox"
          ref={ref}
          className="peer absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 m-0 p-0"
          {...props}
        />
        <div className="w-4 h-4 rounded border border-zinc-700 bg-zinc-900 group-hover:border-zinc-500 peer-hover:border-emerald-600 peer-checked:bg-emerald-500 peer-checked:border-emerald-500 peer-disabled:opacity-50 peer-disabled:cursor-not-allowed transition-colors flex items-center justify-center shrink-0">
          <Check className="w-3 h-3 text-zinc-950 opacity-0 peer-checked:opacity-100 transition-opacity stroke-3" />
        </div>
      </div>
    );
  }
);

Checkbox.displayName = "Checkbox";
