import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  Fingerprint,
  LockKeyhole,
  Shield,
  Eye,
  EyeOff,
} from "lucide-react";
import { motion } from "motion/react";

import { useAppContext } from "../../contexts/AppContext";
import { isValidPinFormat, sanitizePinInput } from "../../lib/pinSecurity";

export function Unlock() {
  const navigate = useNavigate();
  const { appAccessState, wallets, unlockState, unlockWithPin, bootStatus } = useAppContext();

  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // 1. Boot Status Gate: Ensures wallets are completely fetched before appAccessState evaluates
    if (bootStatus !== "ready") return;

    if (appAccessState === "logged_out") {
      navigate("/auth/login", { replace: true });
      return;
    }

    if (appAccessState === "pin_setup_required") {
      navigate("/unlock/setup-pin", { replace: true });
      return;
    }

    if (appAccessState === "unlocked") {
      navigate(wallets.length > 0 ? "/app/home" : "/auth/login", { replace: true });
    }
  }, [appAccessState, bootStatus, navigate, wallets.length]);

  async function handleUnlock() {
    if (!isValidPinFormat(pin)) {
      setError("Enter your 6-digit PIN");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const isUnlocked = await unlockWithPin(pin);

      if (!isUnlocked) {
        setError("Incorrect PIN");
        return;
      }

      navigate(wallets.length > 0 ? "/app/home" : "/auth/login", { replace: true });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to unlock app");
    } finally {
      setLoading(false);
      setPin("");
    }
  }

  const handlePinChange = (value) => {
    setPin(sanitizePinInput(value).slice(0, 6));
    if (error) {
      setError("");
    }
  };

  const handleKeyDown = async (event) => {
    if (event.key === "Enter" && !loading) {
      await handleUnlock();
    }
  };

  const canUnlock = isValidPinFormat(pin) && !loading;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="auth-screen">
      <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full -translate-y-40 translate-x-40 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-purple-500/10 rounded-full translate-y-40 -translate-x-40 blur-[120px] pointer-events-none" />

      <div className="auth-inner">
        <div className="auth-hero">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", damping: 15 }}
            className="auth-icon-box"
          >
            <LockKeyhole size={48} className="text-white relative z-10" strokeWidth={2} />
          </motion.div>

          <div className="space-y-4">
            <h1 className="auth-heading">Unlock Crypto Wallet</h1>
            {/* <p className="auth-subtext">
              Your backend session is ready. Unlock the app locally to continue.
            </p> */}
          </div>

          <div className="w-full rounded-3xl border border-slate-800 bg-slate-900/70 p-5 text-left">
            <div className="flex items-start space-x-3">
              <Shield size={20} className="mt-0.5 text-indigo-400" />
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                  Quick Unlock Mode
                </p>
                <p className="mt-2 text-sm text-slate-300">
                  Method: <span className="capitalize">{unlockState.method || "pin"}</span>
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  Biometric preference: {unlockState.biometricEnabled ? "Enabled" : "Off"}
                </p>
              </div>
            </div>
          </div>

          <div className="w-full space-y-4">
            <label className="block space-y-2 text-left">
              <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-500">
                Wallet PIN
              </span>

              <div className="relative group">
                <input
                  type={showPin ? "text" : "password"}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  autoComplete="current-password"
                  value={pin}
                  onChange={(event) => handlePinChange(event.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 py-4 pr-14 text-center text-2xl font-black tracking-[0.5em] text-white outline-none transition-colors focus:border-indigo-500"
                  placeholder="••••••"
                />

                <button
                  type="button"
                  onClick={() => setShowPin((prev) => !prev)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 hover:text-white transition-colors p-1"
                >
                  {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>

            {error ? (
              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-rose-300">
                  {error}
                </p>
              </div>
            ) : null}

            {unlockState.biometricEnabled ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3">
                <div className="flex items-center space-x-3">
                  <Fingerprint size={18} className="text-indigo-400" />
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                    Biometric is enabled as a future convenience layer. PIN remains required here.
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          <div className="auth-footer">
            <button
              onClick={handleUnlock}
              disabled={!canUnlock}
              className="auth-btn-main disabled:opacity-60 disabled:pointer-events-none"
            >
              {loading ? "Unlocking..." : "Unlock App"}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
