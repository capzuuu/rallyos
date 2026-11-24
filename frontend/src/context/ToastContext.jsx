import { useCallback, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { ToastContext } from './contexts'

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const pushToast = useCallback(
    ({ title, message, type = 'info', duration = 3500 }) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      setToasts((prev) => [...prev, { id, title, message, type }])
      if (duration > 0) {
        setTimeout(() => dismiss(id), duration)
      }
    },
    [dismiss]
  )

  const toast = useMemo(
    () => ({
      showToast: pushToast,
      pushToast,
      success: (message, title = 'Updated') =>
        pushToast({ title, message, type: 'success' }),
      error: (message, title = 'Conflict / Error') =>
        pushToast({ title, message, type: 'error', duration: 5000 }),
      info: (message, title = 'RallyOS') =>
        pushToast({ title, message, type: 'info' }),
      warning: (message, title = 'Notice') =>
        pushToast({ title, message, type: 'warning' }),
    }),
    [pushToast]
  )

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed inset-x-3 bottom-3 z-50 flex flex-col gap-2 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-full sm:max-w-xs">
        {toasts.map((item) => {
          const Icon =
            item.type === 'success'
              ? CheckCircle2
              : item.type === 'error' || item.type === 'warning'
                ? AlertCircle
                : Info

          const accentColor =
            item.type === 'success'
              ? 'text-[#A6D957]'
              : item.type === 'error'
                ? 'text-[#E76B72]'
                : item.type === 'warning'
                  ? 'text-[#F3C969]'
                  : 'text-[#D7F66B]'

          return (
            <div
              key={item.id}
              className="pointer-events-auto flex items-start gap-2.5 rounded-xl border border-[#3C485B] bg-[#172131] px-3.5 py-3 text-[#F1F3F5] shadow-xl"
            >
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${accentColor}`} />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold text-[#FFFFFF]">
                  {item.title}
                </p>
                <p className="mt-0.5 text-[11px] text-[#AEB8C7]">
                  {item.message}
                </p>
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="rounded p-0.5 text-[#AEB8C7] hover:text-[#FFFFFF]"
                aria-label="Close notification"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
