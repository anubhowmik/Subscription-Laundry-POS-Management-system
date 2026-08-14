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
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-800 p-8 shadow-xl">
        <div className="mb-6 text-center">
          <div className="mb-2 text-3xl">🛡️</div>
          <h1 className="text-lg font-semibold text-white">Platform Console</h1>
          <p className="mt-1 text-sm text-slate-400">Operator access only</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Username or Email</label>
            <input
              {...register("usernameOrEmail", { required: true })}
              autoFocus
              className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Password</label>
            <input
              type="password"
              {...register("password", { required: true })}
              className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          {serverError && <p className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-300">{serverError}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
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
