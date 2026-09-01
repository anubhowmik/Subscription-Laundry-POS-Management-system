import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { isAxiosError } from "axios";
import { AuthLayout } from "../../components/auth/AuthLayout";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Alert";
import { Squiggle } from "../../components/ui/Squiggle";
import { inputClass, labelClass, errorTextClass } from "../../components/ui/formClasses";

const schema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/, "code"),
});
type FormValues = z.infer<typeof schema>;

const RESEND_COOLDOWN_SECONDS = 60;

export default function VerifyEmailPage() {
  const { t } = useTranslation();
  const { user, verifyEmail, resendVerification } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const prefillEmail = (location.state as { email?: string } | null)?.email ?? "";

  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: prefillEmail } });

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(values: FormValues) {
    setServerError(null);
    setSuccessMessage(null);
    try {
      await verifyEmail(values.email, values.code);
      setVerified(true);
    } catch (err) {
      const code = isAxiosError(err) ? err.response?.data?.code : null;
      if (code === "VERIFICATION_CODE_LOCKED") setServerError(t("verifyEmail.codeLocked"));
      else if (code === "VERIFICATION_CODE_INVALID") setServerError(t("verifyEmail.invalidCode"));
      else setServerError(t("common.somethingWentWrong"));
    }
  }

  async function onResend() {
    const email = getValues("email");
    if (!email || resendCooldown > 0) return;
    setServerError(null);
    setSuccessMessage(null);
    setResending(true);
    try {
      await resendVerification(email);
      setSuccessMessage(t("verifyEmail.resendSuccess"));
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch {
      setServerError(t("common.somethingWentWrong"));
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
        <p style={{ fontFamily: "var(--font-script-2)" }} className="mt-2 text-base text-slate-500">
          {t("verifyEmail.subtitle")}
        </p>
      </div>

      {verified ? (
          <div className="space-y-4">
            <Alert variant="success">{t("verifyEmail.success")}</Alert>
            <Button fullWidth onClick={() => navigate("/login", { replace: true })}>
              {t("verifyEmail.backToLogin")}
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className={labelClass}>{t("verifyEmail.emailLabel")}</label>
              <input type="email" {...register("email")} className={inputClass} autoFocus={!prefillEmail} />
              {errors.email && <p className={errorTextClass}>{t("validation.required")}</p>}
            </div>
            <div>
              <label className={labelClass}>{t("verifyEmail.codeLabel")}</label>
              <input
                {...register("code")}
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                className={`${inputClass} ltr-nums text-center tracking-[0.5em]`}
                autoFocus={Boolean(prefillEmail)}
              />
              {errors.code && <p className={errorTextClass}>{t("validation.required")}</p>}
            </div>

            {serverError && <Alert variant="danger">{serverError}</Alert>}
            {successMessage && !serverError && <Alert variant="success">{successMessage}</Alert>}

            <Button type="submit" fullWidth disabled={isSubmitting}>
              {t("verifyEmail.submit")}
            </Button>

            <button
              type="button"
              onClick={onResend}
              disabled={resending || resendCooldown > 0}
              className="w-full text-center text-sm font-medium text-sky-600 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"
            >
              {resendCooldown > 0 ? t("verifyEmail.resendCooldown", { seconds: resendCooldown }) : t("verifyEmail.resend")}
            </button>

            <p className="text-center text-sm text-slate-500">
              <Link to="/login" className="font-medium text-sky-600 hover:underline">
                {t("verifyEmail.backToLogin")}
              </Link>
            </p>
          </form>
        )}
    </AuthLayout>
  );
}
