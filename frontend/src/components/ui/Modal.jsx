import { useEffect } from 'react'
import { X } from 'lucide-react'

export function Modal({
  open,
  isOpen,
  onClose,
  title,
  description,
  children,
  size = 'md',
  maxWidth,
}) {
  const visible = Boolean(open ?? isOpen)

  useEffect(() => {
    if (!visible) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible, onClose])

  if (!visible) return null

  const sizeMap = {
    sm: 'max-w-md',
    md: 'max-w-xl',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }
  const widthClass = maxWidth || sizeMap[size] || 'max-w-xl'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#172131]/75 p-2.5 sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={`my-auto w-full ${widthClass} overflow-hidden rounded-xl border border-[#E5E8E3] bg-[#FFFFFF] text-[#172131] shadow-2xl`}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#E5E8E3] bg-[#253247] px-4 py-3 text-[#F1F3F5] sm:px-5 sm:py-3.5">
          <div className="min-w-0 flex-1">
            <h3 className="text-[14px] font-semibold break-words text-[#FFFFFF]">
              {title}
            </h3>
            {description && (
              <p className="mt-0.5 text-[11px] break-words text-[#AEB8C7]">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1 text-[#AEB8C7] hover:bg-[#3C485B] hover:text-[#FFFFFF]"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[calc(100dvh-5.5rem)] overflow-y-auto p-4 sm:max-h-[82dvh] sm:p-5">
          {children}
        </div>
      </div>
    </div>
  )
}

export default Modal
