export function Badge({ status, children, className = '' }) {
  const val = String(status || children || '').trim()

  const stylesByStatus = {
    Live: 'bg-[#12B9B0] text-[#FFFFFF] border-[#12B9B0]',
    Ongoing: 'bg-[#D7F66B] text-[#172131] border-[#D7F66B]',
    Available: 'bg-[#D7F66B] text-[#172131] border-[#D7F66B]',
    Completed: 'bg-[#A6D957]/30 text-[#172131] border-[#A6D957]',
    Confirmed: 'bg-[#A6D957]/30 text-[#172131] border-[#A6D957]',
    'Checked-In': 'bg-[#12B9B0]/25 text-[#172131] border-[#12B9B0]',
    'Registration Open': 'bg-[#D7F66B] text-[#172131] border-[#D7F66B]',
    Upcoming: 'bg-[#253247] text-[#F1F3F5] border-[#3C485B]',
    Reserved: 'bg-[#F3C969]/35 text-[#172131] border-[#F3C969]',
    Waitlist: 'bg-[#F3C969]/35 text-[#172131] border-[#F3C969]',
    'Registration Closed': 'bg-[#F3C969]/35 text-[#172131] border-[#F3C969]',
    Draft: 'bg-[#F5F5F0] text-[#253247] border-[#E5E8E3]',
    Occupied: 'bg-[#253247] text-[#D7F66B] border-[#3C485B]',
    Maintenance: 'bg-[#E76B72]/25 text-[#172131] border-[#E76B72]',
    Cancelled: 'bg-[#E76B72]/25 text-[#172131] border-[#E76B72]',
    Disabled: 'bg-[#E5E8E3] text-[#253247] border-[#AEB8C7]',
  }

  const tone =
    stylesByStatus[val] ||
    'bg-[#F5F5F0] text-[#253247] border-[#E5E8E3]'

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-[11px] font-semibold tracking-tight whitespace-nowrap ${tone} ${className}`}
    >
      {children || val}
    </span>
  )
}

export default Badge
