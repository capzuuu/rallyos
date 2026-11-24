import { useState } from 'react'
import {
  Activity,
  Bell,
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
  Settings,
  Shield,
  Users,
  X,
} from 'lucide-react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import Logo from '../ui/Logo'
import { useRally } from '../../hooks/useRally'
import { useToast } from '../../hooks/useToast'
import { formatRoleLabel, getInitials } from '../../utils/formatters'

const OPERATIONS_NAV = [
  { to: '/games', label: 'Games', icon: Activity },
  { to: '/courts', label: 'Courts', icon: LayoutGrid },
]

const SCORING_NAV = [
  { to: '/scorekeeper', label: 'Live Scorekeeper', icon: Radio },
]

const SYSTEM_NAV = [
  { to: '/settings', label: 'Settings', icon: Settings },
]

const SUPER_ADMIN_NAV = [
  { to: '/super-admin', label: 'Administrator Monitor', icon: Shield },
]

export function AppShell() {
  const {
    currentUser,
    isAdmin,
    isSuperAdmin,
    isScorekeeper,
    canManageOperations,
    logout,
    notifications,
    markAllNotificationsRead,
  } = useRally()
  const { showToast } = useToast()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  const unreadCount = notifications.filter((n) => !n.read).length
  const homePath = isSuperAdmin
    ? '/super-admin'
    : isScorekeeper
      ? '/scorekeeper'
      : '/games'
  const roleLabel = formatRoleLabel(currentUser?.role)

  function getBreadcrumb() {
    const path = location.pathname
    if (path.startsWith('/super-admin'))
      return { root: 'Administrator Monitor', rootPath: '/super-admin' }
    if (path.startsWith('/games/') && path.length > 7) {
      const code = path.split('/')[2]
      return { root: 'Games', rootPath: '/games', sub: code }
    }
    if (path.startsWith('/tournaments/') && path.length > 13) {
      const code = path.split('/')[2]
      return { root: 'Tournaments', rootPath: '/tournaments', sub: code }
    }
    if (path.startsWith('/courts')) return { root: 'Courts', rootPath: '/courts' }
    if (path.startsWith('/tournaments'))
      return { root: 'Tournaments', rootPath: '/tournaments' }
    if (path.startsWith('/settings'))
      return { root: 'Settings', rootPath: '/settings' }
    if (path.startsWith('/scoreboard'))
      return { root: 'TV Scoreboard', rootPath: '/scoreboard' }
    if (path.startsWith('/scorekeeper'))
      return { root: 'Live Scorekeeper', rootPath: '/scorekeeper' }
    return { root: 'Games', rootPath: '/games' }
  }

  const crumb = getBreadcrumb()

  const handleSignOut = async () => {
    setUserMenuOpen(false)
    await logout()
    showToast({
      type: 'info',
      title: 'Signed Out',
      message: 'You have been signed out of RallyOS.',
    })
    navigate('/login', { replace: true })
  }

  const renderSidebarContent = (isCompact = false) => (
    <div className="flex h-full flex-col bg-[#253247] text-[#F1F3F5]">
      {/* Brand Header */}
      <div className="flex h-15 items-center justify-between border-b border-[#3C485B] px-4">
        <Link to={homePath} className="flex min-w-0 items-center gap-2.5">
          {isCompact ? (
            <Logo
              variant="icon"
              theme="dark"
              className="h-7 w-auto shrink-0"
              alt="RallyOS"
            />
          ) : (
            <div className="flex min-w-0 flex-col">
              <Logo
                variant="full"
                theme="dark"
                className="h-6.5 w-auto"
                alt="RallyOS"
              />
              <span className="mt-0.5 block truncate text-[10px] font-medium text-[#AEB8C7]">
                {isSuperAdmin
                  ? 'Platform Super Admin'
                  : isScorekeeper
                    ? 'Court Official Console'
                    : 'Pickleball Platform'}
              </span>
            </div>
          )}
        </Link>

        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="rounded-lg p-1 text-[#AEB8C7] hover:bg-[#3C485B] hover:text-[#FFFFFF] lg:hidden"
          aria-label="Close sidebar"
        >
          <X className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          className="hidden rounded-lg p-1 text-[#AEB8C7] hover:bg-[#3C485B] hover:text-[#FFFFFF] lg:inline-flex"
          aria-label="Toggle sidebar width"
        >
          {isCompact ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Main Navigation */}
      <div className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {/* Super Admin ONLY — Administrator Accounts Monitor */}
        {isSuperAdmin && (
          <div>
            {!isCompact && (
              <p className="mb-1.5 px-2.5 text-[10px] font-semibold tracking-wider text-[#AEB8C7] uppercase">
                Super Admin
              </p>
            )}
            <nav className="space-y-1">
              {SUPER_ADMIN_NAV.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileOpen(false)}
                    title={isCompact ? item.label : undefined}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${isActive
                        ? 'bg-[#D7F66B] font-semibold text-[#172131]'
                        : 'text-[#F1F3F5] hover:bg-[#172131]/60 hover:text-[#FFFFFF]'
                      }`
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {!isCompact && <span>{item.label}</span>}
                  </NavLink>
                )
              })}
            </nav>
          </div>
        )}

        {/* Operations (Administrator ONLY) */}
        {!isSuperAdmin && canManageOperations && (
          <div>
            {!isCompact && (
              <p className="mb-1.5 px-2.5 text-[10px] font-semibold tracking-wider text-[#AEB8C7] uppercase">
                Operations
              </p>
            )}
            <nav className="space-y-1">
              {OPERATIONS_NAV.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileOpen(false)}
                    title={isCompact ? item.label : undefined}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${isActive
                        ? 'bg-[#D7F66B] font-semibold text-[#172131]'
                        : 'text-[#F1F3F5] hover:bg-[#172131]/60 hover:text-[#FFFFFF]'
                      }`
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {!isCompact && <span>{item.label}</span>}
                  </NavLink>
                )
              })}
            </nav>
          </div>
        )}

        {/* Live Scoring (Administrator & Scorekeeper; Hidden from Super Admin) */}
        {!isSuperAdmin && (
          <div>
            {!isCompact && (
              <p className="mb-1.5 px-2.5 text-[10px] font-semibold tracking-wider text-[#AEB8C7] uppercase">
                {isScorekeeper ? 'Scorekeeper' : 'Live Scoring'}
              </p>
            )}
            <nav className="space-y-1">
              {SCORING_NAV.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/scorekeeper'}
                    onClick={() => setMobileOpen(false)}
                    title={isCompact ? item.label : undefined}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${isActive
                        ? 'bg-[#D7F66B] font-semibold text-[#172131]'
                        : 'text-[#F1F3F5] hover:bg-[#172131]/60 hover:text-[#FFFFFF]'
                      }`
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {!isCompact && <span>{item.label}</span>}
                  </NavLink>
                )
              })}
            </nav>
          </div>
        )}

        {/* System Settings (Administrator ONLY) */}
        {!isSuperAdmin && canManageOperations && (
          <div>
            {!isCompact && (
              <p className="mb-1.5 px-2.5 text-[10px] font-semibold tracking-wider text-[#AEB8C7] uppercase">
                System
              </p>
            )}
            <nav className="space-y-1">
              {SYSTEM_NAV.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileOpen(false)}
                    title={isCompact ? item.label : undefined}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${isActive
                        ? 'bg-[#D7F66B] font-semibold text-[#172131]'
                        : 'text-[#F1F3F5] hover:bg-[#172131]/60 hover:text-[#FFFFFF]'
                      }`
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {!isCompact && <span>{item.label}</span>}
                  </NavLink>
                )
              })}
            </nav>
          </div>
        )}
      </div>

      {/* Bottom User Profile & Sign Out */}
      <div className="border-t border-[#3C485B] p-3">
        <div className="flex items-center justify-between gap-2 rounded-lg bg-[#172131] p-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#D7F66B] text-[11px] font-bold text-[#172131]">
              {getInitials(currentUser?.full_name)}
            </div>
            {!isCompact && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold text-[#FFFFFF]">
                  {currentUser?.full_name}
                </p>
                <p className="truncate text-[10px] font-semibold text-[#D7F66B]">
                  {roleLabel}
                </p>
              </div>
            )}
          </div>
          {!isCompact && (
            <button
              type="button"
              onClick={handleSignOut}
              title="Sign Out"
              className="rounded-lg p-1.5 text-[#AEB8C7] hover:bg-[#253247] hover:text-[#E76B72]"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-dvh bg-[#F5F5F0] text-[#172131]">
      {/* Fixed Desktop Sidebar */}
      <aside
        className={`hidden shrink-0 border-r border-[#3C485B] transition-all duration-200 lg:block ${collapsed ? 'w-17' : 'w-60'
          }`}
      >
        <div className="sticky top-0 h-dvh">
          {renderSidebarContent(collapsed)}
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-[#172131]/70"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative z-10 h-dvh w-64 max-w-[85vw]">
            {renderSidebarContent(false)}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Navigation */}
        <header className="sticky top-0 z-30 flex min-h-14 items-center justify-between gap-2 border-b border-[#E5E8E3] bg-[#FFFFFF] px-3 sm:h-15 sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-2.5">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="shrink-0 rounded-lg border border-[#E5E8E3] p-1.5 text-[#253247] hover:bg-[#F5F5F0] lg:hidden"
              aria-label="Open navigation menu"
            >
              <Menu className="h-4 w-4" />
            </button>

            <div className="flex min-w-0 items-center gap-1.5 text-[12px] sm:text-[13px]">
              <Link
                to={crumb.rootPath}
                className={`truncate font-semibold ${crumb.sub
                    ? 'text-[#253247]/70 hover:text-[#172131]'
                    : 'text-[#172131]'
                  }`}
              >
                {crumb.root}
              </Link>
              {crumb.sub && (
                <>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#AEB8C7]" />
                  <span className="max-w-[110px] truncate rounded bg-[#253247] px-2 py-0.5 text-[11px] font-semibold text-[#D7F66B] sm:max-w-[220px]">
                    {crumb.sub}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
            {/* Role Access Badge */}
            <span className="hidden items-center gap-1.5 rounded-lg border border-[#E5E8E3] bg-[#F5F5F0] px-2.5 py-1 text-[11px] font-semibold text-[#172131] md:inline-flex">
              <Shield className="h-3.5 w-3.5 text-[#12B9B0]" />
              <span>Role: {roleLabel}</span>
            </span>

            {/* Notifications Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setNotifOpen((prev) => !prev)
                  setUserMenuOpen(false)
                }}
                className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] text-[#253247] hover:bg-[#F5F5F0]"
                aria-label="Notifications"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#12B9B0] px-1 text-[10px] font-bold text-[#FFFFFF]">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="fixed inset-x-3 top-15 z-40 rounded-xl border border-[#E5E8E3] bg-[#FFFFFF] p-3 shadow-xl sm:inset-x-auto sm:top-auto sm:absolute sm:right-0 sm:mt-2 sm:w-80">
                  <div className="flex items-center justify-between border-b border-[#E5E8E3] pb-2">
                    <span className="text-[12px] font-semibold text-[#172131]">
                      Facility Alerts ({notifications.length})
                    </span>
                    <button
                      type="button"
                      onClick={markAllNotificationsRead}
                      className="text-[11px] font-medium text-[#12B9B0] hover:underline"
                    >
                      Mark all read
                    </button>
                  </div>
                  <div className="mt-2 max-h-64 space-y-1.5 overflow-y-auto">
                    {notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`rounded-lg p-2 text-[11px] ${n.read ? 'bg-[#F5F5F0]/60' : 'bg-[#D7F66B]/20'
                          }`}
                      >
                        <div className="flex items-center justify-between font-semibold text-[#172131]">
                          <span>{n.title}</span>
                          <span className="text-[10px] font-normal text-[#253247]/60">
                            {n.time}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[#253247]/80">{n.message}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Authenticated User Profile Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setUserMenuOpen((prev) => !prev)
                  setNotifOpen(false)
                }}
                className="flex items-center gap-2 rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-2 py-1.5 hover:bg-[#F5F5F0] sm:px-2.5"
              >
                <div className="flex h-6 w-6 items-center justify-center rounded bg-[#253247] text-[10px] font-bold text-[#D7F66B]">
                  {getInitials(currentUser?.full_name)}
                </div>
                <div className="hidden text-left sm:block">
                  <p className="text-[12px] leading-none font-semibold text-[#172131]">
                    {currentUser?.full_name}
                  </p>
                  <p className="mt-0.5 text-[10px] leading-none text-[#253247]/70">
                    {roleLabel}
                  </p>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-[#253247]" />
              </button>

              {userMenuOpen && (
                <div className="fixed inset-x-3 top-15 z-40 rounded-xl border border-[#E5E8E3] bg-[#FFFFFF] p-3 shadow-xl sm:inset-x-auto sm:top-auto sm:absolute sm:right-0 sm:mt-2 sm:w-72">
                  <div className="rounded-lg bg-[#253247] p-3 text-[#FFFFFF]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[13px] font-bold">
                        {currentUser?.full_name}
                      </p>
                      <span className="rounded bg-[#D7F66B] px-2 py-0.5 text-[10px] font-bold text-[#172131]">
                        {roleLabel}
                      </span>
                    </div>
                    <p className="mt-0.5 font-mono text-[11px] text-[#AEB8C7]">
                      @{currentUser?.username}
                    </p>
                    <p className="mt-2 border-t border-[#3C485B] pt-2 text-[10px] text-[#F1F3F5]">
                      {currentUser?.permissions}
                    </p>
                  </div>

                  <div className="mt-2 space-y-1">
                    {isSuperAdmin ? (
                      <button
                        type="button"
                        onClick={() => {
                          setUserMenuOpen(false)
                          navigate('/super-admin')
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] font-semibold text-[#172131] hover:bg-[#F5F5F0]"
                      >
                        <Shield className="h-3.5 w-3.5 text-[#12B9B0]" />
                        <span>Administrator Monitor</span>
                      </button>
                    ) : (
                      <>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => {
                              setUserMenuOpen(false)
                              navigate('/settings?section=users')
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] font-semibold text-[#172131] hover:bg-[#F5F5F0]"
                          >
                            <Users className="h-3.5 w-3.5 text-[#12B9B0]" />
                            <span>Manage Scorekeeper Accounts</span>
                          </button>
                        )}

                        {canManageOperations && (
                          <button
                            type="button"
                            onClick={() => {
                              setUserMenuOpen(false)
                              navigate('/settings')
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] font-medium text-[#172131] hover:bg-[#F5F5F0]"
                          >
                            <Settings className="h-3.5 w-3.5" />
                            <span>Platform Settings</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            setUserMenuOpen(false)
                            navigate('/scorekeeper')
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] font-medium text-[#172131] hover:bg-[#F5F5F0]"
                        >
                          <Radio className="h-3.5 w-3.5 text-[#12B9B0]" />
                          <span>Scorekeeper &amp; TV Console</span>
                        </button>
                      </>
                    )}
                  </div>

                  <div className="mt-2 border-t border-[#E5E8E3] pt-2">
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] font-semibold text-[#E76B72] hover:bg-[#E76B72]/10"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="mx-auto w-full min-w-0 max-w-[1400px] flex-1 p-3 sm:p-5 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
