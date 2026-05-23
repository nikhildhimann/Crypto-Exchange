import { cn } from "../../lib/utils";

export function SuperadminPage({
  header = null,
  children,
  className,
}) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-[92rem] flex-col gap-5 px-4 py-4 sm:gap-6 sm:px-6 sm:py-5 xl:px-8 xl:py-6",
        className,
      )}
    >
      {header}
      {children}
    </div>
  );
}
