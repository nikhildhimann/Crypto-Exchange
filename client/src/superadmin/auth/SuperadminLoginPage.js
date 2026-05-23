import { useMemo, useState, useTransition } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AlertCircle, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router";
import { loginSuperadminThunk } from "../store/authSlice";
import { selectSuperadminError, selectSuperadminStatus } from "../store/selectors";

const SUPERADMIN_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUPERADMIN_PASSWORD_MIN_LENGTH = 8;
const SUPERADMIN_PASSWORD_MAX_LENGTH = 100;

function validateForm({ email, password }) {
  const errors = {};

  if (!String(email || "").trim()) {
    errors.email = "Email is required";
  } else if (!SUPERADMIN_EMAIL_PATTERN.test(String(email).trim())) {
    errors.email = "Enter a valid email address";
  }

  if (!String(password || "")) {
    errors.password = "Password is required";
  } else if (String(password).length < SUPERADMIN_PASSWORD_MIN_LENGTH) {
    errors.password = `Password must be at least ${SUPERADMIN_PASSWORD_MIN_LENGTH} characters`;
  } else if (String(password).length > SUPERADMIN_PASSWORD_MAX_LENGTH) {
    errors.password = `Password must be at most ${SUPERADMIN_PASSWORD_MAX_LENGTH} characters`;
  }

  return errors;
}

function resolveLoginErrorMessage(error) {
  const payload = error?.payload && typeof error.payload === "object" ? error.payload : null;
  const rawMessage =
    typeof error === "string"
      ? error
      : typeof error?.message === "string"
        ? error.message
        : typeof payload?.message === "string"
          ? payload.message
        : "";
  const status = Number(error?.status || 0);
  const message = rawMessage.toLowerCase();

  if (status === 401) {
    return "Invalid superadmin email or password.";
  }

  if (
    status === 403 &&
    (message.includes("maximum concurrent sessions") || message.includes("session"))
  ) {
    return rawMessage;
  }

  if (status === 403) {
    return rawMessage || "Access denied for this superadmin account.";
  }

  if (status >= 400 && rawMessage) {
    return rawMessage;
  }

  if (
    status === 0 ||
    message.includes("timed out") ||
    message.includes("unable to reach") ||
    message.includes("failed to fetch") ||
    message.includes("network")
  ) {
    return "Unable to reach the server. Check the API URL, server status, and CORS settings.";
  }

  return rawMessage || "Unable to sign in right now. Please try again.";
}

export function SuperadminLoginPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const status = useSelector(selectSuperadminStatus);
  const error = useSelector(selectSuperadminError);
  const [isRouting, startTransition] = useTransition();
  const [form, setForm] = useState({
    email: "",
    password: "",
  });
  const [validationErrors, setValidationErrors] = useState({});
  const [submitError, setSubmitError] = useState("");

  const isSubmitting = status === "loading" || isRouting;
  const helperMessage = useMemo(
    () => submitError || error || "",
    [error, submitError],
  );

  async function handleSubmit(event) {
    event.preventDefault();
    const nextValidationErrors = validateForm(form);
    setValidationErrors(nextValidationErrors);
    setSubmitError("");

    if (Object.keys(nextValidationErrors).length > 0) {
      return;
    }

    try {
      await dispatch(
        loginSuperadminThunk({
          email: form.email.trim(),
          password: form.password,
          deviceLabel: "Crypto Wallet Superadmin Web",
          platform:
            typeof navigator !== "undefined"
              ? navigator.userAgentData?.platform || navigator.platform || "web"
              : "web",
          appVersion: import.meta.env.VITE_APP_VERSION || "web",
        }),
      ).unwrap();
      startTransition(() => {
        navigate("/superadmin", { replace: true });
      });
    } catch (submitError) {
      setSubmitError(resolveLoginErrorMessage(submitError));
    }
  }

  return (
    <div className="fixed inset-0 z-[120] overflow-y-auto bg-slate-950 text-slate-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(15,23,42,0.92),rgba(2,6,23,1))]" />
      <div className="relative flex min-h-full items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-slate-900/88 p-6 shadow-[0_24px_80px_rgba(2,6,23,0.58)] backdrop-blur-xl sm:p-8">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
              Superadmin
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Sign in
            </h1>
            <p className="text-sm leading-6 text-slate-400">
              Use your provisioned operator credentials.
            </p>
          </div>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300" htmlFor="superadmin-email">
                Email
              </label>
              <input
                id="superadmin-email"
                type="email"
                autoComplete="username"
                maxLength={255}
                value={form.email}
                onChange={(event) => {
                  setForm((current) => ({ ...current, email: event.target.value }));
                  setValidationErrors((current) => ({ ...current, email: "" }));
                }}
                className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3.5 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/35 focus-visible:ring-2 focus-visible:ring-cyan-300/20"
                placeholder="admin@company.com"
              />
              {validationErrors.email ? (
                <p className="text-sm text-rose-300">{validationErrors.email}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300" htmlFor="superadmin-password">
                Password
              </label>
              <input
                id="superadmin-password"
                type="password"
                autoComplete="current-password"
                minLength={SUPERADMIN_PASSWORD_MIN_LENGTH}
                maxLength={SUPERADMIN_PASSWORD_MAX_LENGTH}
                value={form.password}
                onChange={(event) => {
                  setForm((current) => ({ ...current, password: event.target.value }));
                  setValidationErrors((current) => ({ ...current, password: "" }));
                }}
                className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3.5 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/35 focus-visible:ring-2 focus-visible:ring-cyan-300/20"
                placeholder="Enter your password"
              />
              {validationErrors.password ? (
                <p className="text-sm text-rose-300">{validationErrors.password}</p>
              ) : null}
            </div>

            {helperMessage ? (
              <div className="flex items-start gap-3 rounded-2xl border border-rose-300/15 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                <AlertCircle className="mt-0.5 h-4.5 w-4.5 shrink-0" />
                <span>{helperMessage}</span>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-500/12 px-4 py-3.5 text-sm font-medium text-cyan-50 transition hover:bg-cyan-500/18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/30 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? "Signing in..." : "Sign in"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
