import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { isAxiosError } from "axios";
import { api } from "../../api/client";

const schema = z.object({
  currentPassword: z.string().min(1, "Required"),
  newPassword: z.string().min(8, "Min 8 characters"),
});
type FormValues = z.infer<typeof schema>;

export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => api.post("/auth/change-password", values),
    onSuccess: () => {
      setSuccess(true);
      setServerError(null);
    },
    onError: (err) => {
      setServerError(
        isAxiosError(err) ? err.response?.data?.message ?? "Something went wrong" : "Something went wrong",
      );
    },
  });

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">Change password</h2>

        {success ? (
          <>
            <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
              Password changed. You&apos;ll need it next time you log in.
            </p>
            <button onClick={onClose} className="mt-4 w-full rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white">
              Close
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Current password</label>
              <input type="password" {...register("currentPassword")} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              {errors.currentPassword && <p className="mt-1 text-xs text-red-600">{errors.currentPassword.message}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">New password</label>
              <input type="password" {...register("newPassword")} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              {errors.newPassword && <p className="mt-1 text-xs text-red-600">{errors.newPassword.message}</p>}
            </div>

            {serverError && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{serverError}</p>}

            <div className="flex gap-2 pt-2">
              <button type="button" onClick={onClose} className="flex-1 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
              >
                Save
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
