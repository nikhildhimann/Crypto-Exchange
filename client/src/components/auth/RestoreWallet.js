import { useEffect, useState } from "react";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { motion } from "motion/react";

import { useAppContext } from "../../contexts/AppContext";
import {
  clearPendingAccountSetup,
  clearSetupIntent,
  readPendingAccountSetup,
  readSetupIntent,
  writePendingAccountSetup,
} from "../../lib/accountSetupFlow";
import {
  resolveExplicitProvisioningTarget,
  resolveProvisioningTarget,
} from "../../lib/walletProvisioning";
import { buildPrimaryProvisioningTargets } from "../../lib/walletProvisioningScope";

const VALID_MNEMONIC_WORD_COUNTS = new Set([12, 15, 18, 21, 24]);
const MNEMONIC_CHARACTER_PATTERN = /^[a-zA-Z\s]+$/;
const ACCOUNT_NAME_MAX_LENGTH = 50;
const ACCOUNT_NAME_DISALLOWED_PATTERN = /[<>{}\[\];:"'`]/g;

function getPrepareSessionErrorMessage(error) {
  if (error?.stage === "supported-chains") {
    return error?.message || "Unable to load supported chains";
  }

  return "Unable to prepare wallet session";
}

function normalizeMnemonicInput(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function validateMnemonicInput(value = "") {
  const normalized = normalizeMnemonicInput(value);

  if (!normalized) {
    return {
      normalized,
      error: "Recovery phrase is required",
    };
  }

  if (!MNEMONIC_CHARACTER_PATTERN.test(normalized)) {
    return {
      normalized,
      error: "Recovery phrase can contain only letters and spaces",
    };
  }

  const wordCount = normalized.split(" ").filter(Boolean).length;
  if (!VALID_MNEMONIC_WORD_COUNTS.has(wordCount)) {
    return {
      normalized,
      error: "Recovery phrase must contain 12, 15, 18, 21, or 24 words",
    };
  }

  return {
    normalized,
    error: "",
  };
}

function sanitizeAccountNameInput(value = "") {
  return String(value ?? "")
    .replace(ACCOUNT_NAME_DISALLOWED_PATTERN, "")
    .slice(0, ACCOUNT_NAME_MAX_LENGTH);
}

export function RestoreWallet() {
  const navigate = useNavigate();
  const location = useLocation();
  const pendingRestoreSetup = readPendingAccountSetup();
  const {
    activateAccountScope,
    importAccount,
    importWallet,
    prepareAuthSession,
    selectedNetworkCode,
    supportedChains,
    bootStatus,
    appAccessState,
    wallets,
    hasPin,
    unlockState,
  } = useAppContext();
  const [walletName, setWalletName] = useState(() =>
    pendingRestoreSetup?.mode === "restore" && pendingRestoreSetup?.label
      ? pendingRestoreSetup.label
      : "Main Account",
  );
  const [phrase, setPhrase] = useState(() =>
    pendingRestoreSetup?.mode === "restore" ? pendingRestoreSetup.mnemonic || "" : "",
  );
  const [isEditingParagraph, setIsEditingParagraph] = useState(true);
  const [lastValidCount, setLastValidCount] = useState(0);
  const [authReady, setAuthReady] = useState(false);
  const [setupSuccess, setSetupSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const setupIntent = readSetupIntent();
  const explicitChain =
    typeof setupIntent?.chain === "string" && setupIntent.chain.trim()
      ? setupIntent.chain.trim().toLowerCase()
      : "";
  const explicitNetwork =
    typeof setupIntent?.network === "string" && setupIntent.network.trim()
      ? setupIntent.network.trim().toLowerCase()
      : "";
  const availableChains = authReady ? supportedChains : [];
  const primaryTarget = explicitChain
    ? resolveExplicitProvisioningTarget(availableChains, explicitChain, explicitNetwork || selectedNetworkCode)
    : resolveProvisioningTarget(availableChains, selectedNetworkCode);
  const isPublicSetupRoute = location.pathname.startsWith("/setup");

  const getSafeExitPath = () => {
    if (appAccessState === "pin_setup_required") {
      return "/unlock/setup-pin";
    }

    if (appAccessState === "locked") {
      return "/unlock";
    }

    if (appAccessState === "unlocked" && wallets.length > 0) {
      return "/app/home";
    }

    return "/auth/login";
  };

  useEffect(() => {
    if (!setupSuccess || bootStatus !== "ready") {
      return;
    }

    if (appAccessState === "pin_setup_required") {
      navigate("/unlock/setup-pin", { replace: true });
    } else if (appAccessState === "locked") {
      navigate("/unlock", { replace: true });
    } else if (appAccessState === "unlocked" && wallets.length > 0) {
      navigate("/app/home", { replace: true });
    }
  }, [setupSuccess, appAccessState, bootStatus, navigate, wallets.length]);

  useEffect(() => {
    if (!isPublicSetupRoute || loading || bootStatus !== "ready" || wallets.length === 0) {
      return;
    }

    if (appAccessState === "pin_setup_required") {
      clearPendingAccountSetup();
      clearSetupIntent();
      navigate("/unlock/setup-pin", { replace: true });
      return;
    }

    if (appAccessState === "locked") {
      clearPendingAccountSetup();
      clearSetupIntent();
      navigate("/unlock", { replace: true });
      return;
    }

    if (appAccessState === "unlocked") {
      clearPendingAccountSetup();
      clearSetupIntent();
      navigate("/app/home", { replace: true });
    }
  }, [
    appAccessState,
    bootStatus,
    isPublicSetupRoute,
    loading,
    navigate,
    wallets.length,
  ]);

  useEffect(() => {
    let isMounted = true;

    async function prepare() {
      try {
        await prepareAuthSession();

        if (!isMounted) {
          return;
        }

        setAuthReady(true);
        setError("");
      } catch (requestError) {
        if (!isMounted) {
          return;
        }

        setAuthReady(false);
        setError(getPrepareSessionErrorMessage(requestError));
      }
    }

    prepare();

    return () => {
      isMounted = false;
    };
  }, [prepareAuthSession]);

  // Keep the setup intent until explicit cancel/success or TTL expiry. Clearing
  // it during component unmount causes the first navigation into restore/create
  // to race with React development remounts and the public route guard.

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setPhrase(text);
    } catch (err) {
      console.error("Failed to read clipboard:", err);
    }
  };

  const currentWords = phrase.trim().split(/\s+/).filter(Boolean);
  const wordCount = currentWords.length;
  const isComplete = wordCount >= 12 && walletName.trim().length > 0;

  useEffect(() => {
    const isValidLength = [12, 15, 18, 21, 24].includes(wordCount);

    // Auto-switch to grid only if we just reached a valid count from an invalid one
    if (isValidLength && wordCount !== lastValidCount && isEditingParagraph) {
      setIsEditingParagraph(false);
      setLastValidCount(wordCount);
    } else if (!isValidLength && lastValidCount !== 0) {
      // Reset lastValidCount if the phrase becomes invalid length
      setLastValidCount(0);
    }
  }, [wordCount, isEditingParagraph, lastValidCount]);

  const handleRestore = async () => {
    if (loading) {
      return;
    }

    if (!primaryTarget.chain || !primaryTarget.network) {
      setError("Wallet provisioning is unavailable right now");
      return;
    }

    const { normalized, error: mnemonicError } = validateMnemonicInput(phrase);
    if (mnemonicError) {
      setError(mnemonicError);
      return;
    }

    setLoading(true);
    setError("");

    try {
      await prepareAuthSession();
      const normalizedMnemonic = normalized;
      const pendingSetup = readPendingAccountSetup();
      const importedAccount =
        pendingSetup?.mode === "restore" &&
          pendingSetup.accountId &&
          pendingSetup.mnemonic === normalizedMnemonic
          ? {
            account: pendingSetup.account || {
              id: pendingSetup.accountId,
            },
          }
          : await importAccount({
            name: walletName.trim(),
            mnemonic: normalizedMnemonic,
          });
      writePendingAccountSetup({
        mode: "restore",
        account: importedAccount?.account || null,
        accountId: importedAccount?.account?.id || pendingSetup?.accountId || "",
        mnemonic: normalizedMnemonic,
        chain: primaryTarget.chain,
        network: primaryTarget.network,
        label: walletName.trim(),
      });
      clearSetupIntent();
      const wallet = await importWallet({
        accountId: importedAccount?.account?.id || "",
        chain: primaryTarget.chain,
        network: primaryTarget.network,
        label: walletName.trim(),
        mnemonic: normalizedMnemonic,
        provisioningTargets: buildPrimaryProvisioningTargets(
          primaryTarget.chain,
          primaryTarget.network,
        ),
      });
      await activateAccountScope(importedAccount?.account, {
        requestedWalletId: wallet?.walletId || "",
        reuseLoadedScope: true,
      });
      clearPendingAccountSetup();
      clearSetupIntent();

      // Hand route control to the effect hook waiting for bootStatus + appAccessState.
      setSetupSuccess(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to restore account");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!isComplete || loading) {
      return;
    }

    void handleRestore();
  };

  const handlePhraseKeyDown = (event) => {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    if (!isComplete || ![12, 15, 18, 21, 24].includes(wordCount)) {
      return;
    }

    event.preventDefault();
    void handleRestore();
  };

  const handleFormKeyDown = (event) => {
    if (event.key !== "Enter" || event.shiftKey || loading || !isComplete) {
      return;
    }

    const targetTagName = String(event.target?.tagName || "").toUpperCase();
    if (targetTagName === "BUTTON") {
      return;
    }

    event.preventDefault();
    void handleRestore();
  };

  const handleBack = () => {
    if (loading) {
      return;
    }

    if (isPublicSetupRoute) {
      clearPendingAccountSetup();
      clearSetupIntent();
      navigate(getSafeExitPath(), { replace: true });
      return;
    }

    navigate(-1);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="aura-container">
      <div className="aura-header">
        <button onClick={handleBack} className="aura-header-button group">
          <ArrowLeft size={20} className="group-hover:-translate-x-0.5 transition-transform" />
        </button>
        <h1 className="aura-header-title">Restore Account</h1>
        <div className="w-10" />
      </div>

      <form
        onSubmit={handleSubmit}
        onKeyDown={handleFormKeyDown}
        className="flex-1 px-5 mt-6 space-y-6 overflow-y-auto pb-24"
      >
        <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl flex items-start space-x-3">
          <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={18} />
          <p className="text-[11px] font-bold text-amber-500/80 uppercase tracking-widest leading-relaxed">
            Enter your 12-word recovery phrase carefully. The backend will restore the account and
            its supported wallets.
          </p>
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-rose-300">{error}</p>
          </div>
        )}

        <div className="space-y-5">
          <div className="space-y-1.5">
            <span className="text-[10px] font-extrabold text-slate-600 uppercase ml-1">
              Account Name
            </span>
            <input
              type="text"
              value={walletName}
              maxLength={ACCOUNT_NAME_MAX_LENGTH}
              onChange={(e) => setWalletName(sanitizeAccountNameInput(e.target.value))}
              placeholder="e.g. Main Account"
              className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs font-bold text-indigo-400 focus:border-indigo-500 outline-none transition-all shadow-lg"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between ml-1">
              <span className="text-[10px] font-extrabold text-slate-600 uppercase">
                Secret Phrase
              </span>
              {!isEditingParagraph && currentWords.length >= 12 && (
                <button
                  onClick={() => setIsEditingParagraph(true)}
                  className="text-indigo-500 font-bold text-[10px] uppercase tracking-widest hover:text-indigo-400 transition-colors"
                >
                  Edit Phrase
                </button>
              )}
            </div>

            {isEditingParagraph ? (
              <div className="relative">
                <textarea
                  value={phrase}
                  onChange={(e) => setPhrase(e.target.value)}
                  onKeyDown={handlePhraseKeyDown}
                  maxLength={250}
                  placeholder="Paste or type your recovery phrase here..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-4 text-xs font-bold text-indigo-400 focus:border-indigo-500 outline-none transition-all shadow-lg min-h-[140px] resize-none"
                />
                <button
                  type="button"
                  onClick={handlePaste}
                  className="absolute bottom-3 right-3 text-indigo-500 font-bold text-[10px] uppercase tracking-widest hover:text-indigo-400 px-3 py-1.5 bg-indigo-500/10 rounded-lg border border-indigo-500/20 active:scale-95 transition-all"
                >
                  Paste
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {currentWords.map((word, index) => (
                  <div key={index} className="space-y-1.5">
                    <span className="text-[10px] font-extrabold text-slate-600 uppercase ml-1">
                      Word {index + 1}
                    </span>
                    <input
                      type="text"
                      value={word}
                      readOnly
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs font-bold text-indigo-400 focus:border-indigo-500 outline-none transition-all shadow-lg cursor-default opacity-80"
                    />
                  </div>
                ))}
              </div>
            )}

            {isEditingParagraph && (
              <p className="text-[10px] text-slate-500 font-medium px-1 italic">
                Typically 12 (sometimes 18, 24) words separated by single spaces
              </p>
            )}
          </div>
        </div>

        <button
          type="submit"
          disabled={!isComplete || loading}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-900 disabled:text-slate-600 disabled:border disabled:border-slate-800 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-indigo-600/30 disabled:shadow-none mt-4 active:scale-[0.98]"
        >
          {loading ? "Restoring Account..." : "Restore Account"}
        </button>
      </form>
    </motion.div>
  );
}
