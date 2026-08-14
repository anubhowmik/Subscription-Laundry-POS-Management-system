import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { isAxiosError } from "axios";

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
  const { t, i18n } = useTranslation();
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
      navigate("/", { replace: true });
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
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <button
        onClick={() => i18n.changeLanguage(i18n.resolvedLanguage === "ar" ? "en" : "ar")}
        className="absolute end-4 top-4 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700"
      >
        {i18n.resolvedLanguage === "ar" ? "English" : "العربية"}
      </button>

      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mb-2 text-3xl">🧼</div>
          <h1 className="text-lg font-semibold text-slate-800">{t("register.title")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("register.subtitle")}</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t("register.companyInfo")}
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t("register.organizationNameEn")} error={errors.organizationNameEn}>
                <input {...register("organizationNameEn")} className={inputClass} autoFocus />
              </Field>
              <Field label={t("register.organizationNameAr")} error={errors.organizationNameAr}>
                <input {...register("organizationNameAr")} dir="rtl" className={inputClass} />
              </Field>
            </div>
            <div className="mt-3">
              <Field label={t("register.branchName")} error={errors.branchName} hint={t("register.branchNameHint")}>
                <input {...register("branchName")} className={inputClass} />
              </Field>
            </div>
          </div>

          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t("register.adminInfo")}
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

          {serverError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
          >
            {t("register.submit")}
          </button>

          <p className="text-center text-sm text-slate-500">
            {t("auth.alreadyHaveAccount")}{" "}
            <Link to="/login" className="font-medium text-sky-600 hover:underline">
              {t("auth.signIn")}
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";

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
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
      {error && (
        <p className="mt-1 text-xs text-red-600">
          {error.message === "invalidPhone" ? t("validation.invalidPhone") : t("validation.required")}
        </p>
      )}
    </div>
  );
}
