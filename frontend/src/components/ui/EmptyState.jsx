export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-[#E5E8E3] bg-[#F5F5F0] px-4 py-8 text-center sm:px-6 sm:py-10">
      {Icon && (
        <div className="mb-2.5 flex h-10 w-10 items-center justify-center rounded-lg bg-[#253247] text-[#D7F66B]">
          <Icon className="h-5 w-5" />
        </div>
      )}
      <h3 className="text-[14px] font-semibold text-[#172131]">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-[12px] text-[#253247]/70">
          {description}
        </p>
      )}
      {action && <div className="mt-3.5">{action}</div>}
    </div>
  )
}

export default EmptyState
