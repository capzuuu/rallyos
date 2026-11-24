/**
 * Official RallyOS Vector Brand Logo Component
 *
 * @param {'full' | 'icon' | 'badge'} [variant='full'] - 'full' shows emblem + RallyOS wordmark; 'icon' shows emblem only; 'badge' shows square rounded app icon
 * @param {'light' | 'dark' | 'auto'} [theme='light'] - 'dark' renders white wordmark for dark navy backgrounds; 'light' renders navy wordmark for white/light surfaces
 * @param {string} [className='h-8 w-auto'] - Tailwind size and spacing utility classes
 * @param {string} [alt='RallyOS'] - Accessibility text
 */
export function Logo({
  variant = 'full',
  theme = 'light',
  className = 'h-8 w-auto',
  alt = 'RallyOS',
  ...props
}) {
  let src = '/logo.svg'

  if (variant === 'icon') {
    src = theme === 'dark' ? '/logo-icon-dark.svg' : '/logo-icon.svg'
  } else if (variant === 'badge') {
    src = '/favicon.svg'
  } else {
    src = theme === 'dark' ? '/logo-dark.svg' : '/logo.svg'
  }

  return (
    <img
      src={src}
      alt={alt}
      className={`select-none object-contain ${className}`}
      loading="eager"
      decoding="async"
      {...props}
    />
  )
}

export default Logo
