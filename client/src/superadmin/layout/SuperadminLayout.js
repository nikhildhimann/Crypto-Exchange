import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router";
import { SuperadminHeader } from "../components/SuperadminHeader";
import { SuperadminSidebar } from "../components/SuperadminSidebar";
import {
  getSuperadminBreadcrumbs,
  getSuperadminNavSections,
  resolveSuperadminRoute,
} from "../config/routes";
import { useSuperadminAccess } from "../hooks/useSuperadminAccess";

export function SuperadminLayout() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { accessContext } = useSuperadminAccess();
  const route = resolveSuperadminRoute(location.pathname);
  const breadcrumbs = getSuperadminBreadcrumbs(route);
  const sections = getSuperadminNavSections(accessContext);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-[#020617] text-slate-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,#0f766e_0%,rgba(15,118,110,0.14)_18%,transparent_38%),radial-gradient(circle_at_top_right,#164e63_0%,rgba(22,78,99,0.14)_16%,transparent_36%),linear-gradient(180deg,#020617_0%,#020617_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),transparent_18%,transparent_82%,rgba(255,255,255,0.015))]" />
      <div className="relative flex h-full overflow-hidden">
        <SuperadminSidebar
          sections={sections}
          collapsed={collapsed}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
          onToggleCollapse={() => setCollapsed((current) => !current)}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <SuperadminHeader
            route={route}
            breadcrumbs={breadcrumbs}
            onOpenMobileNav={() => setMobileOpen(true)}
          />

          <main className="min-h-0 flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
