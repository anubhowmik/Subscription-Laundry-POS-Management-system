import { useState } from "react";
import { useForm } from "react-hook-form";
import { Navigate, useNavigate } from "react-router-dom";
import { isAxiosError } from "axios";
import { usePlatformAuth } from "../../contexts/PlatformAuthContext";

interface FormValues {
  usernameOrEmail: string;
  password: string;
}

export default function PlatformLoginPage() {
  const { admin, login, loading } = usePlatformAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FormValues>();

  if (loading) return null;
  if (admin) return <Navigate to="/platform" replace />;

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      await login(values.usernameOrEmail, values.password);
      navigate("/platform", { replace: true });
    } catch (err) {
      setServerError(
        isAxiosError(err) && err.response?.status === 401
          ? "Invalid username or password"
          : "Something went wrong",
      );
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800 text-2xl">🛡️</div>
          <h1 className="text-lg font-semibold text-white">Platform Console</h1>
          <p className="mt-1 text-sm text-slate-400">Operator access only</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">Username or Email</label>
            <input
              {...register("usernameOrEmail", { required: true })}
              autoFocus
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">Password</label>
            <input
              type="password"
              {...register("password", { required: true })}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>

          {serverError && <p className="rounded-lg border border-red-900 bg-red-950 px-3.5 py-2.5 text-sm text-red-300">{serverError}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full cursor-pointer rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Sign In
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          This is not the company login. Companies sign in at <span className="text-slate-400">/login</span>.
        </p>
      </div>
    </div>
  );
}
