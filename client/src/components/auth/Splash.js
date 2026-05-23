import { useNavigate } from "react-router";
import { useEffect } from "react";
import { Wallet } from "lucide-react";
import { motion } from "motion/react";

import { useAppContext } from "../../contexts/AppContext";

export function Splash() {
  const navigate = useNavigate();
  const { bootStatus, wallets, appAccessState, hasPin } = useAppContext();

  useEffect(() => {
    // 1. Boot Status Gate: Prevents reading transient state during async session hydration
    if (bootStatus !== "ready") {
      return undefined;
    }

    const timer = setTimeout(() => {
      const hasSeenOnboarding = typeof window !== "undefined" && window.localStorage.getItem("aura_onboarding_completed") === "true";

      // 2. Route logged_out carefully. Use `hasPin` merely as a secondary hint for returning valid states
      if (appAccessState === "logged_out") {
        navigate("/onboarding", { replace: true });
        return;
      }

      if (appAccessState === "locked") {
        navigate("/unlock", { replace: true });
        return;
      }

      if (appAccessState === "pin_setup_required") {
        navigate("/unlock/setup-pin", { replace: true });
        return;
      }

      navigate(wallets.length > 0 ? "/app/home" : "/auth/login", { replace: true });
    }, 900);

    return () => clearTimeout(timer);
  }, [appAccessState, bootStatus, hasPin, navigate, wallets.length]);

  return (
    <div className="aura-container items-center justify-center">
      <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/20 rounded-full -translate-y-32 translate-x-32 blur-3xl" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/20 rounded-full translate-y-32 -translate-x-32 blur-3xl" />

      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", damping: 15, stiffness: 100 }}
        className="flex flex-col items-center z-10"
      >
        <div className="w-24 h-24 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-3xl flex items-center justify-center shadow-2xl shadow-indigo-500/50 mb-6 relative">
          <div className="absolute inset-0 bg-white/20 rounded-3xl blur-md" />
          <Wallet size={48} className="text-white relative z-10" strokeWidth={2} />
        </div>

        <motion.h1
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-4xl font-extrabold tracking-tight"
        >
          Crypto Wallet
        </motion.h1>

        <motion.p
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-slate-400 mt-2 font-medium"
        >
          Secure. Fast. Yours.
        </motion.p>

        <div className="mt-12 flex space-x-2">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
              className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]"
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
}
