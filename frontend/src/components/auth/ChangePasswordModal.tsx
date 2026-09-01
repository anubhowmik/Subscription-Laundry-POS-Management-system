import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { isAxiosError } from "axios";
import { api } from "../../api/client";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Alert } from "../ui/Alert";
import { inputClass, labelClass, errorTextClass } from "../ui/formClasses";

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
    <Modal title="Change password" onClose={onClose} size="sm">
      {success ? (
        <>
          <Alert variant="success">Password changed. You&apos;ll need it next time you log in.</Alert>
          <Button fullWidth className="mt-4" onClick={onClose}>
            Close
          </Button>
        </>
      ) : (
        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
          <div>
            <label className={labelClass}>Current password</label>
            <input type="password" {...register("currentPassword")} className={inputClass} autoFocus />
            {errors.currentPassword && <p className={errorTextClass}>{errors.currentPassword.message}</p>}
          </div>
          <div>
            <label className={labelClass}>New password</label>
            <input type="password" {...register("newPassword")} className={inputClass} />
            {errors.newPassword && <p className={errorTextClass}>{errors.newPassword.message}</p>}
          </div>

          {serverError && <Alert variant="danger">{serverError}</Alert>}

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" fullWidth onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" fullWidth disabled={isSubmitting}>
              Save
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
