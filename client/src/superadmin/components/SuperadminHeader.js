import { Menu, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { cn } from "../../lib/utils";
import { useSuperadminSession } from "../hooks/useSuperadminSession";
import { SuperadminConfirmModal } from "./SuperadminConfirmModal";

export function SuperadminHeader({
  route,
  breadcrumbs,
  onOpenMobileNav,
}) {
  const { email, logout, status } = useSuperadminSession();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = () => {
    void logout({ reason: "manual" });
  };

  return (
    <header className="sticky top-0 z-40 border-b border-white/8 bg-slate-950/70 shadow-[0_12px_40px_rgba(2,6,23,0.24)] backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[92rem] flex-col gap-3 px-4 py-3 sm:px-6 xl:px-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
          <button
            type="button"
            onClick={onOpenMobileNav}
            className="mt-1 flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-slate-200 transition hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/50 lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="h-4.5 w-4.5" />
          </button>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              {breadcrumbs.map((item, index) => (
                <div key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-2">
                  {item.href ? (
                    <Link
                      to={item.href}
                      className="truncate rounded-full px-2 py-1 transition hover:bg-white/[0.04] hover:text-slate-200"
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <span className="truncate rounded-full border border-white/8 bg-white/[0.03] px-2 py-1 text-slate-300">
                      {item.label}
                    </span>
                  )}
                  {index < breadcrumbs.length - 1 ? <span>/</span> : null}
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              <h1 className="truncate text-xl font-semibold tracking-tight text-white sm:text-2xl">
                {route?.title || "Superadmin"}
              </h1>
            </div>
            {route?.description ? (
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                {route.description}
              </p>
            ) : null}
          </div>
        </div>

          <div className="hidden items-center gap-3 sm:flex">
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-slate-300">
              <ShieldCheck className="h-4 w-4 text-emerald-300" />
              <span className={cn("whitespace-nowrap")}>{email || "Superadmin"}</span>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              disabled={status === "loading"}
              className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/50 disabled:cursor-not-allowed disabled:opacity-70"
            >
              Sign out
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 sm:hidden">
          <div className="flex min-w-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] font-medium text-slate-300">
            <ShieldCheck className="h-4 w-4 text-emerald-300" />
            <span className="truncate">{email || "Superadmin"}</span>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            disabled={status === "loading"}
            className="shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] font-medium text-slate-300 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/50 disabled:cursor-not-allowed disabled:opacity-70"
          >
            Sign out
          </button>
        </div>
      </div>

      <SuperadminConfirmModal
        open={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={confirmLogout}
        title="Sign out?"
        description="Are you sure you want to end your secure superadmin session? You will need to sign in again to access the control surface."
        confirmLabel="Sign out"
        cancelLabel="Stay"
        isLoading={status === "loading"}
      />
    </header>
  );
}
