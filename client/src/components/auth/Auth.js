import { useNavigate } from "react-router";
import { Shield, Plus, Fingerprint, Mail, Lock, Eye, EyeOff } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";

import { useAppContext } from "../../contexts/AppContext";
import { beginSetupIntent } from "../../lib/accountSetupFlow";

export function Auth() {
  const navigate = useNavigate();
  const { appAccessState, sessionState, startSession, wallets } = useAppContext();
  const [showLogin, setShowLogin] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [shouldRouteAfterSession, setShouldRouteAfterSession] = useState(false);

  useEffect(() => {
    if (!shouldRouteAfterSession) {
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

    if (appAccessState === "unlocked" && wallets.length > 0) {
      navigate("/app/home", { replace: true });
      return;
    }

    if (sessionState === "active") {
      beginSetupIntent("create", { resetPending: true });
      const path = (appAccessState === "unlocked" || appAccessState === "pin_setup_required") ? "/app/account/create" : "/setup/seed";
      navigate(path, { replace: true });
    }
  }, [appAccessState, navigate, sessionState, shouldRouteAfterSession, wallets.length]);

  async function handleStartSession() {
    if (isStartingSession) {
      return;
    }

    setIsStartingSession(true);

    try {
      const session = await startSession();

      if (session?.accessToken || session?.token) {
        setShouldRouteAfterSession(true);
      }
    } catch (error) {
      console.error("Failed to start backend session:", error);
      setShouldRouteAfterSession(false);
    } finally {
      setIsStartingSession(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="auth-screen"
    >
      {/* Background Decor */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full -translate-y-40 translate-x-40 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-purple-500/10 rounded-full translate-y-40 -translate-x-40 blur-[120px] pointer-events-none" />

      <div className="auth-inner">
        {!showLogin ? (
          <div className="auth-hero">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", damping: 15 }}
              className="auth-icon-box"
            >
              <Shield size={48} className="text-white relative z-10" strokeWidth={2} />
            </motion.div>

            <div className="space-y-4">
              <h1 className="auth-heading">Secure Your Assets</h1>
              <p className="auth-subtext">
                Create a new account or restore an existing one using your 12-word recovery phrase.
              </p>
            </div>

            <div className="auth-footer">
              <button
                onClick={() => {
                  beginSetupIntent("create", { resetPending: true });
                  const path = (appAccessState === "unlocked" || appAccessState === "pin_setup_required") ? "/app/account/create" : "/setup/seed";
                  navigate(path);
                }}
                className="auth-btn-main"
              >
                <Plus size={22} strokeWidth={2.5} />
                <span>Create New Account</span>
              </button>

              <button
                onClick={() => {
                  beginSetupIntent("restore", { resetPending: true });
                  const path = (appAccessState === "unlocked" || appAccessState === "pin_setup_required") ? "/app/account/restore" : "/setup/restore";
                  navigate(path);
                }}
                className="auth-btn-ghost"
              >
                I Already Have an Account
              </button>

            </div>
          </div>
        ) : (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="flex-1 flex flex-col px-0 py-10 z-10"
          >
            <div className="text-center mb-5">
              <h1 className="text-4xl font-black text-white tracking-tighter mb-2 bg-gradient-to-b from-white to-slate-400 bg-clip-text text-transparent">Welcome Back</h1>
              <p className="text-sm text-slate-500 font-medium">Enter your credentials to continue</p>
            </div>

            <div className="flex-1 flex flex-col gap-1 space-y-6 justify-center">
              <div className="space-y-2.5 flex flex-col">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500  pl-1">Email or Phone</label>
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-indigo-400 transition-colors" size={20} />
                  <input
                    type="text"
                    placeholder="name@example.com"
                    className="login-input-field"
                  />
                </div>
              </div>

              <div className="space-y-2.5 flex flex-col ">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 pl-1">Wallet PIN</label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-indigo-400 transition-colors" size={20} />
                  <input
                    type={showPin ? "text" : "password"}
                    placeholder="••••••"
                    className="login-input-field"
                  />
                  <button
                    onClick={() => setShowPin(!showPin)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 hover:text-white transition-colors p-1"
                  >
                    {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <div className="flex justify-end pt-0.5">
                  <button className="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors">Forgot PIN?</button>
                </div>
              </div>

              <div className="pt-4 m-0">
                <button
                  onClick={handleStartSession}
                  className="w-full bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-black py-4.5 rounded-2xl shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
                >
                  Sign In
                </button>
              </div>

              <div className="flex flex-col items-center pt-10">
                <button className="flex flex-col items-center space-y-3 group">
                  <div className="w-16 h-16 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center text-slate-600 group-hover:text-indigo-400 group-hover:border-indigo-500/30 transition-all shadow-xl">
                    <Fingerprint size={32} />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 group-hover:text-white transition-colors">Use Biometrics</span>
                </button>
              </div>
            </div>

            <div className="mt-auto pt-6">
              <button
                onClick={() => setShowLogin(false)}
                className="w-full text-center text-slate-500 font-black text-[10px] uppercase tracking-[0.2em] hover:text-indigo-400 transition-colors py-2"
              >
                Create a new wallet instead
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
