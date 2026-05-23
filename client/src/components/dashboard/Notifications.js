import { Bell, ArrowLeft, ArrowUpRight, ArrowDownLeft, Shield, Info, CheckCircle2, SlidersHorizontal, Calendar, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { useAppContext } from "../../contexts/AppContext";
import { getErrorMessage } from "../../lib/errorMessage";
import { runtimeConfig } from "../../lib/runtimeConfig";

function formatRelativeTime(value) {
  if (!value) {
    return "";
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return "";
  }

  const diffMs = timestamp - Date.now();
  const absSeconds = Math.round(Math.abs(diffMs) / 1000);

  if (absSeconds < 60) {
    return "now";
  }

  const ranges = [
    { unit: "minute", seconds: 60 },
    { unit: "hour", seconds: 3600 },
    { unit: "day", seconds: 86400 },
    { unit: "week", seconds: 604800 },
  ];

  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  for (let index = ranges.length - 1; index >= 0; index -= 1) {
    const range = ranges[index];
    if (absSeconds >= range.seconds) {
      return formatter.format(
        Math.round(diffMs / 1000 / range.seconds),
        range.unit,
      );
    }
  }

  return formatter.format(Math.round(diffMs / 60_000), "minute");
}

function getNotificationVisual(type = "") {
  switch (String(type || "").toUpperCase()) {
    case "PLATFORM_TRANSFER_RECEIVED":
    case "INTERNAL_TRANSFER_RECEIVED":
      return {
        icon: ArrowDownLeft,
        color: "text-emerald-400",
        bg: "bg-emerald-500/10",
      };
    case "PLATFORM_TRANSFER_SENT":
    case "INTERNAL_TRANSFER_SENT":
      return {
        icon: ArrowUpRight,
        color: "text-indigo-400",
        bg: "bg-indigo-500/10",
      };
    case "SYSTEM":
      return {
        icon: CheckCircle2,
        color: "text-indigo-400",
        bg: "bg-indigo-500/10",
      };
    default:
      return {
        icon: Info,
        color: "text-sky-400",
        bg: "bg-sky-500/10",
      };
  }
}

function mapNotificationToCard(notification = {}) {
  const visual = getNotificationVisual(notification.type);

  return {
    id: notification.notificationId || notification.id,
    notificationId: notification.notificationId || notification.id,
    title: notification.title || "Notification",
    desc: notification.message || "",
    time: formatRelativeTime(notification.createdAt) || "",
    isRead: Boolean(notification.isRead),
    transactionId: notification.metadata?.transactionId || "",
    icon: visual.icon,
    color: visual.color,
    bg: visual.bg,
  };
}

export function Notifications() {
  const navigate = useNavigate();
  const {
    notifications,
    unreadNotificationCount,
    notificationsLoading,
    notificationsHaveLoadedOnce,
    notificationsLastFetchedAt,
    refreshNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    clearAllNotifications,
  } = useAppContext();
  const [showFilter, setShowFilter] = useState(false);
  const [error, setError] = useState("");
  const [openingNotificationId, setOpeningNotificationId] = useState("");

  useEffect(() => {
    let isMounted = true;
    const isFresh =
      notificationsHaveLoadedOnce &&
      Number(notificationsLastFetchedAt || 0) > 0 &&
      Date.now() - Number(notificationsLastFetchedAt || 0) <
        runtimeConfig.notificationRefreshIntervalMs;

    if (isFresh) {
      return () => {
        isMounted = false;
      };
    }

    void refreshNotifications({ limit: 50 }, { force: !notificationsHaveLoadedOnce })
      .then(() => {
        if (isMounted) {
          setError("");
        }
      })
      .catch((requestError) => {
        if (isMounted) {
          setError(getErrorMessage(requestError, "Failed to load notifications"));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [
    notificationsHaveLoadedOnce,
    notificationsLastFetchedAt,
    refreshNotifications,
  ]);

  const notificationCards = useMemo(
    () => (notifications || []).map((notification) => mapNotificationToCard(notification)),
    [notifications],
  );

  const handleMarkAllRead = async () => {
    if (!unreadNotificationCount) {
      setShowFilter(false);
      return;
    }

    try {
      await markAllNotificationsRead();
      setError("");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Failed to update notifications"));
    }

    setShowFilter(false);
  };

  const handleClearAll = async () => {
    try {
      await clearAllNotifications();
      setError("");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Failed to clear notifications"));
    }

    setShowFilter(false);
  };

  const handleOpenNotification = async (notification) => {
    if (!notification?.notificationId) {
      return;
    }

    const nextTransactionId = String(notification.transactionId || "").trim();

    if (openingNotificationId === notification.notificationId) {
      return;
    }

    setOpeningNotificationId(notification.notificationId);

    try {
      if (!notification.isRead) {
        await markNotificationRead(notification.notificationId);
      }

      setError("");

      if (nextTransactionId) {
        navigate(`/app/transaction/${nextTransactionId}`);
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Failed to update notification"));
    } finally {
      setOpeningNotificationId("");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="aura-container relative"
    >
      <section className="notifications-header-section sticky top-0 z-50">
        <div className="notifications-header-inner aura-header">
          <button onClick={() => navigate(-1)} className="aura-header-button group">
            <ArrowLeft size={20} className="group-hover:-translate-x-0.5 transition-transform" />
          </button>
          <h1 className="aura-header-title">Notifications</h1>
          <div className="relative">
            <button onClick={() => setShowFilter(!showFilter)} className="aura-header-button">
              <SlidersHorizontal size={20} />
            </button>

            {/* Contextual Dropdown */}
            <AnimatePresence>
              {showFilter && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 mt-4 w-64 bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl z-[70] space-y-5"
                >
                  <div className="space-y-3">
                    <p className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest ml-1">Filter by Date</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button className="bg-slate-950 p-3 rounded-2xl border border-slate-800 flex items-center justify-center text-indigo-400">
                        <Calendar size={14} />
                      </button>
                      <button className="bg-slate-950 p-3 rounded-2xl border border-slate-800 flex items-center justify-center text-indigo-400">
                        <Calendar size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="h-px bg-slate-800" />

                  <div className="space-y-2">
                    <button
                      onClick={handleMarkAllRead}
                      className="w-full text-left px-1 py-1 text-sm font-bold text-slate-300 hover:text-white transition-colors flex items-center space-x-2"
                    >
                      <CheckCircle2 size={16} />
                      <span>Mark All as Read</span>
                    </button>
                    <button
                      onClick={handleClearAll}
                      className="w-full text-left px-1 py-1 text-sm font-bold text-rose-500 hover:text-rose-400 transition-colors flex items-center space-x-2"
                    >
                      <Trash2 size={16} />
                      <span>Clear All</span>
                    </button>
                    <button
                      onClick={() => setShowFilter(false)}
                      className="w-full bg-indigo-600 text-white text-xs font-black py-3 rounded-xl uppercase tracking-widest shadow-lg shadow-indigo-600/20 active:scale-95 transition-all"
                    >
                      Apply
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </section>

      <div className="px-5 mt-6 space-y-4">
        {error ? (
          <div className="aura-card !p-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-rose-300">{error}</p>
          </div>
        ) : null}

        {notificationCards.length > 0 ? (
          notificationCards.map((n) => (
            <motion.button
              key={n.id}
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleOpenNotification(n)}
              disabled={openingNotificationId === n.notificationId}
              className="aura-card aura-card-interactive w-full text-left flex items-start space-x-4 !p-4"
            >
              <div className={`w-12 h-12 rounded-2xl ${n.bg} flex items-center justify-center shrink-0 border border-white/5`}>
                <n.icon size={22} className={n.color} />
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-sm text-white">{n.title}</h3>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{n.time}</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{n.desc}</p>
              </div>
            </motion.button>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-20 space-y-4 opacity-40">
            <Bell size={64} strokeWidth={1} />
            <p className="font-bold uppercase tracking-[0.2em] text-xs">
              {notificationsLoading ? "Loading Notifications" : "No Notifications"}
            </p>
          </div>
        )}
      </div>

    </motion.div>
  );
}
