import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { isAxiosError } from "axios";
import { AuthLayout } from "../../components/auth/AuthLayout";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Alert";
import { Squiggle } from "../../components/ui/Squiggle";
import { Spinner } from "../../components/ui/Spinner";
import { CheckCircle2 } from "lucide-react";

const RESEND_COOLDOWN_SECONDS = 60;

type Status = "waiting" | "confirming" | "confirmed" | "failed";

/**
 * Pure confirm-link flow - no code to type anywhere. Registering (or a login attempt on an
 * unconfirmed account) lands here in "waiting" state with just an email address (router state).
 * Clicking the link in the actual email brings the visitor BACK here as a fresh page load with
 * ?email=&code= in the URL (the code is real, generated server-side, but it's an implementation
 * detail now - nothing in the UI ever asks a human to read or type it), which auto-confirms on
 * mount with no button to click.
 */
export default function VerifyEmailPage() {
  const { t } = useTranslation();
  const { user, verifyEmail, resendVerification } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const routeState = location.state as { email?: string; devVerificationCode?: string } | null;
  const urlEmail = searchParams.get("email");
  const urlCode = searchParams.get("code");
  const email = routeState?.email ?? urlEmail ?? "";

  const [status, setStatus] = useState<Status>("waiting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  const [devCode, setDevCode] = useState(routeState?.devVerificationCode ?? null);
  // Tracks which code has already been (or is being) confirmed - keyed on the code value itself,
  // not a plain mount-once boolean, so this correctly reacts to a NEW ?code= arriving via
  // client-side navigation (the dev "tap to confirm" link, or clicking a second email's link
  // without a full page reload) while still deduping React StrictMode's double-invoke in dev.
  const confirmedFor = useRef<string | null>(null);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (urlEmail && urlCode && confirmedFor.current !== urlCode) {
      confirmedFor.current = urlCode;
      confirm(urlEmail, urlCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlEmail, urlCode]);

  if (user) return <Navigate to="/" replace />;

  async function confirm(targetEmail: string, code: string) {
    setStatus("confirming");
    setErrorMessage(null);
    try {
      await verifyEmail(targetEmail, code);
      setStatus("confirmed");
    } catch (err) {
      const code = isAxiosError(err) ? err.response?.data?.code : null;
      if (code === "VERIFICATION_CODE_LOCKED") setErrorMessage(t("verifyEmail.codeLocked"));
      else if (code === "VERIFICATION_CODE_INVALID") setErrorMessage(t("verifyEmail.invalidCode"));
      else setErrorMessage(t("common.somethingWentWrong"));
      setStatus("failed");
    }
  }

  async function onResend() {
    if (!email || resendCooldown > 0) return;
    setResendMessage(null);
    setResending(true);
    try {
      const newDevCode = await resendVerification(email);
      setDevCode(newDevCode ?? null);
      setResendMessage(t("verifyEmail.resendSuccess"));
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch {
      setResendMessage(t("common.somethingWentWrong"));
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthLayout>
      <div className="mb-7">
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-xl">✉️</div>
        <h1 className="relative inline-block pb-1">
          <span style={{ fontFamily: "var(--font-script)" }} className="text-3xl font-bold text-sky-500">
            {t("verifyEmail.title")}
          </span>
          <Squiggle className="text-sky-300" />
        </h1>
      </div>

      {status === "confirming" && (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <Spinner className="h-8 w-8 text-sky-500" />
          <p className="text-sm text-slate-500">{t("verifyEmail.confirming")}</p>
        </div>
      )}

      {status === "confirmed" && (
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-2 py-2 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" strokeWidth={1.5} aria-hidden />
            <Alert variant="success">{t("verifyEmail.success")}</Alert>
          </div>
          <Button fullWidth onClick={() => navigate("/login", { replace: true })}>
            {t("verifyEmail.goToLogin")}
          </Button>
        </div>
      )}

      {status === "failed" && (
        <div className="space-y-4">
          {errorMessage && <Alert variant="danger">{errorMessage}</Alert>}
          {email && (
            <p className="text-center text-sm text-slate-500">
              {t("verifyEmail.waitingSubtitle")} <span className="font-medium text-slate-700">{email}</span>
            </p>
          )}
          <Button fullWidth onClick={onResend} disabled={resending || resendCooldown > 0 || !email}>
            {resendCooldown > 0 ? t("verifyEmail.resendCooldown", { seconds: resendCooldown }) : t("verifyEmail.resend")}
          </Button>
          {resendMessage && <Alert variant="success">{resendMessage}</Alert>}
          <p className="text-center text-sm text-slate-500">
            <Link to="/login" className="font-medium text-sky-600 hover:underline">
              {t("verifyEmail.backToLogin")}
            </Link>
          </p>
        </div>
      )}

      {status === "waiting" && (
        <div className="space-y-4">
          <p className="text-base text-slate-600">
            {email ? (
              <>
                {t("verifyEmail.waitingSubtitle")} <span className="font-semibold text-slate-800">{email}</span>
              </>
            ) : (
              t("verifyEmail.waitingSubtitleGeneric")
            )}
          </p>
          <p style={{ fontFamily: "var(--font-script-2)" }} className="text-base text-slate-500">
            {t("verifyEmail.waitingBody")}
          </p>

          {devCode && email && (
            <Link
              to={`/verify-email?email=${encodeURIComponent(email)}&code=${devCode}`}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-dashed border-amber-300 bg-amber-50/70 px-4 py-3 text-start transition-colors hover:bg-amber-50"
            >
              <span className="text-xs leading-snug text-amber-800">
                <span className="block font-semibold">{t("verifyEmail.devModeTitle")}</span>
                {t("verifyEmail.devModeHint")}
              </span>
              <span className="ltr-nums shrink-0 rounded-lg bg-amber-100 px-2.5 py-1 text-base font-bold tracking-widest text-amber-800">
                {devCode}
              </span>
            </Link>
          )}

          <Button variant="outline" fullWidth onClick={onResend} disabled={resending || resendCooldown > 0 || !email}>
            {resendCooldown > 0 ? t("verifyEmail.resendCooldown", { seconds: resendCooldown }) : t("verifyEmail.resend")}
          </Button>
          {resendMessage && <Alert variant="success">{resendMessage}</Alert>}

          <p className="text-center text-sm text-slate-500">
            <Link to="/login" className="font-medium text-sky-600 hover:underline">
              {t("verifyEmail.backToLogin")}
            </Link>
          </p>
        </div>
      )}
    </AuthLayout>
  );
}
