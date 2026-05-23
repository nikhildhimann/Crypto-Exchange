import { useEffect, useState } from "react";
import { cn } from "../../lib/utils";

/**
 * A subtle, non-blocking spinner that appears after a short delay.
 * Used for superadmin page transitions and lazy loading.
 */
export function SuperadminSubtleLoader({
  delay = 300,
  className,
  inline = false,
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(true);
    }, delay);

    return () => clearTimeout(timer);
  }, [delay]);

  if (!visible) return null;

  return (
    <div
      className={cn(
        "flex items-center justify-center",
        inline ? "inline-flex" : "h-full w-full min-h-[200px]",
        className
      )}
    >
      <div className="relative flex h-8 w-8 items-center justify-center">
        {/* Outer glow */}
        <div className="absolute inset-0 animate-pulse rounded-full bg-cyan-500/10 blur-xl" />
        
        {/* Subtle spinner */}
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-800 border-t-cyan-400" />
      </div>
    </div>
  );
}
