import * as AlertDialog from "@radix-ui/react-alert-dialog";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Accessible confirmation dialog (Radix AlertDialog — focus trap, Escape
 * handling and ARIA semantics included). Use for all destructive actions.
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[9998]" />
        <AlertDialog.Content
          role="dialog"
          aria-modal="true"
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[9999] w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 p-6"
        >
          <AlertDialog.Title className="text-lg font-bold text-slate-800 mb-2">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="text-sm text-slate-500 mb-6">
            {description}
          </AlertDialog.Description>
          <div className="flex justify-end gap-3">
            <AlertDialog.Cancel asChild>
              <button
                onClick={onCancel}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                onClick={onConfirm}
                className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors"
              >
                {confirmLabel}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
