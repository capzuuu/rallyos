export function Button({
  children,
  variant = 'primary',
  size = 'md',
  type = 'button',
  disabled = false,
  className = '',
  ...props
}) {
  const variants = {
    primary:
      'bg-[#D7F66B] text-[#172131] border border-[#D7F66B] hover:brightness-95 active:brightness-90',
    navy:
      'bg-[#253247] text-[#F1F3F5] border border-[#3C485B] hover:bg-[#172131]',
    secondary:
      'bg-[#253247] text-[#D7F66B] border border-[#3C485B] hover:bg-[#172131]',
    outline:
      'bg-[#FFFFFF] text-[#172131] border border-[#E5E8E3] hover:bg-[#F5F5F0]',
    teal:
      'bg-[#12B9B0] text-[#FFFFFF] border border-[#12B9B0] hover:brightness-95',
    danger:
      'bg-[#E76B72] text-[#FFFFFF] border border-[#E76B72] hover:brightness-95',
    ghost: 'bg-transparent text-[#253247] hover:bg-[#E5E8E3]/60',
  }

  const sizes = {
    xs: 'px-2 py-1 text-[11px]',
    sm: 'px-2.5 py-1.5 text-[12px]',
    md: 'px-3.5 py-2 text-[12px]',
    lg: 'px-4 py-2.5 text-[13px]',
  }

  return (
    <button
      type={type}
      disabled={disabled}
      className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
        variants[variant] || variants.primary
      } ${sizes[size] || sizes.md} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export default Button
