import { PanelLeftClose, PanelLeftOpen, ShieldCheck, X } from "lucide-react";
import { NavLink } from "react-router";
import { cn } from "../../lib/utils";

const VISIBLE_SUPERADMIN_NAV_IDS = [
  "overview",
  "users",
  "accounts",
  "wallets",
  "transactions",
  "deposits",
  "withdrawals",
  "sessions",
  "runtime",
  "chains",
  "jobs",
];

const VISIBLE_SUPERADMIN_NAV_ID_SET = new Set(VISIBLE_SUPERADMIN_NAV_IDS);

function SidebarItem({ item, collapsed, onNavigate }) {
  const Icon = item.icon;

  return (
    <NavLink
      to={item.fullPath}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "group flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition-all",
          collapsed ? "justify-center px-2" : "justify-start",
          isActive
            ? "bg-cyan-400/12 text-white shadow-[0_10px_40px_rgba(34,211,238,0.12)]"
            : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-100",
        )
      }
      end={item.fullPath === "/superadmin"}
    >
      {({ isActive }) => (
        <>
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border transition-all",
              isActive
                ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-100"
                : "border-white/8 bg-white/[0.03] text-slate-400 group-hover:border-white/14 group-hover:text-slate-100",
            )}
          >
            <Icon className="h-4.5 w-4.5" />
          </div>
          {!collapsed ? (
            <div className="min-w-0">
              <p className="truncate">{item.navLabel}</p>
            </div>
          ) : null}
        </>
      )}
    </NavLink>
  );
}

export function SuperadminSidebar({
  sections,
  collapsed,
  mobileOpen,
  onCloseMobile,
  onToggleCollapse,
}) {
  const visibleSections = sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => VISIBLE_SUPERADMIN_NAV_ID_SET.has(item.id)),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-[105] bg-slate-950/70 backdrop-blur-sm transition-opacity lg:hidden",
          mobileOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onCloseMobile}
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-[110] flex w-[19rem] flex-col border-r border-white/8 bg-[#06111f]/92 px-3 pb-3 pt-3 shadow-[0_20px_80px_rgba(2,6,23,0.6)] backdrop-blur-xl transition-all duration-300 lg:static lg:z-auto lg:translate-x-0 lg:px-4 lg:pb-4 lg:pt-4",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          collapsed ? "lg:w-[6.5rem]" : "lg:w-[19rem]",
        )}
      >
        <div className={cn("mb-5 flex items-center justify-between gap-3", collapsed && "lg:justify-end")}>
          <div className={cn("flex min-w-0 items-center gap-3", collapsed && "lg:hidden")}>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[22px] border border-cyan-300/20 bg-cyan-400/10 text-cyan-100 shadow-[0_16px_30px_rgba(34,211,238,0.16)]">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold uppercase tracking-[0.26em] text-cyan-200/80">
                Superadmin
              </p>
              <p className="truncate text-sm text-slate-400">
                Isolated control surface
              </p>
            </div>
          </div>

          <div className={cn("flex items-center gap-2", collapsed && "lg:w-full lg:justify-center")}>
            <button
              type="button"
              onClick={onToggleCollapse}
              className="hidden h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-slate-300 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/50 lg:flex"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? (
                <PanelLeftOpen className="h-4.5 w-4.5" />
              ) : (
                <PanelLeftClose className="h-4.5 w-4.5" />
              )}
            </button>

            <button
              type="button"
              onClick={onCloseMobile}
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-slate-300 transition hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/50 lg:hidden"
              aria-label="Close navigation"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto pr-1">
          {visibleSections.map((section) => (
            <div key={section.id} className="space-y-2">
              {!collapsed ? (
                <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                  {section.label}
                </p>
              ) : null}
              <div className="space-y-1">
                {section.items.map((item) => (
                  <SidebarItem
                    key={item.id}
                    item={item}
                    collapsed={collapsed}
                    onNavigate={onCloseMobile}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
