export function Card({
  children,
  title,
  subtitle,
  action,
  className = '',
  dark = false,
}) {
  return (
    <div
      className={`rounded-xl border ${
        dark
          ? 'border-[#3C485B] bg-[#253247] text-[#F1F3F5]'
          : 'border-[#E5E8E3] bg-[#FFFFFF] text-[#172131]'
      } ${className}`}
    >
      {(title || subtitle || action) && (
        <div
          className={`flex flex-wrap items-center justify-between gap-2.5 border-b px-3.5 py-3 sm:px-4 ${
            dark ? 'border-[#3C485B]' : 'border-[#E5E8E3]'
          }`}
        >
          <div className="min-w-0 flex-1">
            {title && (
              <h3
                className={`text-[14px] font-semibold break-words ${
                  dark ? 'text-[#FFFFFF]' : 'text-[#172131]'
                }`}
              >
                {title}
              </h3>
            )}
            {subtitle && (
              <p
                className={`text-[11px] break-words ${
                  dark ? 'text-[#AEB8C7]' : 'text-[#64748B]'
                }`}
              >
                {subtitle}
              </p>
            )}
          </div>
          {action && <div className="max-w-full shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </div>
  )
}

export default Card
