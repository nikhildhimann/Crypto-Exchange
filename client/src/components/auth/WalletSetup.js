import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { ArrowLeft, Copy, CheckCircle2, ShieldAlert, X } from "lucide-react";
import { motion } from "motion/react";

import { useAppContext } from "../../contexts/AppContext";
import {
  clearPendingAccountSetup,
  clearSetupIntent,
  readPendingAccountSetup,
  readSetupIntent,
  writePendingAccountSetup,
} from "../../lib/accountSetupFlow";
import { copyTextToClipboard } from "../../lib/clipboard";
import { getErrorMessage } from "../../lib/errorMessage";
import {
  resolveExplicitProvisioningTarget,
  resolveProvisioningTarget,
} from "../../lib/walletProvisioning";
import { buildPrimaryProvisioningTargets } from "../../lib/walletProvisioningScope";

// In-flight guard: prevents double-generating a mnemonic on the same page within the same session.
const mnemonicGenerateInFlight = new Map();

function shuffle(items = []) {
  const nextItems = [...items];

  for (let index = nextItems.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [nextItems[index], nextItems[swapIndex]] = [nextItems[swapIndex], nextItems[index]];
  }

  return nextItems;
}

function buildWalletLabel() {
  return "Main Wallet";
}

function buildVerificationPrompts(words = [], count = 3) {
  const phraseWords = words.filter(Boolean);
  if (!phraseWords.length) {
    return [];
  }

  const indices = shuffle(
    Array.from({ length: phraseWords.length }, (_, i) => i)
  )
    .slice(0, count)
    .sort((a, b) => a - b);

  return indices.map((targetIndex) => {
    const correctWord = phraseWords[targetIndex];

    const distractors = shuffle(
      Array.from(
        new Set(
          phraseWords.filter(
            (word, wordIndex) => wordIndex !== targetIndex && word !== correctWord
          )
        )
      )
    ).slice(0, 5);

    return {
      index: targetIndex,
      correctWord,
      options: shuffle([correctWord, ...distractors]),
    };
  });
}

/**
 * Determines the deterministic back/cancel destination.
 * /app/account/* routes always go back to /app/home.
 * /app/account/restore/* routes also go to /app/home.
 * Auth-flow routes use the explicit state.from or fall back to /auth/login.
 */
