import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { KeyRound, ShieldAlert, Eye, EyeOff, LockKeyhole } from "lucide-react";
import { motion } from "motion/react";

import {
  getPinConfirmationError,
  getPinStorageSupport,
  getPinValidationError,
  sanitizePinInput,
} from "../../lib/pinSecurity";
import { useAppContext } from "../../contexts/AppContext";

export function PinSetup() {
  const navigate = useNavigate();
  const { appAccessState, wallets, hasPin, savePin, bootStatus } = useAppContext();

  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [pinTouched, setPinTouched] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);

  const pinStorageSupport = getPinStorageSupport();

  useEffect(() => {
    // 1. Boot Status Gate: Wait for session hydration before running route redirection
    if (bootStatus !== "ready") return;

    if (appAccessState === "logged_out") {
      navigate("/auth/login", { replace: true });
      return;
    }

    if (appAccessState === "locked") {
      navigate("/unlock", { replace: true });
      return;
    }

    if (hasPin && appAccessState === "unlocked") {
      navigate(wallets.length > 0 ? "/app/home" : "/auth/login", { replace: true });
    }
  }, [appAccessState, bootStatus, hasPin, navigate, wallets.length]);

  const pinError = pinTouched ? getPinValidationError(pin) : "";
  const confirmError = confirmTouched ? getPinConfirmationError(pin, confirmPin) : "";
  const validationError = pinError || confirmError || submitError;

  const canSubmit =
    pinStorageSupport.supported &&
    !loading &&
    !pinError &&
    !confirmError &&
    Boolean(pin && confirmPin);

  async function handleSubmit() {
    if (!canSubmit) {
      setPinTouched(true);
      setConfirmTouched(true);
      setSubmitError(pinError || confirmError || "PIN must be 6 digits");
      return;
    }

    setLoading(true);
    setSubmitError("");

    try {
      await savePin(pin);
      navigate("/app/home", { replace: true });
    } catch (requestError) {
      setSubmitError(requestError instanceof Error ? requestError.message : "Failed to save PIN");
    } finally {
      setLoading(false);
    }
  }

  function handlePinChange(value) {
    setPin(sanitizePinInput(value).slice(0, 6));
    setPinTouched(true);
    if (submitError) {
      setSubmitError("");
    }
  }

  function handleConfirmPinChange(value) {
    setConfirmPin(sanitizePinInput(value).slice(0, 6));
    setConfirmTouched(true);
    if (submitError) {
      setSubmitError("");
    }
  }

  async function handleKeyDown(event) {
    if (event.key === "Enter" && !loading) {
      await handleSubmit();
    }
  }

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
            <KeyRound size={48} className="text-white relative z-10" strokeWidth={2} />
          </motion.div>

          <div className="space-y-4">
            <h1 className="auth-heading">Set Your Wallet PIN</h1>
            <p className="auth-subtext">
              Create a 6-digit PIN for local app unlock. This PIN is required before you can use
              the wallet.
            </p>
          </div>

          <div className="w-full space-y-4">
            {/* <div className="rounded-3xl border border-amber-500/20 bg-amber-500/10 p-4 text-left">
              <div className="flex items-start space-x-3">
                <ShieldAlert size={18} className="mt-0.5 text-amber-400" />
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-200/80 leading-relaxed">
                  Your PIN is only for local quick unlock. It does not replace your recovery phrase.
                </p>
              </div>
            </div> */}

            {pinStorageSupport.message ? (
              <div
                className={`rounded-3xl border p-4 text-left ${pinStorageSupport.usesReducedSecurity
                  ? "border-amber-500/20 bg-amber-500/10"
                  : "border-rose-500/20 bg-rose-500/10"
                  }`}
              >
                <p
                  className={`text-xs font-bold uppercase tracking-[0.18em] leading-relaxed ${pinStorageSupport.usesReducedSecurity ? "text-amber-200/80" : "text-rose-200/90"
                    }`}
                >
                  {pinStorageSupport.message}
                </p>
              </div>
            ) : null}

            {/* <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 text-left">
              <div className="flex items-start space-x-3">
                <LockKeyhole size={18} className="mt-0.5 text-indigo-400" />
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                    Security Layer
                  </p>
                  <p className="mt-2 text-sm text-slate-300">
                    This PIN protects local wallet access on this device.
                  </p>
                </div>
              </div>
            </div> */}

            <label className="block space-y-2 text-left">
              <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-500">
                New PIN
              </span>
              <div className="relative">
                <input
                  type={showPin ? "text" : "password"}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  autoComplete="new-password"
                  value={pin}
                  onKeyDown={handleKeyDown}
                  onChange={(event) => handlePinChange(event.target.value)}
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

            <label className="block space-y-2 text-left">
              <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-500">
                Confirm PIN
              </span>
              <div className="relative">
                <input
                  type={showConfirmPin ? "text" : "password"}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  autoComplete="new-password"
                  value={confirmPin}
                  onKeyDown={handleKeyDown}
                  onChange={(event) => handleConfirmPinChange(event.target.value)}
                  className="w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 py-4 pr-14 text-center text-2xl font-black tracking-[0.5em] text-white outline-none transition-colors focus:border-indigo-500"
                  placeholder="••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPin((prev) => !prev)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 hover:text-white transition-colors p-1"
                >
                  {showConfirmPin ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>

            {validationError ? (
              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-rose-300">
                  {validationError}
                </p>
              </div>
            ) : null}
          </div>

          <div className="auth-footer">
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="auth-btn-main disabled:opacity-60 disabled:pointer-events-none"
            >
              {loading ? "Saving PIN..." : "Continue to Wallet"}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}