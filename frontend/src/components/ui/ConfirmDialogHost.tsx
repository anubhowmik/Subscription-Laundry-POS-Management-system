import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { useConfirmStore } from "../../stores/confirmStore";
import { Modal } from "./Modal";
import { Button } from "./Button";

/** Mounted once at the app root (see App.tsx). Renders whatever confirmAction() last requested. */
export function ConfirmDialogHost() {
  const { t } = useTranslation();
  const { isOpen, title, message, confirmLabel, cancelLabel, danger, resolve } = useConfirmStore();

  if (!isOpen) return null;

  function settle(value: boolean) {
    resolve?.(value);
    useConfirmStore.setState({ isOpen: false, resolve: null });
  }

  return (
    <Modal
      title={
        <span className="flex items-center gap-2">
          {danger && <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" strokeWidth={2} aria-hidden />}
          {title ?? (danger ? t("common.confirmDangerTitle") : t("common.confirmTitle"))}
        </span>
      }
      onClose={() => settle(false)}
      size="sm"
      footer={
        <>
          <Button variant="outline" fullWidth onClick={() => settle(false)}>
            {cancelLabel ?? t("common.cancel")}
          </Button>
          <Button variant={danger ? "danger" : "primary"} fullWidth onClick={() => settle(true)} autoFocus>
            {confirmLabel ?? t("common.confirm")}
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-600">{message}</p>
    </Modal>
  );
}
