export function getTodayStr() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDaysStr(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00`)
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function formatShortDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(
    dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`
  )
  if (Number.isNaN(d.getTime())) return String(dateStr)
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function timeToMinutes(tStr) {
  if (!tStr) return 540
  const [h, m] = String(tStr).split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export function minutesToTime(totalMin) {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, totalMin))
  const h = String(Math.floor(clamped / 60)).padStart(2, '0')
  const m = String(clamped % 60).padStart(2, '0')
  return `${h}:${m}`
}

export function computeEndTime(startTime, durationMinutes = 45) {
  return minutesToTime(timeToMinutes(startTime) + Number(durationMinutes || 45))
}

export function rangesOverlap(startA, endA, startB, endB) {
  const a0 = timeToMinutes(startA)
  let a1 = timeToMinutes(endA)
  const b0 = timeToMinutes(startB)
  let b1 = timeToMinutes(endB)
  if (a1 <= a0) a1 = a0 + 45
  if (b1 <= b0) b1 = b0 + 45
  return a0 < b1 && b0 < a1
}

export function getInitials(name) {
  if (!name) return 'RO'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function formatElapsedSeconds(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60)
  const secs = totalSeconds % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export function extractErrorMessage(error, fallback = 'Operation failed.') {
  const detail = error?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail.length > 0) {
    return detail.map((d) => d.msg).join(' | ')
  }
  if (error?.message) return error.message
  return fallback
}

export function normalizeRoleKey(role) {
  const cleaned = String(role || '')
    .trim()
    .toLowerCase()
  if (
    cleaned === 'super_admin' ||
    cleaned === 'super admin' ||
    cleaned === 'superadmin'
  ) {
    return 'super_admin'
  }
  if (cleaned === 'admin' || cleaned === 'administrator') return 'admin'
  return 'scorekeeper'
}

export function formatRoleLabel(role) {
  const key = normalizeRoleKey(role)
  if (key === 'super_admin') return 'Super Admin'
  if (key === 'admin') return 'Administrator'
  return 'Scorekeeper'
}

export function getRolePermissionsText(role) {
  const key = normalizeRoleKey(role)
  if (key === 'super_admin') {
    return 'Platform Monitor: View, Create, Suspend & Manage Administrator Accounts Only'
  }
  if (key === 'admin') {
    return 'Club Operations: Games, Courts, Live Scorekeeper, Settings & Scorekeeper Accounts'
  }
  return 'Court Official: Live Match Scoring & Public TV Scoreboard Only'
}

export function getDefaultRouteForRole(role) {
  const key = normalizeRoleKey(role)
  if (key === 'super_admin') return '/super-admin'
  if (key === 'scorekeeper') return '/scorekeeper'
  return '/games'
}

