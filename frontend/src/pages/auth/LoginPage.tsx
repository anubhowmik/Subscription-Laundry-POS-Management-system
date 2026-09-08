import { useState } from "react";
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
  usernameOrEmail: z.string().min(1),
  password: z.string().min(1),
});
type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const { t } = useTranslation();
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  if (user) {
    const redirectTo = (location.state as { from?: string } | null)?.from ?? "/";
    return <Navigate to={redirectTo} replace />;
  }

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      await login(values.usernameOrEmail, values.password);
      navigate("/", { replace: true });
    } catch (err) {
      if (isAxiosError(err) && err.response?.data?.code === "EMAIL_NOT_VERIFIED") {
        // Only pass this through as "the email" if it actually looks like one - this field
        // accepts a username too, and showing "we sent a link to <username>" on the next page
        // would be both wrong and useless for the resend button (which looks up by email).
        const maybeEmail = values.usernameOrEmail.includes("@") ? values.usernameOrEmail : undefined;
        navigate("/verify-email", { state: { email: maybeEmail } });
      } else if (isAxiosError(err) && err.response?.status === 401) {
        setServerError(t("auth.invalidCredentials"));
      } else {
        setServerError(t("common.somethingWentWrong"));
      }
    }
  }

  return (
    <AuthLayout>
      <div className="mb-7">
        <h1 className="relative inline-block pb-1">
          <span style={{ fontFamily: "var(--font-script)" }} className="text-3xl font-bold text-sky-500">
            {t("auth.welcomeBack")}
          </span>
          <Squiggle className="text-sky-300" />
        </h1>
        <p style={{ fontFamily: "var(--font-script-2)" }} className="mt-2 text-base text-slate-500">
          {t("auth.signInToContinue")}
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className={labelClass}>{t("auth.username")}</label>
          <input {...register("usernameOrEmail")} className={inputClass} autoFocus />
          {errors.usernameOrEmail && <p className={errorTextClass}>{t("validation.required")}</p>}
        </div>
        <div>
          <label className={labelClass}>{t("auth.password")}</label>
          <input type="password" {...register("password")} className={inputClass} />
          {errors.password && <p className={errorTextClass}>{t("validation.required")}</p>}
        </div>

        {serverError && <Alert variant="danger">{serverError}</Alert>}

        <Button type="submit" fullWidth disabled={isSubmitting}>
          {t("auth.signIn")}
        </Button>

        <p className="text-center text-sm text-slate-500">
          {t("auth.noAccount")}{" "}
          <Link to="/register" className="font-medium text-sky-600 hover:underline">
            {t("auth.registerCompany")}
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
