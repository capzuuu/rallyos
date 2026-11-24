import { AlertTriangle } from 'lucide-react'
import { Button } from './Button'
import { Modal } from './Modal'

export function ConfirmDialog({
  open,
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmText,
  confirmLabel,
  variant = 'danger',
}) {
  return (
    <Modal
      open={open ?? isOpen}
      onClose={onClose}
      title={title}
      maxWidth="max-w-md"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#E76B72]/20 text-[#E76B72]">
          <AlertTriangle className="h-4 w-4" />
        </div>
        <p className="text-[13px] font-medium text-[#253247]">{message}</p>
      </div>
      <div className="mt-5 flex flex-wrap-reverse justify-end gap-2 border-t border-[#E5E8E3] pt-3.5 sm:flex-nowrap">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button variant={variant} onClick={onConfirm}>
          {confirmLabel || confirmText || 'Confirm'}
        </Button>
      </div>
    </Modal>
  )
}

export default ConfirmDialog
