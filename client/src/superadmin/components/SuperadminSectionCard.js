import { cn } from "../../lib/utils";

export function SuperadminSectionCard({
  title,
  description,
  aside = null,
  children,
  className,
  contentClassName,
}) {
  return (
    <section
      className={cn(
        "rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(2,6,23,0.28)] backdrop-blur-xl",
        className,
      )}
    >
      {(title || description || aside) && (
        <div className="flex flex-col gap-4 border-b border-white/8 px-4 py-4 sm:px-5 sm:py-5 lg:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1.5">
              {title ? (
                <h2 className="text-lg font-semibold tracking-tight text-white">{title}</h2>
              ) : null}
              {description ? (
                <p className="max-w-2xl text-sm leading-6 text-slate-400">{description}</p>
              ) : null}
            </div>
            {aside}
          </div>
        </div>
      )}
      <div className={cn("px-4 py-4 sm:px-5 sm:py-5 lg:px-6", contentClassName)}>{children}</div>
    </section>
  );
}
