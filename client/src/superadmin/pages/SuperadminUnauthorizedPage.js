import { ArrowLeft, ShieldAlert } from "lucide-react";
import { Link, useLocation } from "react-router";

export function SuperadminUnauthorizedPage() {
  const location = useLocation();
  const requestedPath = location.state?.from || "/superadmin";

  return (
    <div className="fixed inset-0 z-[120] overflow-hidden bg-slate-950 text-slate-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#164e63_0%,rgba(22,78,99,0.22)_18%,transparent_36%),linear-gradient(180deg,#020617_0%,#020617_100%)]" />
      <div className="relative flex h-full items-center justify-center px-6">
        <div className="w-full max-w-xl rounded-[32px] border border-white/10 bg-slate-900/80 p-8 shadow-[0_30px_120px_rgba(2,6,23,0.75)] backdrop-blur-xl">
          <div className="flex h-14 w-14 items-center justify-center rounded-[22px] border border-rose-300/20 bg-rose-400/10 text-rose-100">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div className="mt-6 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-rose-200/80">
              Access denied
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-white">
              You do not have permission to access this superadmin route.
            </h1>
            <p className="text-sm leading-7 text-slate-400">
              The requested path <span className="font-medium text-slate-200">{requestedPath}</span> is protected at the route level. If your backend session should carry elevated access, refresh your session after the role is provisioned server-side.
            </p>
          </div>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/app/home"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-medium text-slate-100 transition hover:bg-white/[0.06]"
            >
              <ArrowLeft className="h-4 w-4" />
              Return to app
            </Link>
            <Link
              to="/superadmin"
              className="inline-flex items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-3 text-sm font-medium text-cyan-50 transition hover:bg-cyan-400/15"
            >
              Retry superadmin entry
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
