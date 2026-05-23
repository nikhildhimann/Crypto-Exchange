import {
  User,
  Shield,
  Bell,
  Key,
  CircleHelp,
  LogOut,
  ChevronRight,
  Coins,
  Globe,
  ArrowLeft,
} from "lucide-react";
import { useNavigate } from "react-router";
import { motion } from "motion/react";
import { useState } from "react";
import { ConfirmModal } from "../ui/ConfirmModal";
import { useAppContext } from "../../contexts/AppContext";
import { UI_ASSETS } from "../../config/uiAssets";

export function Settings() {
  const navigate = useNavigate();
  const { userProfile, fiatCurrency, language, logout } = useAppContext();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const SETTINGS_GROUPS = [
    {
      title: "Account",
      items: [
        {
          icon: User,
          label: "Profile Details",
          color: "text-indigo-400",
          bg: "bg-indigo-500/10",
          type: "profile",
        },
        {
          icon: Bell,
          label: "Notifications",
          color: "text-emerald-400",
          bg: "bg-emerald-500/10",
          type: "notifications",
        },
      ],
    },
    {
      title: "Security",
      items: [
        {
          icon: Shield,
          label: "Security Center",
          color: "text-rose-400",
          bg: "bg-rose-500/10",
          type: "security",
        },
        {
          icon: Key,
          label: "Recovery Phrase",
          color: "text-amber-400",
          bg: "bg-amber-500/10",
          type: "phrase",
        },
      ],
    },
    {
      title: "Preferences",
      items: [
        {
          icon: Coins,
          label: `Currency (${fiatCurrency})`,
          color: "text-indigo-400",
          bg: "bg-indigo-500/10",
          type: "currency",
        },
        {
          icon: Globe,
          label: `Language (${language})`,
          color: "text-emerald-400",
          bg: "bg-emerald-500/10",
          type: "language",
        },
      ],
    },
    {
      title: "Support",
      items: [
        {
          icon: CircleHelp,
          label: "Help & Support",
          color: "text-sky-400",
          bg: "bg-sky-500/10",
          type: "help",
        },
      ],
    },
  ];

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout({ revokeAll: false, reason: "manual" });
      navigate("/auth/login", { replace: true });
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="aura-container">
      <section className="settings-header-section sticky top-0 z-50">
        <div className="settings-header-inner aura-header">
          <button onClick={() => navigate(-1)} className="aura-header-button group">
            <ArrowLeft size={20} className="group-hover:-translate-x-0.5 transition-transform" />
          </button>
          <h1 className="aura-header-title">Settings</h1>
          <div className="w-10" />
        </div>
      </section>

      <div className="px-5 mt-6 space-y-8">
        <section className="settings-profile-section">
          <div className="settings-profile-inner">
            <div
              onClick={() => navigate("/app/settings/profile")}
              className="aura-card aura-card-interactive flex items-center space-x-4"
            >
              <img
                src={
                  userProfile?.avatar ||
                  UI_ASSETS.profileAvatar
                }
                alt="Profile"
                className="w-16 h-16 rounded-full object-cover border-2 border-indigo-500 shadow-lg shadow-indigo-500/20"
              />
              <div>
                <h2 className="text-lg font-bold text-white">
                  {userProfile?.displayName || "Crypto User"}
                </h2>
                <p className="text-sm font-medium text-slate-400">
                  {userProfile?.handle || "@cryptouser.eth"}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="settings-groups-section">
          <div className="settings-groups-inner space-y-6">
            {SETTINGS_GROUPS.map((group) => (
              <div key={group.title} className="space-y-3">
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider px-1">
                  {group.title}
                </h3>
                <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-lg">
                  {group.items.map((item, index) => (
                    <button
                      key={item.label}
                      onClick={() => navigate(`/app/settings/${item.type}`)}
                      className={`w-full flex items-center justify-between p-4 hover:bg-slate-800/50 transition-colors ${index !== group.items.length - 1 ? "border-b border-slate-800" : ""
                        }`}
                    >
                      <div className="flex items-center space-x-4">
                        <div
                          className={`w-10 h-10 ${item.bg} rounded-xl flex items-center justify-center`}
                        >
                          <item.icon size={20} className={item.color} />
                        </div>
                        <span className="text-sm font-semibold text-white">{item.label}</span>
                      </div>
                      <ChevronRight size={20} className="text-slate-500" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="settings-logout-section">
          <div className="settings-logout-inner">
            <button onClick={handleLogout} className="aura-btn-danger">
              <LogOut size={22} strokeWidth={2.5} />
              <span className="uppercase tracking-wide tracking-normal text-sm font-medium">
                Sign Out of Wallet
              </span>
            </button>
          </div>
        </section>
      </div>
      <ConfirmModal
        open={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={confirmLogout}
        title="Sign Out?"
        description="Are you sure you want to sign out? You'll need your recovery phrase or credentials to access this wallet again."
        confirmLabel="Sign Out"
        cancelLabel="Stay"
        isLoading={isLoggingOut}
      />
    </motion.div>
  );
}
