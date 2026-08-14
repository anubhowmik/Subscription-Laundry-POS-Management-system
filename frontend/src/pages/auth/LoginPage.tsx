import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { isAxiosError } from "axios";

const schema = z.object({
  usernameOrEmail: z.string().min(1),
  password: z.string().min(1),
});
type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const { t, i18n } = useTranslation();
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
      if (isAxiosError(err) && err.response?.status === 401) {
        setServerError(t("auth.invalidCredentials"));
      } else {
        setServerError(t("common.somethingWentWrong"));
      }
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <button
        onClick={() => i18n.changeLanguage(i18n.resolvedLanguage === "ar" ? "en" : "ar")}
        className="absolute end-4 top-4 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700"
      >
        {i18n.resolvedLanguage === "ar" ? "English" : "العربية"}
      </button>

      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mb-2 text-3xl">🧼</div>
          <h1 className="text-lg font-semibold text-slate-800">{t("app.name")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("auth.signInToContinue")}</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t("auth.username")}</label>
            <input
              {...register("usernameOrEmail")}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              autoFocus
            />
            {errors.usernameOrEmail && <p className="mt-1 text-xs text-red-600">{t("validation.required")}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t("auth.password")}</label>
            <input
              type="password"
              {...register("password")}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            {errors.password && <p className="mt-1 text-xs text-red-600">{t("validation.required")}</p>}
          </div>

          {serverError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
          >
            {t("auth.signIn")}
          </button>

          <p className="text-center text-sm text-slate-500">
            {t("auth.noAccount")}{" "}
            <Link to="/register" className="font-medium text-sky-600 hover:underline">
              {t("auth.registerCompany")}
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
