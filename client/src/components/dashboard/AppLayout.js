import { Outlet, useNavigate, useLocation } from "react-router";
import { Home, History, Settings, ScanLine, BarChart3 } from "lucide-react";
import { cn } from "../../lib/utils";
import { motion } from "motion/react";

const NAV_ITEMS_LEFT = [
  { icon: Home, label: "Home", path: "/app/home" },
  { icon: BarChart3, label: "Markets", path: "/app/markets" },
];

const NAV_ITEMS_RIGHT = [
  { icon: History, label: "History", path: "/app/history" },
  { icon: Settings, label: "Settings", path: "/app/settings" },
];

const SETUP_ROUTES = [
  "/app/account/create",
  "/app/account/restore",
];

function isSetupRoute(pathname) {
  return SETUP_ROUTES.some((route) => pathname === route || pathname.startsWith(route + "/"));
}

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const hideNav = isSetupRoute(location.pathname);

  return (
    <div className="flex flex-col h-full w-full bg-slate-950 overflow-hidden relative">
      <div className="flex-1 flex flex-col min-h-0 relative">
        <Outlet />
      </div>

      {!hideNav && (
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-slate-900/95 backdrop-blur-3xl border-t border-white/5 h-22 z-[60] px-1 shadow-[0_-20px_60px_rgba(0,0,0,0.8)] flex items-center justify-between">
          <div className="flex items-center justify-around flex-1 h-full">
            {NAV_ITEMS_LEFT.map((item) => (
              <NavIcon
                key={item.label}
                item={item}
                isActive={location.pathname.startsWith(item.path)}
                onClick={() => navigate(item.path)}
              />
            ))}
          </div>

          <div className="relative -mt-16 mx-2">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => navigate("/app/scanner")}
              className="w-18 h-18 bg-indigo-600 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(99,102,241,0.6)] border-[6px] border-slate-950 relative overflow-hidden group"
            >
              <div className="absolute inset-0 bg-gradient-to-tr from-indigo-400 to-indigo-600 opacity-0 group-hover:opacity-20 transition-opacity" />
              <ScanLine size={28} className="text-white drop-shadow-lg" strokeWidth={2.5} />
            </motion.button>
          </div>

          <div className="flex items-center justify-around flex-1 h-full">
            {NAV_ITEMS_RIGHT.map((item) => (
              <NavIcon
                key={item.label}
                item={item}
                isActive={location.pathname.startsWith(item.path)}
                onClick={() => navigate(item.path)}
              />
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}

function NavIcon({ item, isActive, onClick }) {
  return (
    <button
      onClick={onClick}
      className="relative flex flex-col items-center justify-center w-16 h-full transition-all group"
    >
      <item.icon
        size={24}
        className={cn(
          "transition-all duration-300",
          isActive
            ? "text-indigo-400 drop-shadow-[0_0_10px_rgba(99,102,241,0.5)]"
            : "text-slate-500 group-hover:text-slate-400"
        )}
        strokeWidth={isActive ? 2.5 : 2}
      />
      <span
        className={cn(
          "text-[10px] font-black uppercase tracking-widest mt-1.5 transition-colors",
          isActive ? "text-indigo-400" : "text-slate-600 group-hover:text-slate-400"
        )}
      >
        {item.label}
      </span>
      {isActive && (
        <motion.div
          layoutId="nav-dot"
          className="absolute -top-1 w-1 h-1 bg-indigo-400 rounded-full"
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        />
      )}
    </button>
  );
}