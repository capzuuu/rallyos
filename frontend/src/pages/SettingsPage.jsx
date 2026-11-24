import { useEffect, useState } from 'react'
import {
  Building2,
  Eye,
  EyeOff,
  Gamepad2,
  KeyRound,
  Lock,
  Plus,
  Save,
  Shield,
  Trash2,
  Users,
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { useRally } from '../hooks/useRally'
import { useToast } from '../hooks/useToast'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Modal from '../components/ui/Modal'
import Logo from '../components/ui/Logo'
import {
  DURATION_OPTIONS,
  MATCH_FORMATS,
  POINTS_OPTIONS,
  SCORING_TYPES,
} from '../utils/constants'
import {
  formatRoleLabel,
  getInitials,
  getRolePermissionsText,
  normalizeRoleKey,
} from '../utils/formatters'

const ALL_SETTINGS_SECTIONS = [
  { id: 'business', label: 'Business Settings', icon: Building2, adminOnly: false },
  { id: 'users', label: 'Scorekeeper Accounts', icon: Users, adminOnly: true },
  { id: 'games', label: 'Game Settings', icon: Gamepad2, adminOnly: false },
]

export default function SettingsPage() {
  const {
    settings,
    users,
    currentUser,
    isAdmin,
    canManageAccounts,
    updateSettings,
    addUserAccount,
    updateUserAccount,
    deleteUserAccount,
  } = useRally()
  const { showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const visibleSections = ALL_SETTINGS_SECTIONS.filter(
    (sec) => !sec.adminOnly || canManageAccounts
  )

  const requestedSection = searchParams.get('section')
  const [activeSection, setActiveSection] = useState(() => {
    if (requestedSection === 'users' && canManageAccounts) return 'users'
    if (
      requestedSection &&
      visibleSections.some((s) => s.id === requestedSection)
    ) {
      return requestedSection
    }
    return 'business'
  })

  useEffect(() => {
    if (requestedSection === 'users' && canManageAccounts) {
      setActiveSection('users')
    } else if (
      requestedSection &&
      ALL_SETTINGS_SECTIONS.some(
        (s) => s.id === requestedSection && (!s.adminOnly || canManageAccounts)
      )
    ) {
      setActiveSection(requestedSection)
    } else if (requestedSection) {
      setActiveSection('business')
    }
  }, [requestedSection, canManageAccounts])

  const handleSectionSelect = (secId) => {
    setActiveSection(secId)
    setSearchParams({ section: secId })
  }

  // Local editable state initialized from RallyContext settings
  const [businessForm, setBusinessForm] = useState({
    club_name:
      settings?.business?.club_name || 'RallyOS Pickleball Club & Arena',
    logo_text: settings?.business?.logo_text || 'RALLYOS',
    contact_email:
      settings?.business?.contact_email || 'operations@rallyos.club',
    contact_phone: settings?.business?.contact_phone || '+1 (512) 555-0194',
    location:
      settings?.business?.location ||
      '420 Championship Way, Austin, TX 78701',
  })

  const [gameSettingsForm, setGameSettingsForm] = useState({
    default_scoring_type:
      settings?.game_defaults?.scoring_type ||
      settings?.games?.default_scoring_type ||
      'Side-Out',
    default_points_to_win:
      settings?.game_defaults?.points_to_win ||
      settings?.games?.default_points_to_win ||
      11,
    default_win_by_two:
      settings?.game_defaults?.win_by_two ??
      settings?.games?.default_win_by_two ??
      true,
    default_duration_minutes:
      settings?.game_defaults?.duration_minutes ||
      settings?.games?.default_duration_minutes ||
      45,
    default_match_format:
      settings?.game_defaults?.match_format ||
      settings?.games?.default_match_format ||
      'Single Game',
  })

  useEffect(() => {
    setBusinessForm({
      club_name:
        settings?.business?.club_name || 'RallyOS Pickleball Club & Arena',
      logo_text: settings?.business?.logo_text || 'RALLYOS',
      contact_email:
        settings?.business?.contact_email || 'operations@rallyos.club',
      contact_phone: settings?.business?.contact_phone || '+1 (512) 555-0194',
      location:
        settings?.business?.location ||
        '420 Championship Way, Austin, TX 78701',
    })
    setGameSettingsForm({
      default_scoring_type:
        settings?.game_defaults?.scoring_type ||
        settings?.games?.default_scoring_type ||
        'Side-Out',
      default_points_to_win:
        settings?.game_defaults?.points_to_win ||
        settings?.games?.default_points_to_win ||
        11,
      default_win_by_two:
        settings?.game_defaults?.win_by_two ??
        settings?.games?.default_win_by_two ??
        true,
      default_duration_minutes:
        settings?.game_defaults?.duration_minutes ||
        settings?.games?.default_duration_minutes ||
        45,
      default_match_format:
        settings?.game_defaults?.match_format ||
        settings?.games?.default_match_format ||
        'Single Game',
    })
  }, [settings])

  // Create Scorekeeper Account Modal (Administrator Only)
  const [userModalOpen, setUserModalOpen] = useState(false)
  const [showCreatePassword, setShowCreatePassword] = useState(false)
  const [userForm, setUserForm] = useState({
    full_name: '',
    username: '',
    password: '',
    job_title: '',
    phone: '',
    role: 'Scorekeeper',
  })

  // Reset Password Modal (Administrator Only)
  const [resetTarget, setResetTarget] = useState(null)
  const [newPasswordInput, setNewPasswordInput] = useState('')

  const handleSaveBusiness = async (e) => {
    e.preventDefault()
    try {
      await updateSettings('business', businessForm)
      showToast({
        type: 'success',
        title: 'Business Settings Saved',
        message: 'Facility name, branding, and contact details updated.',
      })
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Save Failed',
        message: err.message || 'Unable to save business settings.',
      })
    }
  }

  const handleSaveGameSettings = async (e) => {
    e.preventDefault()
    const parsedPoints = Number(gameSettingsForm.default_points_to_win)
    if (!Number.isInteger(parsedPoints) || parsedPoints < 1 || parsedPoints > 99) {
      showToast({
        type: 'error',
        title: 'Invalid Points per Game',
        message: 'Default points per game must be a whole number between 1 and 99.',
      })
      return
    }
    try {
      await updateSettings('game_defaults', {
        scoring_type: gameSettingsForm.default_scoring_type,
        points_to_win: parsedPoints,
        win_by_two: gameSettingsForm.default_win_by_two,
        duration_minutes: Number(gameSettingsForm.default_duration_minutes) || 45,
        match_format: gameSettingsForm.default_match_format,
      })
      showToast({
        type: 'success',
        title: 'Game Defaults Saved',
        message: `Default match rules set to ${gameSettingsForm.default_scoring_type} (${parsedPoints} pts).`,
      })
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Save Failed',
        message: err.message || 'Unable to save game defaults.',
      })
    }
  }

  const handleCreateUser = async (e) => {
    e.preventDefault()
    if (!canManageAccounts) {
      showToast({
        type: 'error',
        title: 'Administrator Required',
        message: 'Only an Administrator can create Scorekeeper accounts.',
      })
      return
    }
    try {
      const created = await addUserAccount({
        ...userForm,
        role: 'Scorekeeper',
      })
      showToast({
        type: 'success',
        title: 'Scorekeeper Account Created',
        message: `${created.full_name} (@${created.username}) can now sign in on the unified login page.`,
      })
      setUserForm({
        full_name: '',
        username: '',
        password: '',
        job_title: '',
        phone: '',
        role: 'Scorekeeper',
      })
      setUserModalOpen(false)
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Account Creation Failed',
        message: err.message || 'Unable to create account.',
      })
    }
  }

  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault()
    if (!resetTarget || !newPasswordInput || newPasswordInput.length < 6) {
      showToast({
        type: 'error',
        title: 'Invalid Password',
        message: 'Password must be at least 6 characters.',
      })
      return
    }
    try {
      await updateUserAccount(resetTarget.id, { password: newPasswordInput })
      showToast({
        type: 'success',
        title: 'Password Updated',
        message: `Updated login password for ${resetTarget.full_name}.`,
      })
      setResetTarget(null)
      setNewPasswordInput('')
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Update Failed',
        message: err.message,
      })
    }
  }

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="rally-page-title">Settings</h1>
          <p className="rally-page-desc mt-0.5">
            {isAdmin
              ? 'Configure facility settings, operational defaults, and create Scorekeeper accounts.'
              : 'Configure operational preferences for games and facility info.'}
          </p>
        </div>

        {isAdmin ? (
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              handleSectionSelect('users')
              setUserModalOpen(true)
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Create Scorekeeper</span>
          </Button>
        ) : (
          <span className="inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-3 py-1.5 text-[11px] font-semibold text-[#64748B]">
            <Lock className="h-3.5 w-3.5 shrink-0 text-[#12B9B0]" />
            <span>
              Scorekeeper account creation is restricted to Administrator accounts
            </span>
          </span>
        )}
      </div>

      {/* Section Navigation */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[#E5E8E3] pb-2">
        {visibleSections.map((sec) => {
          const Icon = sec.icon
          const active = activeSection === sec.id
          return (
            <button
              key={sec.id}
              type="button"
              onClick={() => handleSectionSelect(sec.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold transition-all sm:gap-2 sm:px-3.5 sm:py-2 sm:text-[12px] ${active
                ? 'bg-[#253247] text-[#D7F66B]'
                : 'text-[#64748B] hover:bg-[#FFFFFF] hover:text-[#172131]'
                }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span>{sec.label}</span>
            </button>
          )
        })}
      </div>

      {/* 1. BUSINESS SETTINGS */}
      {activeSection === 'business' && (
        <Card
          title="Business Settings"
          subtitle="Club or facility name, logo badge, contact details, and venue location"
        >
          <form onSubmit={handleSaveBusiness} className="space-y-4 p-3.5 sm:p-4">
            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[#253247] p-3.5 text-[#FFFFFF] sm:gap-4 sm:p-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#172131] sm:h-12 sm:w-12">
                {businessForm.logo_text.toUpperCase().includes('RALLY') ? (
                  <Logo
                    variant="icon"
                    theme="dark"
                    className="h-7 w-auto shrink-0"
                    alt="RallyOS"
                  />
                ) : (
                  <span className="text-[14px] font-extrabold text-[#D7F66B] sm:text-[15px]">
                    {businessForm.logo_text.slice(0, 3).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="break-words text-[14px] font-bold">
                  {businessForm.club_name}
                </p>
                <p className="break-words text-[11px] text-[#AEB8C7]">
                  {businessForm.location} • {businessForm.contact_phone}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-[#172131]">
                  Club or Facility Name
                </label>
                <input
                  type="text"
                  required
                  value={businessForm.club_name}
                  onChange={(e) =>
                    setBusinessForm({
                      ...businessForm,
                      club_name: e.target.value,
                    })
                  }
                  className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-3 text-[12px] text-[#172131]"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-[#172131]">
                  Scoreboard Logo Mark / Text
                </label>
                <input
                  type="text"
                  required
                  value={businessForm.logo_text}
                  onChange={(e) =>
                    setBusinessForm({
                      ...businessForm,
                      logo_text: e.target.value,
                    })
                  }
                  className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-3 text-[12px] text-[#172131]"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-[#172131]">
                  Contact Email
                </label>
                <input
                  type="email"
                  required
                  value={businessForm.contact_email}
                  onChange={(e) =>
                    setBusinessForm({
                      ...businessForm,
                      contact_email: e.target.value,
                    })
                  }
                  className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-3 text-[12px] text-[#172131]"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-[#172131]">
                  Contact Phone
                </label>
                <input
                  type="text"
                  required
                  value={businessForm.contact_phone}
                  onChange={(e) =>
                    setBusinessForm({
                      ...businessForm,
                      contact_phone: e.target.value,
                    })
                  }
                  className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-3 text-[12px] text-[#172131]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block text-[11px] font-semibold text-[#172131]">
                  Facility Location
                </label>
                <input
                  type="text"
                  required
                  value={businessForm.location}
                  onChange={(e) =>
                    setBusinessForm({
                      ...businessForm,
                      location: e.target.value,
                    })
                  }
                  className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-3 text-[12px] text-[#172131]"
                />
              </div>
            </div>

            <div className="flex justify-end border-t border-[#E5E8E3] pt-3">
              <Button type="submit" variant="primary">
                <Save className="h-3.5 w-3.5" />
                <span>Save Business Settings</span>
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* 2. SCOREKEEPER ACCOUNTS (ADMINISTRATOR ONLY) */}
      {activeSection === 'users' && canManageAccounts && (
        <div className="space-y-4">
          <Card
            title={`Scorekeeper Accounts — @${currentUser?.username || 'admin'}`}
            subtitle="Scorekeeper accounts created here belong exclusively to your Administrator workspace and only access your live games and scoreboards. Administrator accounts are monitored and managed separately by Super Admin."
          >
            <div className="rally-scroll-x">
              <table className="w-full min-w-[680px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-[#E5E8E3] bg-[#F5F5F0]/70 text-[11px] font-semibold tracking-wider text-[#64748B] uppercase">
                    <th className="px-4 py-3">Account</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Permissions Scope</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Admin Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E8E3] text-[12px]">
                  {users.map((u) => {
                    const isCurrent =
                      Number(currentUser?.id) === Number(u.id) ||
                      String(currentUser?.username).toLowerCase() ===
                      String(u.username).toLowerCase()
                    const roleKey = normalizeRoleKey(u.role)
                    const roleLabel = formatRoleLabel(u.role)
                    return (
                      <tr
                        key={u.id}
                        className="transition-colors hover:bg-[#F5F5F0]/40"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#253247] text-[11px] font-bold text-[#D7F66B]">
                              {getInitials(u.full_name)}
                            </span>
                            <div>
                              <p className="font-semibold text-[#172131]">
                                {u.full_name}{' '}
                                {isCurrent && (
                                  <span className="ml-1 rounded bg-[#D7F66B] px-1.5 py-0.5 text-[10px] font-bold text-[#172131]">
                                    Signed In (You)
                                  </span>
                                )}
                              </p>
                              <p className="font-mono text-[11px] text-[#64748B]">
                                @{u.username}
                                {u.phone ? ` • ${u.phone}` : ''}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-md px-2.5 py-1 text-[11px] font-semibold ${roleKey === 'admin'
                              ? 'bg-[#253247] text-[#D7F66B]'
                              : 'bg-[#F5F5F0] text-[#172131]'
                              }`}
                          >
                            {roleLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[11px] text-[#64748B]">
                          {u.permissions || getRolePermissionsText(u.role)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            status={u.is_active ? 'Confirmed' : 'Disabled'}
                          >
                            {u.is_active ? 'Active' : 'Suspended'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setResetTarget(u)
                                setNewPasswordInput('')
                              }}
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                              <span>Set Password</span>
                            </Button>

                            {!isCurrent && (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={async () => {
                                    try {
                                      await updateUserAccount(u.id, {
                                        is_active: !u.is_active,
                                      })
                                      showToast({
                                        type: 'info',
                                        title: u.is_active
                                          ? 'Account Suspended'
                                          : 'Account Activated',
                                        message: `${u.full_name} is now ${u.is_active ? 'suspended' : 'active'
                                          }.`,
                                      })
                                    } catch (err) {
                                      showToast({
                                        type: 'error',
                                        title: 'Error',
                                        message: err.message,
                                      })
                                    }
                                  }}
                                >
                                  {u.is_active ? 'Disable' : 'Enable'}
                                </Button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      await deleteUserAccount(u.id)
                                      showToast({
                                        type: 'info',
                                        title: 'Account Deleted',
                                        message: `Removed ${u.full_name} (@${u.username}).`,
                                      })
                                    } catch (err) {
                                      showToast({
                                        type: 'error',
                                        title: 'Error',
                                        message: err.message,
                                      })
                                    }
                                  }}
                                  className="rounded-lg p-1.5 text-[#64748B] hover:bg-[#E76B72]/15 hover:text-[#E76B72]"
                                  title="Delete account"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Role Matrix Card */}
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
            {[
              {
                role: 'Administrator',
                desc: 'Full control over club Games, Courts, Live Scorekeeper, Settings, and managing Scorekeeper accounts. Administrator accounts are created and monitored by Super Admin.',
                badge: 'Club Operations + Scorekeepers',
              },
              {
                role: 'Scorekeeper',
                desc: 'Dedicated access strictly to Live Match Scoring (/scorekeeper) and Public TV Scoreboards (/scoreboard) inside your club workspace.',
                badge: 'Score & TV Scoreboard Only',
              },
            ].map((item) => (
              <div
                key={item.role}
                className="rounded-xl border border-[#E5E8E3] bg-[#FFFFFF] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-[#12B9B0]" />
                    <h4 className="text-[13px] font-bold text-[#172131]">
                      {item.role}
                    </h4>
                  </div>
                  <span className="rounded bg-[#253247] px-2 py-0.5 text-[10px] font-bold text-[#D7F66B]">
                    {item.badge}
                  </span>
                </div>
                <p className="mt-2 text-[11px] text-[#64748B]">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. GAME SETTINGS */}
      {activeSection === 'games' && (
        <Card
          title="Game Settings"
          subtitle="Default scoring format, points per game, win-by-two rule, and match duration"
        >
          <form onSubmit={handleSaveGameSettings} className="space-y-4 p-4">
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-[#172131]">
                  Default Scoring Format
                </label>
                <select
                  value={gameSettingsForm.default_scoring_type}
                  onChange={(e) =>
                    setGameSettingsForm({
                      ...gameSettingsForm,
                      default_scoring_type: e.target.value,
                    })
                  }
                  className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-2.5 text-[12px] text-[#172131]"
                >
                  {SCORING_TYPES.map((st) => (
                    <option key={st} value={st}>
                      {st} Scoring
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="settings-default-points"
                  className="mb-1 block text-[11px] font-semibold text-[#172131]"
                >
                  Default Points per Game
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex w-full items-center gap-1.5 sm:w-36">
                    <input
                      id="settings-default-points"
                      type="number"
                      min={1}
                      max={99}
                      required
                      value={gameSettingsForm.default_points_to_win}
                      onChange={(e) =>
                        setGameSettingsForm({
                          ...gameSettingsForm,
                          default_points_to_win:
                            e.target.value === '' ? '' : Number(e.target.value),
                        })
                      }
                      placeholder="11"
                      className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-2.5 text-[12px] text-[#172131]"
                    />
                    <span className="shrink-0 text-[11px] font-medium text-[#64748B]">
                      pts
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {POINTS_OPTIONS.map((pt) => (
                      <button
                        key={pt}
                        type="button"
                        onClick={() =>
                          setGameSettingsForm({
                            ...gameSettingsForm,
                            default_points_to_win: pt,
                          })
                        }
                        className={`rounded px-2 py-1 text-[11px] font-semibold transition-colors ${Number(gameSettingsForm.default_points_to_win) === pt
                          ? 'bg-[#253247] text-[#D7F66B]'
                          : 'bg-[#F5F5F0] text-[#253247] hover:bg-[#E5E8E3]'
                          }`}
                      >
                        {pt} pts
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-[#172131]">
                  Default Match Format
                </label>
                <select
                  value={gameSettingsForm.default_match_format}
                  onChange={(e) =>
                    setGameSettingsForm({
                      ...gameSettingsForm,
                      default_match_format: e.target.value,
                    })
                  }
                  className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-2.5 text-[12px] text-[#172131]"
                >
                  {MATCH_FORMATS.map((mf) => (
                    <option key={mf} value={mf}>
                      {mf}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-[#172131]">
                  Default Match Duration
                </label>
                <select
                  value={gameSettingsForm.default_duration_minutes}
                  onChange={(e) =>
                    setGameSettingsForm({
                      ...gameSettingsForm,
                      default_duration_minutes: Number(e.target.value),
                    })
                  }
                  className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-2.5 text-[12px] text-[#172131]"
                >
                  {DURATION_OPTIONS.map((d) => (
                    <option key={d} value={d}>
                      {d} Minutes
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rounded-lg border border-[#E5E8E3] bg-[#F5F5F0] p-3">
              <label className="flex items-center gap-2 text-[12px] font-semibold text-[#172131]">
                <input
                  type="checkbox"
                  checked={gameSettingsForm.default_win_by_two}
                  onChange={(e) =>
                    setGameSettingsForm({
                      ...gameSettingsForm,
                      default_win_by_two: e.target.checked,
                    })
                  }
                  className="h-4 w-4 rounded accent-[#253247]"
                />
                <span>
                  Require Win by 2 Points by default on newly created matches
                </span>
              </label>
            </div>

            <div className="flex justify-end border-t border-[#E5E8E3] pt-3">
              <Button type="submit" variant="primary">
                <Save className="h-3.5 w-3.5" />
                <span>Save Game Settings</span>
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Create Scorekeeper Account Modal (Administrator Only) */}
      <Modal
        isOpen={userModalOpen}
        onClose={() => setUserModalOpen(false)}
        title="Create Scorekeeper Account"
        description="Provision login credentials for a Court Scorekeeper assigned to your Administrator workspace. They will sign in through the unified login page (/login)."
        size="md"
      >
        <form onSubmit={handleCreateUser} className="space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#172131] bg-[#253247] p-3 text-[#FFFFFF]">
            <div>
              <p className="text-[12px] font-bold text-[#D7F66B]">
                Scorekeeper
              </p>
              <p className="mt-0.5 text-[10px] text-[#AEB8C7]">
                Live Match Scoring &amp; Public TV Scoreboard Only
              </p>
            </div>
            <span className="rounded bg-[#172131] px-2 py-0.5 text-[10px] font-semibold text-[#F1F3F5]">
              Assigned to @{currentUser?.username || 'admin'}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[#172131]">
                Full Name
              </label>
              <input
                type="text"
                required
                value={userForm.full_name}
                onChange={(e) =>
                  setUserForm({ ...userForm, full_name: e.target.value })
                }
                placeholder="e.g. Jordan Vance"
                className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-3 text-[12px] text-[#172131]"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[#172131]">
                Job Title (Optional)
              </label>
              <input
                type="text"
                value={userForm.job_title}
                onChange={(e) =>
                  setUserForm({ ...userForm, job_title: e.target.value })
                }
                placeholder="e.g. Court Scorekeeper"
                className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-3 text-[12px] text-[#172131]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[#172131]">
                Username
              </label>
              <input
                type="text"
                required
                value={userForm.username}
                onChange={(e) =>
                  setUserForm({ ...userForm, username: e.target.value })
                }
                placeholder="e.g. jordan_scorer"
                className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-3 text-[12px] text-[#172131]"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[#172131]">
                Login Password
              </label>
              <div className="relative">
                <input
                  type={showCreatePassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={userForm.password}
                  onChange={(e) =>
                    setUserForm({ ...userForm, password: e.target.value })
                  }
                  placeholder="Min. 6 characters"
                  className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] pr-9 pl-3 text-[12px] text-[#172131]"
                />
                <button
                  type="button"
                  onClick={() => setShowCreatePassword((p) => !p)}
                  className="absolute top-1/2 right-2.5 -translate-y-1/2 text-[#64748B] hover:text-[#172131]"
                >
                  {showCreatePassword ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[#172131]">
              Phone Number (Optional)
            </label>
            <input
              type="text"
              value={userForm.phone}
              onChange={(e) =>
                setUserForm({ ...userForm, phone: e.target.value })
              }
              placeholder="+1 (512) 555-0199"
              className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-3 text-[12px] text-[#172131]"
            />
          </div>

          <div className="rounded-lg border border-[#E5E8E3] bg-[#F5F5F0] p-3 text-[11px] text-[#253247]">
            <span className="font-bold text-[#172131]">
              Assigned Permissions (Scorekeeper):
            </span>{' '}
            {getRolePermissionsText('Scorekeeper')}
          </div>

          <div className="flex flex-wrap-reverse items-center justify-end gap-2 border-t border-[#E5E8E3] pt-3 sm:flex-nowrap">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setUserModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Create Scorekeeper Account
            </Button>
          </div>
        </form>
      </Modal>

      {/* Reset User Password Modal (Administrator Only) */}
      <Modal
        isOpen={Boolean(resetTarget)}
        onClose={() => setResetTarget(null)}
        title={`Set Password — ${resetTarget?.full_name || ''}`}
        description={`Update the login password for @${resetTarget?.username || ''}.`}
        size="sm"
      >
        <form onSubmit={handleResetPasswordSubmit} className="space-y-3.5">
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[#172131]">
              New Password
            </label>
            <input
              type="text"
              required
              minLength={6}
              value={newPasswordInput}
              onChange={(e) => setNewPasswordInput(e.target.value)}
              placeholder="Enter new password (min 6 chars)"
              className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-3 text-[12px] text-[#172131]"
            />
          </div>
          <div className="flex justify-end gap-2 border-t border-[#E5E8E3] pt-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setResetTarget(null)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Update Password
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
