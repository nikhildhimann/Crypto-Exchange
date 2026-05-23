import { Check, Copy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "../../lib/utils";

function fallbackCopyText(value) {
  if (typeof document === "undefined") {
    return false;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  let copied = false;

  try {
    copied = document.execCommand("copy");
  } catch (_error) {
    copied = false;
  }

  document.body.removeChild(textarea);
  return copied;
}

async function copyText(value) {
  if (!value) {
    return false;
  }

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch (_error) {
    // Fallback below.
  }

  return fallbackCopyText(value);
}

export function isLikelyCopyableDetail(label = "", value = "") {
  const normalizedLabel = String(label || "").trim().toLowerCase();
  const normalizedValue = String(value || "").trim();

  if (!normalizedValue || normalizedValue === "Unavailable") {
    return false;
  }

  return [
    "id",
    "address",
    "hash",
    "public key",
    "public address",
    "wallet",
    "session",
    "reference",
    "tx",
    "destination",
  ].some((token) => normalizedLabel.includes(token));
}

export function SuperadminCopyValue({
  value = "",
  displayValue,
  copyValue,
  label = "",
  className,
  mono = true,
  compact = false,
  disabled = false,
}) {
  const [copied, setCopied] = useState(false);
  const normalizedValue = useMemo(() => String(value || "").trim(), [value]);
  const normalizedCopyValue = useMemo(
    () => String(copyValue ?? normalizedValue ?? "").trim(),
    [copyValue, normalizedValue],
  );
  const resolvedDisplayValue = displayValue ?? normalizedValue ?? "Unavailable";
  const canCopy = !disabled && Boolean(normalizedCopyValue) && normalizedCopyValue !== "Unavailable";

  useEffect(() => {
    if (!copied) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const handleCopy = async (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (!canCopy) {
      return;
    }

    const didCopy = await copyText(normalizedCopyValue);
    if (didCopy) {
      setCopied(true);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      void handleCopy(event);
    }
  };

  if (!canCopy) {
    return (
      <span className={cn("break-all text-white", mono && "font-mono text-[0.94em]", className)}>
        {resolvedDisplayValue}
      </span>
    );
  }

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={handleCopy}
      onKeyDown={handleKeyDown}
      title={copied ? "Copied" : `Copy ${label || "value"}`}
      className={cn(
        "group inline-flex min-w-0 max-w-full items-center gap-2.5 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2 text-left text-white transition hover:border-cyan-300/25 hover:bg-cyan-300/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/35",
        compact && "gap-2 rounded-xl px-2.5 py-1.5 text-xs",
        mono && "font-mono text-[0.94em]",
        className,
      )}
    >
      <span className="min-w-0 truncate">{resolvedDisplayValue}</span>
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full border border-white/8 bg-slate-950/70 p-1.5 text-slate-300 transition",
          compact && "p-1",
          copied && "border-emerald-300/20 bg-emerald-400/15 text-emerald-100",
        )}
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      </span>
    </span>
  );
}
