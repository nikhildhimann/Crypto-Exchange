import { cn } from "../../lib/utils";

const SIZE_CLASS_MAP = {
  sm: "h-10 w-10",
  md: "h-12 w-12",
  lg: "h-14 w-14",
};

export function WalletAvatar({
  icon,
  label = "Wallet",
  size = "md",
  className = "",
  imageClassName = "",
}) {
  const sizeClassName = SIZE_CLASS_MAP[size] || SIZE_CLASS_MAP.md;

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border border-white/10 bg-slate-900/80 shadow-lg overflow-hidden",
        sizeClassName,
        className,
      )}
    >
      {icon ? (
        <img
          src={icon}
          alt={`${label} icon`}
          className={cn("h-full w-full object-cover", imageClassName)}
        />
      ) : (
        <div className="h-3 w-3 rounded-full bg-slate-500/70" />
      )}
    </div>
  );
}
