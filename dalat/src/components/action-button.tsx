"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

type Result = { error?: string } | void;

export function ActionButton({
  action, confirm: confirmText, className, children, ariaLabel,
}: {
  action: () => Promise<Result>;
  confirm?: string;
  className?: string;
  children: React.ReactNode;
  ariaLabel?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const router = useRouter();

  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        aria-label={ariaLabel}
        disabled={pending}
        className={cn("brutal-btn inline-flex h-9 items-center gap-1 bg-white px-3 text-sm text-black disabled:opacity-50", className)}
        onClick={() => {
          if (confirmText && !window.confirm(confirmText)) return;
          setError(undefined);
          start(async () => {
            const r = await action();
            if (r && r.error) setError(r.error);
            else router.refresh();
          });
        }}
      >
        {children}
      </button>
      {error && <span role="alert" className="mt-1 text-xs font-medium text-red-700">{error}</span>}
    </span>
  );
}
