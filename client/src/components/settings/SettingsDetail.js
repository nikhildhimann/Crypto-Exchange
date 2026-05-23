import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  ArrowLeft,
  Bell,
  Camera,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Key,
  Shield,
} from "lucide-react";
import { motion } from "motion/react";

import { useAppContext } from "../../contexts/AppContext";
import { UI_ASSETS } from "../../config/uiAssets";
import {
  getAutoLockLabel,
  getPinConfirmationError,
  getPinValidationError,
  isValidPinFormat,
  sanitizePinInput,
} from "../../lib/pinSecurity";
import { AUTO_LOCK_OPTIONS } from "../../store/unlockSlice";

const CURRENCY_OPTIONS = ["$ USD", "Rs INR", "EUR", "GBP", "JPY"];
const LANGUAGE_OPTIONS = ["English", "Hindi", "Spanish", "French", "Japanese"];
const FRIENDLY_TEXT_MAX_LENGTH = 50;
const FRIENDLY_TEXT_DISALLOWED_PATTERN = /[<>{}\[\];:"'`]/g;

function sanitizeFriendlyTextInput(value = "") {
  return String(value ?? "")
    .replace(FRIENDLY_TEXT_DISALLOWED_PATTERN, "")
    .slice(0, FRIENDLY_TEXT_MAX_LENGTH);
}

function SettingRow({ label, value, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between p-5 hover:bg-slate-800/50 transition-colors"
    >
      <span className="text-sm font-bold text-left">{label}</span>
      <div className="flex items-center space-x-2">
        {value ? <span className="text-xs font-semibold text-slate-500">{value}</span> : null}
        <ChevronRight size={18} className="text-slate-600" />
      </div>
    </button>
  );
}

export function SettingsDetail() {
  const { type } = useParams();
  const navigate = useNavigate();
  const {
    userProfile,
    updateUserProfile,
    fiatCurrency,
    setFiatCurrency,
    language,
    setLanguage,
    hasPin,
    autoLockMinutes,
    unlockState,
    savePin,
    changePin,
    setAutoLockPreference,
    setBiometricEnabled,
    session,
  } = useAppContext();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [selectedCurrency, setSelectedCurrency] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState("");
  const [selectedAutoLock, setSelectedAutoLock] = useState(autoLockMinutes);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [formError, setFormError] = useState("");
  const [isSaved, setIsSaved] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const fileInputRef = useRef(null);
  const toastTimerRef = useRef(null);

  useEffect(() => {
    if (userProfile && type === "profile") {
      setDisplayName(userProfile.displayName || "");
      setEmail(userProfile.email || "");
      setAvatarPreview(userProfile.avatar || null);
    }

    if (type === "currency") {
      setSelectedCurrency(fiatCurrency);
    }

    if (type === "language") {
      setSelectedLanguage(language);
    }

    if (type === "autolock") {
      setSelectedAutoLock(autoLockMinutes);
    }

    if (type === "pin") {
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
      setFormError("");
    }
  }, [autoLockMinutes, fiatCurrency, language, type, userProfile]);

  const handleImageChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => setAvatarPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const showSavedState = () => {
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const showToast = (message) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }

    setToastMessage(message);
    toastTimerRef.current = setTimeout(() => setToastMessage(""), 2400);
  };

  useEffect(
    () => () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    },
    [],
  );

  const handleSaveProfile = () => {
    updateUserProfile({
      displayName,
      email,
      ...(avatarPreview ? { avatar: avatarPreview } : {}),
    });
    showSavedState();
    showToast("Profile updated");
  };

  const handleSavePreferences = () => {
    if (type === "currency") {
      setFiatCurrency(selectedCurrency);
    }

    if (type === "language") {
      setLanguage(selectedLanguage);
    }

    showSavedState();
    showToast("Preferences updated");
  };

  const handleSavePin = async () => {
    setFormError("");
    const currentPinError = hasPin && currentPin && !isValidPinFormat(currentPin) ? "PIN must be 6 digits" : "";
    const newPinError = getPinValidationError(newPin);
    const confirmPinError = getPinConfirmationError(newPin, confirmPin);

    if (currentPinError || newPinError || confirmPinError) {
      setFormError(currentPinError || newPinError || confirmPinError);
      return;
    }

    if (hasPin && currentPin === newPin) {
      setFormError("New PIN must be different from current PIN");
      return;
    }

    try {
      if (hasPin) {
        if (!isValidPinFormat(currentPin)) {
          setFormError("Enter your current 6-digit PIN");
          return;
        }

        await changePin(currentPin, newPin);
      } else {
        await savePin(newPin);
      }

      showSavedState();
      showToast(hasPin ? "PIN updated successfully" : "PIN saved successfully");
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
    } catch (requestError) {
      setFormError(requestError instanceof Error ? requestError.message : "Failed to save PIN");
    }
  };

  const handleSaveAutoLock = () => {
    setAutoLockPreference(selectedAutoLock);
    showSavedState();
    showToast("Auto-lock updated");
  };

  const getTitle = () => {
    switch (type) {
      case "profile":
        return "Profile Details";
      case "notifications":
        return "Notifications";
      case "security":
        return "Security Center";
      case "phrase":
        return "Recovery Phrase";
      case "currency":
        return "Select Currency";
      case "language":
        return "Select Language";
      case "help":
        return "Help & Support";
      case "pin":
        return hasPin ? "Change PIN" : "Set PIN";
      case "autolock":
        return "Auto-Lock Timer";
      default:
        return "Settings";
    }
  };

  const currentPinError = hasPin && currentPin.length > 0 && !isValidPinFormat(currentPin)
    ? "PIN must be 6 digits"
    : "";
  const newPinError = newPin.length > 0 ? getPinValidationError(newPin) : "";
  const confirmPinError = confirmPin.length > 0 ? getPinConfirmationError(newPin, confirmPin) : "";
  const duplicatePinError =
    hasPin && isValidPinFormat(currentPin) && isValidPinFormat(newPin) && currentPin === newPin
      ? "New PIN must be different from current PIN"
      : "";
  const pinValidationError = currentPinError || newPinError || confirmPinError || duplicatePinError || formError;
  const canSavePin =
    (!hasPin || isValidPinFormat(currentPin)) &&
    !newPinError &&
    !confirmPinError &&
    !duplicatePinError &&
    Boolean(newPin && confirmPin);

  return (
    <motion.div
      initial={{ x: 50, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="aura-container"
    >
      <section className="settings-detail-header-section sticky top-0 z-50">
        <div className="settings-detail-header-inner aura-header">
          <button onClick={() => navigate(-1)} className="aura-header-button group">
            <ArrowLeft size={20} className="group-hover:-translate-x-0.5 transition-transform" />
          </button>
          <h1 className="aura-header-title">{getTitle()}</h1>
          <div className="w-10" />
        </div>
      </section>

      {toastMessage ? (
        <div className="fixed left-1/2 top-20 z-[120] -translate-x-1/2 px-5">
          <div className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 shadow-xl backdrop-blur-xl">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">
              {toastMessage}
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex-1 px-5 mt-6 space-y-8 overflow-y-auto pb-24">
        {type === "profile" && (
          <section className="settings-detail-profile-section">
            <div className="settings-detail-profile-inner space-y-8">
              <div className="flex flex-col items-center space-y-4">
                <div className="relative group">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImageChange}
                    accept="image/*"
                    className="hidden"
                  />
                  {avatarPreview || userProfile?.avatar ? (
                    <img
                      src={avatarPreview || userProfile?.avatar}
                      alt="Avatar"
                      className="w-32 h-32 rounded-full object-cover border-4 border-indigo-500/30"
                    />
                  ) : (
                    <div className="w-32 h-32 rounded-full bg-indigo-600 flex items-center justify-center border-4 border-indigo-500/30 text-4xl font-black text-white">
                      {(displayName || userProfile?.displayName || "A").charAt(0).toUpperCase()}
                    </div>
                  )}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute bottom-0 right-0 p-2.5 bg-indigo-600 rounded-full border-4 border-slate-950 hover:bg-indigo-500 transition-all shadow-lg active:scale-95"
                  >
                    <Camera size={18} />
                  </button>
                </div>
                <div className="text-center">
                  <h2 className="text-2xl font-bold">{userProfile?.displayName || "Crypto User"}</h2>
                  <p className="text-slate-500 font-medium">{userProfile?.handle || "@cryptowallet"}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-extrabold text-slate-600 uppercase tracking-widest ml-1">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    maxLength={FRIENDLY_TEXT_MAX_LENGTH}
                    onChange={(event) => setDisplayName(sanitizeFriendlyTextInput(event.target.value))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-sm font-bold focus:border-indigo-500 outline-none transition-colors"
                  />
                </div>
              </div>

              <button
                onClick={handleSaveProfile}
                className={`w-full py-4 rounded-2xl font-bold transition-all shadow-lg flex items-center justify-center space-x-2 active:scale-[0.98] ${isSaved
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-none"
                  : "bg-indigo-600 shadow-indigo-600/30 text-white hover:bg-indigo-500"
                  }`}
              >
                {isSaved ? (
                  <>
                    <CheckCircle2 size={20} />
                    <span>Changes Saved</span>
                  </>
                ) : (
                  <span>Save Changes</span>
                )}
              </button>
            </div>
          </section>
        )}

        {type === "security" && (
          <section className="settings-detail-security-section">
            <div className="settings-detail-security-inner space-y-6">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden divide-y divide-slate-800">
                <SettingRow
                  label={hasPin ? "Change PIN" : "Set PIN"}
                  value={hasPin ? "Configured" : "Required"}
                  onClick={() => navigate("/app/settings/pin")}
                />
                <SettingRow
                  label="Auto-Lock Timer"
                  value={getAutoLockLabel(autoLockMinutes)}
                  onClick={() => navigate("/app/settings/autolock")}
                />
                <SettingRow
                  label="Recovery Phrase"
                  value="Offline backup"
                  onClick={() => navigate("/app/settings/phrase")}
                />
                <SettingRow
                  label="Biometric Preference"
                  value={unlockState.biometricEnabled ? "Enabled" : "Disabled"}
                  onClick={() => setBiometricEnabled(!unlockState.biometricEnabled)}
                />
              </div>


              <div className="bg-rose-500/10 border border-rose-500/20 p-5 rounded-3xl flex items-start space-x-4">
                <Shield className="text-rose-500 shrink-0" size={24} />
                <div>
                  <h4 className="text-sm font-bold text-rose-500">Security Warning</h4>
                  <p className="text-xs text-rose-500/70 font-medium mt-1">
                    PIN and biometric unlock are only for local app access. They are not a recovery
                    method and cannot replace your recovery phrase.
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {type === "pin" && (
          <section className="settings-detail-security-section">
            <div className="settings-detail-security-inner space-y-6">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
                <div>
                  <p className="text-[10px] font-extrabold text-slate-500 uppercase tracking-[0.18em]">
                    {hasPin ? "Current PIN" : "Wallet PIN"}
                  </p>
                  <p className="text-sm text-slate-400 mt-1">
                    {hasPin
                      ? "Enter your current PIN and choose a new one."
                      : "Set a mandatory 6-digit PIN for local wallet unlock."}
                  </p>
                </div>

                {hasPin ? (
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={currentPin}
                    onChange={(event) => {
                      setCurrentPin(sanitizePinInput(event.target.value));
                      setFormError("");
                    }}
                    placeholder="Current PIN"
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-center text-xl font-black tracking-[0.4em] text-white outline-none focus:border-indigo-500 placeholder:text-slate-600"
                  />
                ) : null}

                <div className="grid gap-4">
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={newPin}
                    placeholder="New PIN"
                    onChange={(event) => {
                      setNewPin(sanitizePinInput(event.target.value));
                      setFormError("");
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-center text-xl font-black tracking-[0.4em] text-white outline-none focus:border-indigo-500 placeholder:text-slate-600"
                  />
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={confirmPin}
                    placeholder="Confirm PIN"
                    onChange={(event) => {
                      setConfirmPin(sanitizePinInput(event.target.value));
                      setFormError("");
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-center text-xl font-black tracking-[0.4em] text-white outline-none focus:border-indigo-500 placeholder:text-slate-600"
                  />
                </div>

                {pinValidationError ? (
                  <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-rose-300">
                      {pinValidationError}
                    </p>
                  </div>
                ) : null}

                <button
                  onClick={handleSavePin}
                  disabled={!canSavePin}
                  className={`w-full py-4 rounded-2xl font-bold transition-all shadow-lg flex items-center justify-center space-x-2 active:scale-[0.98] ${isSaved
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-none"
                    : "bg-indigo-600 shadow-indigo-600/30 text-white hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none"
                    }`}
                >
                  {isSaved ? (
                    <>
                      <CheckCircle2 size={20} />
                      <span>PIN Saved</span>
                    </>
                  ) : (
                    <span>{hasPin ? "Update PIN" : "Save PIN"}</span>
                  )}
                </button>
              </div>
            </div>
          </section>
        )}

        {type === "autolock" && (
          <section className="settings-detail-preferences-section">
            <div className="settings-detail-preferences-inner space-y-6">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden divide-y divide-slate-800">
                {AUTO_LOCK_OPTIONS.map((minutes) => {
                  const isSelected = selectedAutoLock === minutes;

                  return (
                    <button
                      key={minutes}
                      onClick={() => setSelectedAutoLock(minutes)}
                      className="w-full flex items-center justify-between p-5 hover:bg-slate-800/50 transition-colors group"
                    >
                      <span
                        className={`text-sm font-bold transition-colors ${isSelected ? "text-indigo-400" : "text-slate-300 group-hover:text-white"
                          }`}
                      >
                        {getAutoLockLabel(minutes)}
                      </span>
                      {isSelected ? (
                        <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
                      ) : null}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={handleSaveAutoLock}
                className={`w-full py-4 rounded-2xl font-bold transition-all shadow-lg flex items-center justify-center space-x-2 active:scale-[0.98] ${isSaved
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-none"
                  : "bg-indigo-600 shadow-indigo-600/30 text-white hover:bg-indigo-500"
                  }`}
              >
                {isSaved ? (
                  <>
                    <CheckCircle2 size={20} />
                    <span>Timer Saved</span>
                  </>
                ) : (
                  <span>Save Auto-Lock Timer</span>
                )}
              </button>
            </div>
          </section>
        )}

        {(type === "currency" || type === "language") && (
          <section className="settings-detail-preferences-section">
            <div className="settings-detail-preferences-inner space-y-6">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden divide-y divide-slate-800">
                {(type === "currency" ? CURRENCY_OPTIONS : LANGUAGE_OPTIONS).map((item) => {
                  const value = type === "currency" ? item.split(" ")[0] : item;
                  const isSelected =
                    type === "currency" ? selectedCurrency === value : selectedLanguage === value;

                  return (
                    <button
                      key={item}
                      onClick={() =>
                        type === "currency" ? setSelectedCurrency(value) : setSelectedLanguage(value)
                      }
                      className="w-full flex items-center justify-between p-5 hover:bg-slate-800/50 transition-colors group"
                    >
                      <span
                        className={`text-sm font-bold transition-colors ${isSelected
                          ? "text-indigo-400"
                          : "text-slate-300 group-hover:text-white"
                          }`}
                      >
                        {item}
                      </span>
                      {isSelected ? (
                        <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
                      ) : null}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={handleSavePreferences}
                className={`w-full py-4 rounded-2xl font-bold transition-all shadow-lg flex items-center justify-center space-x-2 active:scale-[0.98] ${isSaved
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-none"
                  : "bg-indigo-600 shadow-indigo-600/30 text-white hover:bg-indigo-500"
                  }`}
              >
                {isSaved ? (
                  <>
                    <CheckCircle2 size={20} />
                    <span>Changes Saved</span>
                  </>
                ) : (
                  <span>Save Changes</span>
                )}
              </button>
            </div>
          </section>
        )}

        {type === "phrase" && (
          <section className="settings-detail-phrase-section">
            <div className="settings-detail-phrase-inner space-y-6">
              <div className="flex flex-col items-center py-8 text-center">
                <div className="w-20 h-20 bg-amber-500/20 rounded-full flex items-center justify-center border border-amber-500/30 text-amber-500 shadow-lg shadow-amber-500/10">
                  <Key size={40} />
                </div>
                <h3 className="mt-6 text-xl font-bold">Recovery Phrase Handling</h3>
                <p className="text-sm text-slate-400 mt-2 leading-relaxed max-w-[320px]">
                  Your recovery phrase is shown during account setup or restore. It should be stored
                  offline and is only needed for full recovery after logout or device loss.
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
                <div className="flex items-start space-x-3">
                  <InfoBlock
                    title="Daily unlock"
                    body="Use local PIN or future biometric unlock to open the app and restore the backend session."
                  />
                </div>
                <div className="flex items-start space-x-3">
                  <InfoBlock
                    title="Full recovery"
                    body="If you log out or lose access to local session storage, the recovery phrase is required again."
                  />
                </div>
              </div>
            </div>
          </section>
        )}

        {(type === "notifications" || type === "help") && (
          <section className="settings-detail-empty-section">
            <div className="settings-detail-empty-inner flex flex-col items-center justify-center py-20 text-center space-y-6">
              <div className="w-24 h-24 bg-slate-900 rounded-full flex items-center justify-center border border-slate-800">
                {type === "notifications" ? (
                  <Bell size={40} className="text-slate-600" />
                ) : (
                  <CircleHelp size={40} className="text-slate-600" />
                )}
              </div>
              <div>
                <h3 className="text-lg font-bold">
                  No {type === "notifications" ? "Notifications" : "Tickets"} yet
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  We&apos;ll let you know when there&apos;s an update.
                </p>
              </div>
              <button className="px-8 py-3 bg-indigo-600 rounded-full text-sm font-bold">
                Refresh
              </button>
            </div>
          </section>
        )}
      </div>
    </motion.div>
  );
}

function InfoBlock({ title, body }) {
  return (
    <div>
      <p className="text-[10px] font-extrabold text-slate-500 uppercase tracking-[0.18em]">
        {title}
      </p>
      <p className="text-sm text-slate-300 mt-1 leading-relaxed">{body}</p>
    </div>
  );
}
