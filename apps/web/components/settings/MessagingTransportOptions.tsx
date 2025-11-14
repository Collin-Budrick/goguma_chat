"use client";

import { type MessagingMode } from "@/lib/messaging-mode";
import { cn } from "@/lib/utils";

export type MessagingTransportOption = {
  id: MessagingMode;
  label: string;
  description: string;
};

type MessagingTransportOptionsProps = {
  value: MessagingMode;
  options: MessagingTransportOption[];
  onChange: (mode: MessagingMode) => void | Promise<void>;
  disabled?: boolean;
  className?: string;
};

export function MessagingTransportOptions({
  value,
  options,
  onChange,
  disabled = false,
  className,
}: MessagingTransportOptionsProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {options.map((option) => {
        const isActive = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => void onChange(option.id)}
            disabled={disabled || isActive}
            className={cn(
              "rounded-xl border px-3 py-3 text-left transition",
              isActive
                ? "border-white/60 bg-white/10 text-white"
                : "border-white/10 text-white/70 hover:border-white/25 hover:bg-white/10 hover:text-white",
              disabled && !isActive ? "cursor-not-allowed opacity-60" : null,
            )}
          >
            <span className="text-sm font-medium text-white">{option.label}</span>
            <p className="mt-1 text-xs text-white/60">{option.description}</p>
          </button>
        );
      })}
    </div>
  );
}

export default MessagingTransportOptions;
