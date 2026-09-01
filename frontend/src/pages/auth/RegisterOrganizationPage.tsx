import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { isAxiosError } from "axios";
import { AuthLayout } from "../../components/auth/AuthLayout";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Alert";
import { Squiggle } from "../../components/ui/Squiggle";
import { inputClass, labelClass, errorTextClass, helperTextClass } from "../../components/ui/formClasses";

const saudiPhoneRegex = /^(?:\+?966|0)5\d{8}$/;

const schema = z.object({
  organizationNameEn: z.string().min(1, "required"),
  organizationNameAr: z.string().min(1, "required"),
  branchName: z.string().optional(),
  adminUsername: z.string().min(3, "usernameLength"),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8, "passwordLength"),
  adminFullNameEn: z.string().min(1, "required"),
  adminFullNameAr: z.string().optional(),
  adminPhone: z.union([z.string().regex(saudiPhoneRegex, "invalidPhone"), z.literal("")]).optional(),
});
type FormValues = z.infer<typeof schema>;

export default function RegisterOrganizationPage() {
  const { t } = useTranslation();
  const { user, registerOrganization } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      await registerOrganization({
        ...values,
        branchName: values.branchName || undefined,
        adminFullNameAr: values.adminFullNameAr || undefined,
        adminPhone: values.adminPhone || undefined,
      });
      // Not auto-logged-in - a verification code has already been emailed to adminEmail.
      navigate("/verify-email", { state: { email: values.adminEmail }, replace: true });
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 409) {
        const message = String(err.response.data?.message ?? "");
        if (message.toLowerCase().includes("username")) setServerError(t("register.usernameTaken"));
        else if (message.toLowerCase().includes("email")) setServerError(t("register.emailTaken"));
        else setServerError(message);
      } else if (isAxiosError(err) && err.response?.status === 400) {
        setServerError(err.response.data?.errors?.[0]?.message ?? t("common.somethingWentWrong"));
      } else {
        setServerError(t("common.somethingWentWrong"));
      }
    }
  }

  return (
    <AuthLayout cardClassName="max-w-lg">
      <div className="mb-7">
        <h1 className="relative inline-block pb-1">
          <span style={{ fontFamily: "var(--font-script)" }} className="text-3xl font-bold text-sky-500">
            {t("register.title")}
          </span>
          <Squiggle className="text-sky-300" />
        </h1>
        <p style={{ fontFamily: "var(--font-script-2)" }} className="mt-2 text-base text-slate-500">
          {t("register.subtitle")}
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t("register.companyInfo")}
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t("register.organizationNameEn")} error={errors.organizationNameEn}>
                <input {...register("organizationNameEn")} className={inputClass} autoFocus />
              </Field>
              <Field label={t("register.organizationNameAr")} error={errors.organizationNameAr}>
                <input {...register("organizationNameAr")} dir="rtl" className={inputClass} />
              </Field>
            </div>
            <div className="mt-4">
              <Field label={t("register.branchName")} error={errors.branchName} hint={t("register.branchNameHint")}>
                <input {...register("branchName")} className={inputClass} />
              </Field>
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t("register.adminInfo")}
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t("register.adminFullNameEn")} error={errors.adminFullNameEn}>
                <input {...register("adminFullNameEn")} className={inputClass} />
              </Field>
              <Field label={t("register.adminFullNameAr")} error={errors.adminFullNameAr}>
                <input {...register("adminFullNameAr")} dir="rtl" className={inputClass} />
              </Field>
              <Field label={t("register.adminUsername")} error={errors.adminUsername}>
                <input {...register("adminUsername")} className={inputClass} />
              </Field>
              <Field label={t("register.adminEmail")} error={errors.adminEmail}>
                <input type="email" {...register("adminEmail")} className={inputClass} />
              </Field>
              <Field label={t("register.adminPassword")} error={errors.adminPassword}>
                <input type="password" {...register("adminPassword")} className={inputClass} />
              </Field>
              <Field label={t("register.adminPhone")} error={errors.adminPhone}>
                <input {...register("adminPhone")} placeholder="05XXXXXXXX" className={inputClass} />
              </Field>
            </div>
          </div>

          {serverError && <Alert variant="danger">{serverError}</Alert>}

          <Button type="submit" fullWidth disabled={isSubmitting}>
            {t("register.submit")}
          </Button>

          <p className="text-center text-sm text-slate-500">
            {t("auth.alreadyHaveAccount")}{" "}
            <Link to="/login" className="font-medium text-sky-600 hover:underline">
              {t("auth.signIn")}
            </Link>
          </p>
        </form>
    </AuthLayout>
  );
}

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: { message?: string };
  hint?: string;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <label className={labelClass}>{label}</label>
      {children}
      {hint && !error && <p className={helperTextClass}>{hint}</p>}
      {error && (
        <p className={errorTextClass}>
          {error.message === "invalidPhone" ? t("validation.invalidPhone") : t("validation.required")}
        </p>
      )}
    </div>
  );
}