function resolveBackRoute(locationState, isAppRoute, pathname) {
  const from = locationState?.from;

  if (pathname.startsWith("/app/account/create") || pathname.startsWith("/app/account/restore")) {
    return "/app/home";
  }

  if (typeof from === "string") {
    return from;
  }

  return isAppRoute ? "/app/home" : "/auth/login";
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1: Generate Recovery Phrase (NO backend account creation here)
// ─────────────────────────────────────────────────────────────────────────────
export function WalletSetupSeed() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    generateMnemonic,
    prepareAuthSession,
    selectedNetworkCode,
    supportedChains,
  } = useAppContext();

  const isAppRoute = location.pathname.startsWith("/app/");
  const backRoute = resolveBackRoute(location.state, isAppRoute, location.pathname);
  const confirmRoute = isAppRoute
    ? "/app/account/create/confirm"
    : "/setup/confirm";

  const [authReady, setAuthReady] = useState(false);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [copyError, setCopyError] = useState("");
  const [mnemonic, setMnemonic] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const setupIntent = readSetupIntent();
  const explicitChain =
    typeof location.state?.chain === "string" && location.state.chain.trim()
      ? location.state.chain.trim().toLowerCase()
      : typeof setupIntent?.chain === "string" && setupIntent.chain.trim()
        ? setupIntent.chain.trim().toLowerCase()
        : "";
  const explicitNetwork =
    typeof location.state?.network === "string" && location.state.network.trim()
      ? location.state.network.trim().toLowerCase()
      : typeof setupIntent?.network === "string" && setupIntent.network.trim()
        ? setupIntent.network.trim().toLowerCase()
        : "";

  const availableChains = authReady ? supportedChains : [];
  const primaryTarget = explicitChain
    ? resolveExplicitProvisioningTarget(availableChains, explicitChain, explicitNetwork || selectedNetworkCode)
    : resolveProvisioningTarget(availableChains, selectedNetworkCode);
  const requestPayload = useMemo(
    () => ({
      chain: primaryTarget.chain,
      network: primaryTarget.network,
      label: buildWalletLabel(),
    }),
    [primaryTarget.chain, primaryTarget.network]
  );

  // Prepare auth session silently. No loading spinner — user action hasn't happened yet.
  useEffect(() => {
    let isMounted = true;

    async function prepare() {
      const ready = await prepareAuthSession().catch(() => false);

      if (!isMounted) return;

      setAuthReady(Boolean(ready));

      if (!ready) {
        setError("Unable to prepare account setup. Please try again.");
      }
    }

    prepare();

    return () => {
      isMounted = false;
    };
  }, [prepareAuthSession]);

  // Restore mnemonic from sessionStorage on mount (e.g. after back navigation from confirm).
  // We only restore the mnemonic — there is no accountId in storage yet for create mode.
  useEffect(() => {
    const cached = readPendingAccountSetup();
    if (cached?.mode === "create" && cached?.mnemonic) {
      setMnemonic(cached.mnemonic);
    }
  }, []);

  // Do not clear the setup intent on unmount here. React development remounts
  // can briefly unmount this screen before the route guard re-evaluates, which
  // would erase the just-created setup intent and bounce the first navigation
  // back to login. Explicit cancel/success handlers and the storage TTL already
  // clean up abandoned setup flows safely.

  const handleGenerate = useCallback(async () => {
    if (!authReady) {
      setError("Session is not ready yet. Please wait a moment and try again.");
      return;
    }

    // Already have a mnemonic in memory — don't regenerate.
    if (mnemonic) return;

    // Restore from session storage if still fresh.
    const cached = readPendingAccountSetup();
    if (cached?.mode === "create" && cached?.mnemonic) {
      setMnemonic(cached.mnemonic);
      setError("");
      return;
    }

    const flyKey = `generate:${retryKey}`;

    if (mnemonicGenerateInFlight.has(flyKey)) {
      return;
    }

    const request = (async () => {
      setGenerating(true);
      setError("");

      try {
        const newMnemonic = await generateMnemonic();

        // Store mnemonic ONLY — no accountId, no backend account created.
        writePendingAccountSetup({
          mode: "create",
          mnemonic: newMnemonic,
          chain: requestPayload.chain,
          network: requestPayload.network,
          label: requestPayload.label,
        });

        clearSetupIntent();
        setMnemonic(newMnemonic);
      } catch (err) {
        setMnemonic("");
        setError(getErrorMessage(err, "Failed to generate recovery phrase"));
        // On error, ensure we reset the in-flight key so retry is possible
        mnemonicGenerateInFlight.delete(flyKey);
      } finally {
        setGenerating(false);
        mnemonicGenerateInFlight.delete(flyKey);
      }
    })();

    mnemonicGenerateInFlight.set(flyKey, request);
    await request;
  }, [
    authReady,
    generateMnemonic,
    mnemonic,
    requestPayload.chain,
    requestPayload.network,
    requestPayload.label,
    retryKey,
  ]);

  const handleCopy = async () => {
    if (!mnemonic) return;

    try {
      await copyTextToClipboard(mnemonic);
      setCopyError("");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (requestError) {
      setCopied(false);
      setCopyError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to copy recovery phrase"
      );
    }
  };

  const handleCancel = () => {
    clearPendingAccountSetup();
    clearSetupIntent();
    navigate(backRoute, { replace: true });
  };

  const handleBack = () => {
    // Back from Step 1 goes to the dashboard/auth entry — same as cancel.
    // We keep the pending mnemonic in session storage so a user who goes back
    // and returns again doesn't have to regenerate.
    navigate(backRoute, { replace: true });
  };

  const hasSeed = Boolean(mnemonic);
  const phraseWords = hasSeed ? mnemonic.split(" ").filter(Boolean) : [];

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="setup-screen"
    >
      <header className="setup-header">
        <button
          onClick={handleBack}
          className="p-2 -ml-2 text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={24} />
        </button>
        <span className="setup-header-title">Create Account</span>
        <button
          onClick={handleCancel}
          className="p-2 -mr-2 text-slate-500 hover:text-white transition-colors"
          aria-label="Cancel and return to dashboard"
        >
          <X size={20} />
        </button>
      </header>

      <main className="setup-inner">
        <div className="setup-content">
          <section className="setup-header-content">
            <h1 className="setup-heading">Recovery Phrase</h1>
            <p className="setup-subtext">
              Write down these 12 words in order. Never share them with anyone.
            </p>
          </section>

          <div className="warning-box">
            <ShieldAlert size={20} className="warning-icon" />
            <p className="warning-text">
              If you lose your recovery phrase, you will lose access to your
              account and funds forever.
            </p>
          </div>

          {error ? (
            <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-rose-300">
                {error}
              </p>
              <button
                type="button"
                onClick={() => {
                  setMnemonic("");
                  setError("");
                  setRetryKey((k) => k + 1);
                  clearPendingAccountSetup();
                }}
                className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-rose-200 hover:text-white transition-colors"
              >
                Retry
              </button>
            </div>
          ) : null}

          {generating ? (
            <div className="seed-grid">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="seed-word-box animate-pulse">
                  <span className="seed-index">{i + 1}.</span>
                  <span className="seed-word text-slate-700">loading</span>
                </div>
              ))}
            </div>
          ) : hasSeed ? (
            <div className="seed-grid">
              {phraseWords.map((word, i) => (
                <div key={i} className="seed-word-box">
                  <span className="seed-index">{i + 1}.</span>
                  <span className="seed-word">{word}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 mt-2">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500 text-center">
                Your recovery phrase will appear here
              </p>
            </div>
          )}

          {hasSeed && (
            <>
              <button
                onClick={handleCopy}
                disabled={!mnemonic}
                className="flex items-center justify-center space-x-2 w-full py-6 text-indigo-400 font-bold hover:text-indigo-300 transition-colors disabled:opacity-40"
              >
                {copied ? (
                  <CheckCircle2 size={18} className="text-emerald-400" />
                ) : (
                  <Copy size={18} />
                )}
                <span className="text-sm uppercase tracking-widest">
                  {copied ? "Copied" : "Copy to Clipboard"}
                </span>
              </button>

              {copyError ? (
                <p className="text-center text-xs font-bold uppercase tracking-[0.18em] text-rose-300">
                  {copyError}
                </p>
              ) : null}
            </>
          )}
        </div>

        <div className="pt-6 pb-8 space-y-3">
          {!hasSeed ? (
            <button
              onClick={handleGenerate}
              disabled={generating || !authReady}
              className="auth-btn-main !rounded-2xl !py-5 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {generating ? "Generating..." : "Generate Recovery Phrase"}
            </button>
          ) : (
            <button
              onClick={() =>
                navigate(confirmRoute, {
                  state: {
                    from: backRoute,
                    // accountId is intentionally absent — created at confirm step
                    mnemonic,
                    chain: requestPayload.chain,
                    network: requestPayload.network,
                    label: buildWalletLabel(),
                  },
                })
              }
              disabled={!hasSeed}
              className="auth-btn-main !rounded-2xl !py-5 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              I&apos;ve Saved It
            </button>
          )}

          <button
            onClick={handleCancel}
            className="w-full py-3 text-xs font-bold uppercase tracking-[0.18em] text-slate-500 hover:text-slate-300 transition-colors"
          >
            Cancel
          </button>
        </div>
      </main>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 + 3: Verify Phrase then Confirm & Finish
// At this point we create the real backend account for the first time.
// ─────────────────────────────────────────────────────────────────────────────
export function WalletSetupConfirm() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    activateAccountScope,
    importAccount,
    importWallet,
    prepareAuthSession,
    rollbackIncompleteAccount,
    bootStatus,
    appAccessState,
    wallets,
  } = useAppContext();

  // Session state comes from location.state (passed by WalletSetupSeed)
  // or falls back to sessionStorage (hard refresh / back-forward cache).
  const sessionState = location.state || readPendingAccountSetup();
  const mnemonic = sessionState?.mnemonic || "";
  const phraseWords = mnemonic.split(" ").filter(Boolean);

  const isAppRoute = location.pathname.startsWith("/app/");
  const backRoute = resolveBackRoute(location.state, isAppRoute, location.pathname);
  const prevStep = isAppRoute ? "/app/account/create" : "/setup/seed";

  const [prompts, setPrompts] = useState(() =>
    buildVerificationPrompts(phraseWords, 3)
  );
  const [selectedWords, setSelectedWords] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [setupSuccess, setSetupSuccess] = useState(false);
  // We might need to roll back a partially created account on wallet import failure
  const createdAccountIdRef = useRef(null);
  const requestLock = useRef(false);

  // Navigate after success, once Redux state has settled.
  useEffect(() => {
    if (!setupSuccess || bootStatus !== "ready") return;

    if (appAccessState === "pin_setup_required") {
      navigate("/unlock/setup-pin", { replace: true });
    } else if (appAccessState === "locked") {
      navigate("/unlock", { replace: true });
    } else if (appAccessState === "unlocked" && wallets.length > 0) {
      navigate("/app/home", { replace: true });
    }
  }, [setupSuccess, appAccessState, bootStatus, navigate, wallets.length]);

  // Guard: redirect back to seed step if we arrive without a mnemonic.
  useEffect(() => {
    if (sessionState?.mode && sessionState.mode !== "create") {
      clearPendingAccountSetup();
      navigate(prevStep, { replace: true });
      return;
    }

    if (!mnemonic) {
      navigate(prevStep, { replace: true });
    }
  }, [mnemonic, navigate, sessionState?.mode, prevStep]);

  useEffect(() => {
    setPrompts(buildVerificationPrompts(phraseWords, 3));
    setSelectedWords({});
  }, [mnemonic]);

  const hasAnsweredAll = prompts.every((p) => selectedWords[p.index]);
  const hasIncorrect = prompts.some(
    (p) => selectedWords[p.index] && selectedWords[p.index] !== p.correctWord
  );

  const handleConfirm = async () => {
    if (!hasAnsweredAll || hasIncorrect || requestLock.current) {
      setError("Select the correct recovery words to continue");
      return;
    }

    requestLock.current = true;
    setLoading(true);
    setError("");

    try {
      const ready = await prepareAuthSession().catch(() => false);

      if (!ready) {
        throw new Error("Unable to prepare account setup");
      }

      // ── Step A: Create the real account with the mnemonic ──────────────────
      // importAccount is the right call here: it accepts a mnemonic, creates
      // an account with that exact seed,  and returns accountId + mnemonic.
      // This is the first and only backend write in the create flow.
      const accountResult = await importAccount({
        mnemonic,
        name: sessionState?.label || buildWalletLabel(),
      });

      const createdAccount = accountResult?.account || null;
      const createdAccountId = createdAccount?.id || "";

      if (!createdAccountId) {
        throw new Error("Account creation failed — no account ID returned");
      }

      createdAccountIdRef.current = createdAccountId;

      // ── Step B: Provision the wallet for that account ──────────────────────
      let wallet;
      try {
        wallet = await importWallet({
          accountId: createdAccountId,
          mnemonic,
          chain: sessionState?.chain || "",
          network: sessionState?.network || "",
          label: sessionState?.label || buildWalletLabel(),
          provisioningTargets: buildPrimaryProvisioningTargets(
            sessionState?.chain || "",
            sessionState?.network || "",
          ),
        });
      } catch (walletErr) {
        // importWallet failed. The account was created but has no wallet.
        // Use the dedicated rollback endpoint — it verifies wallet count is 0
        // before archiving, so it cannot accidentally archive an account that
        // already has funds.
        try {
          await rollbackIncompleteAccount(createdAccountId);
        } catch {
          // Rollback failed. The orphan account has zero wallets and will
          // be cleaned up by archiveIncompleteAccount on the next create attempt.
          // No further client-side action is possible here.
        }

        throw new Error(walletErr?.message || "Failed to provision wallet — please try again");
      }

      // ── Step C: Activate the new account scope in Redux ───────────────────
      await activateAccountScope(createdAccount, {
        requestedWalletId: wallet?.walletId || "",
        reuseLoadedScope: true,
      });

      // ── Step D: Clear setup state ─────────────────────────────────────────
      clearPendingAccountSetup();
      clearSetupIntent();
      createdAccountIdRef.current = null;

      // Hand route control to the effect hook waiting for bootStatus + appAccessState.
      setSetupSuccess(true);
    } catch (err) {
      setError(err?.message || "Failed to complete account setup");
      requestLock.current = false;
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    navigate(prevStep, {
      replace: true,
      state: { from: backRoute },
    });
  };

  const handleCancel = () => {
    clearPendingAccountSetup();
    clearSetupIntent();
    navigate(backRoute, { replace: true });
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="setup-screen"
    >
      <header className="setup-header">
        <button
          onClick={handleBack}
          className="p-2 -ml-2 text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={24} />
        </button>
        <span className="setup-header-title">Verify Account</span>
        <button
          onClick={handleCancel}
          className="p-2 -mr-2 text-slate-500 hover:text-white transition-colors"
          aria-label="Cancel and return to dashboard"
        >
          <X size={20} />
        </button>
      </header>

      <main className="setup-inner">
        <div className="setup-content space-y-6">
          <h1 className="setup-heading">Verify Phrase</h1>

          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-2xl">
              <p className="text-xs font-bold text-rose-300">{error}</p>
            </div>
          )}

          {prompts.map((prompt) => (
            <div key={prompt.index}>
              <p className="text-sm text-slate-400 mb-2">
                Select word {prompt.index + 1}
              </p>

              <div className="grid grid-cols-2 gap-3">
                {prompt.options.map((word) => (
                  <button
                    key={word}
                    onClick={() =>
                      setSelectedWords((prev) => ({
                        ...prev,
                        [prompt.index]: word,
                      }))
                    }
                    className={`p-4 rounded-2xl border ${selectedWords[prompt.index] === word
                      ? "bg-indigo-500/20 border-indigo-500 text-indigo-400"
                      : "bg-slate-900 border-slate-800 text-slate-400"
                      }`}
                  >
                    {word}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="pt-8 pb-8 space-y-3">
          <button
            disabled={!hasAnsweredAll || hasIncorrect || loading}
            onClick={handleConfirm}
            className="auth-btn-main !rounded-2xl !py-5 disabled:opacity-30"
          >
            {loading ? "Creating Account..." : "Confirm & Finish"}
          </button>

          <button
            onClick={handleCancel}
            className="w-full py-3 text-xs font-bold uppercase tracking-[0.18em] text-slate-500 hover:text-slate-300 transition-colors"
          >
            Cancel
          </button>
        </div>
      </main>
    </motion.div>
  );
}
