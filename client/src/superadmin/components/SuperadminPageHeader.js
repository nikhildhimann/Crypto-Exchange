export function SuperadminPageHeader({
  eyebrow = null,
  title,
  description,
  actions = null,
}) {
  return (
    <div className="flex flex-col gap-4 rounded-[30px] border border-white/8 bg-white/[0.03] p-5 shadow-[0_20px_70px_rgba(2,6,23,0.16)] backdrop-blur-xl sm:p-6 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0 space-y-3">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-cyan-200/80">
            {eyebrow}
          </p>
        ) : null}
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-[2.15rem]">
            {title}
          </h1>
          {description ? (
            <p className="max-w-3xl text-sm leading-7 text-slate-400 sm:text-[15px]">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex flex-wrap items-start gap-3 lg:max-w-[42rem] lg:justify-end">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
