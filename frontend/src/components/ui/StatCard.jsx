import { Card } from './Card'

export function StatCard({
  label,
  value,
  subtext,
  subtitle,
  icon: Icon,
  highlight = false,
  accent,
}) {
  const isDark = highlight || accent === 'lime'
  const secondaryText = subtext || subtitle

  const iconToneMap = {
    lime: 'bg-[#D7F66B] text-[#172131]',
    teal: 'bg-[#12B9B0] text-[#172131]',
    navy: 'bg-[#253247] text-[#D7F66B]',
    success: 'bg-[#A6D957] text-[#172131]',
    danger: 'bg-[#E76B72] text-[#FFFFFF]',
  }

  const iconTone =
    iconToneMap[accent] ||
    (isDark ? 'bg-[#D7F66B] text-[#172131]' : 'bg-[#253247] text-[#D7F66B]')

  return (
    <Card
      dark={isDark}
      className="flex items-center justify-between gap-3 px-3.5 py-3 sm:px-4 sm:py-3.5"
    >
      <div className="min-w-0 flex-1">
        <p
          className={`text-[11px] font-medium ${
            isDark ? 'text-[#AEB8C7]' : 'text-[#253247]/70'
          }`}
        >
          {label}
        </p>
        <p
          className={`mt-1 text-[20px] font-bold leading-none sm:text-[22px] ${
            isDark ? 'text-[#D7F66B]' : 'text-[#172131]'
          }`}
        >
          {value}
        </p>
        {secondaryText && (
          <p
            className={`mt-1 text-[11px] ${
              isDark ? 'text-[#F1F3F5]/80' : 'text-[#253247]/60'
            }`}
          >
            {secondaryText}
          </p>
        )}
      </div>
      {Icon && (
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconTone}`}
        >
          <Icon className="h-4 w-4" />
        </div>
      )}
    </Card>
  )
}

export default StatCard
