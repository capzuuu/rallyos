import { useMemo, useState } from 'react'
import {
  Activity,
  Building2,
  Eye,
  EyeOff,
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldOff,
  Trash2,
  Users,
} from 'lucide-react'
import { useRally } from '../hooks/useRally'
import { useToast } from '../hooks/useToast'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import Modal from '../components/ui/Modal'
import StatCard from '../components/ui/StatCard'
import { formatShortDate, getInitials } from '../utils/formatters'

export default function SuperAdminPage() {
  const {
    adminAccounts,
    adminSummary,
    refreshAdminAccounts,
    createAdminAccount,
    updateAdminAccount,
    deleteAdminAccount,
  } = useRally()
  const { showToast } = useToast()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Create Administrator Modal
  const [createOpen, setCreateOpen] = useState(false)
  const [showCreatePassword, setShowCreatePassword] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [createForm, setCreateForm] = useState({
    full_name: '',
    username: '',
    password: '',
    job_title: '',
    phone: '',
  })

  // Reset Password Modal
  const [resetTarget, setResetTarget] = useState(null)
  const [newPasswordInput, setNewPasswordInput] = useState('')

  // Delete Confirm Dialog
  const [deleteTarget, setDeleteTarget] = useState(null)

  const filteredAdmins = useMemo(() => {
    const list = Array.isArray(adminAccounts) ? adminAccounts : []
    return list.filter((adm) => {
      if (statusFilter === 'ACTIVE' && !adm.is_active) return false
      if (statusFilter === 'SUSPENDED' && adm.is_active) return false
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const hay = [
          adm.full_name,
          adm.username,
          adm.job_title,
          adm.club_name,
          adm.phone,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [adminAccounts, statusFilter, search])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await refreshAdminAccounts()
      showToast({
        type: 'info',
        title: 'Monitor Refreshed',
        message: 'Administrator account list and workspace stats updated.',
      })
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Refresh Failed',
        message: err.message || 'Unable to refresh administrator monitor.',
      })
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleCreateAdmin = async (e) => {
    e.preventDefault()
    if (isCreating) return
    setIsCreating(true)
    try {
      await createAdminAccount(createForm)
      showToast({
        type: 'success',
        title: 'Administrator Created',
        message: `Created @${createForm.username.trim().toLowerCase()} with an isolated club workspace.`,
      })
      setCreateForm({
        full_name: '',
        username: '',
        password: '',
        job_title: '',
        phone: '',
      })
      setShowCreatePassword(false)
      setCreateOpen(false)
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Unable to Create Administrator',
        message: err.message,
      })
    } finally {
      setIsCreating(false)
    }
  }

  const handleToggleAdminStatus = async (adm) => {
    try {
      await updateAdminAccount(adm.id, { is_active: !adm.is_active })
      showToast({
        type: 'info',
        title: adm.is_active ? 'Administrator Suspended' : 'Administrator Activated',
        message: `${adm.full_name} (@${adm.username}) is now ${
          adm.is_active ? 'suspended' : 'active'
        }.`,
      })
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Status Update Failed',
        message: err.message,
      })
    }
  }

  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault()
    if (!resetTarget || !newPasswordInput.trim()) return
    try {
      await updateAdminAccount(resetTarget.id, {
        password: newPasswordInput.trim(),
      })
      showToast({
        type: 'success',
        title: 'Password Updated',
        message: `Updated password for Administrator @${resetTarget.username}.`,
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

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteAdminAccount(deleteTarget.id)
      showToast({
        type: 'info',
        title: 'Administrator Removed',
        message: `Deleted ${deleteTarget.full_name} (@${deleteTarget.username}) and their workspace.`,
      })
      setDeleteTarget(null)
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Delete Failed',
        message: err.message,
      })
    }
  }

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="rally-page-title">Administrator Accounts Monitor</h1>
          <p className="rally-page-desc mt-0.5">
            Monitor and manage Administrator accounts across RallyOS. Club operations stay isolated inside each Administrator workspace.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isRefreshing}
            onClick={handleRefresh}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
            />
            <span>Refresh</span>
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Create Administrator</span>
          </Button>
        </div>
      </div>

      {/* Platform Monitor Summary Cards */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Administrators"
          value={adminSummary?.total_admins ?? 0}
          subtitle={`${adminSummary?.active_admins ?? 0} active accounts`}
          icon={ShieldCheck}
          accent="lime"
        />
        <StatCard
          label="Suspended Admins"
          value={adminSummary?.suspended_admins ?? 0}
          subtitle="Blocked from signing in"
          icon={ShieldOff}
          accent="danger"
        />
        <StatCard
          label="Total Scorekeepers"
          value={adminSummary?.total_scorekeepers ?? 0}
          subtitle={`${adminSummary?.total_courts ?? 0} courts across clubs`}
          icon={Users}
          accent="navy"
        />
        <StatCard
          label="Live / Total Matches"
          value={`${adminSummary?.total_live_games ?? 0} / ${adminSummary?.total_games ?? 0}`}
          subtitle="Live activity across admins"
          icon={Activity}
          accent="teal"
        />
      </div>

      {/* Search & Status Filters */}
      <Card className="p-3 sm:p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-[#64748B]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search administrator name, @username, or club..."
              className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#F5F5F0] pr-3 pl-8 text-[12px] text-[#172131]"
            />
          </div>

          <div className="inline-flex flex-wrap rounded-lg border border-[#E5E8E3] bg-[#F5F5F0] p-0.5">
            {[
              { key: 'ALL', label: `All (${adminAccounts?.length ?? 0})` },
              {
                key: 'ACTIVE',
                label: `Active (${adminSummary?.active_admins ?? 0})`,
              },
              {
                key: 'SUSPENDED',
                label: `Suspended (${adminSummary?.suspended_admins ?? 0})`,
              },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatusFilter(tab.key)}
                className={`rounded-md px-3 py-1 text-[11px] font-semibold transition-all ${
                  statusFilter === tab.key
                    ? 'bg-[#253247] text-[#D7F66B]'
                    : 'text-[#64748B] hover:text-[#172131]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Administrator Accounts Table */}
      <Card
        title="Administrator Accounts"
        subtitle="Monitors Administrator accounts, club workspace volume, and access status only"
      >
        {filteredAdmins.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-[13px] font-semibold text-[#172131]">
              No Administrator accounts match your filter.
            </p>
            <p className="mt-1 text-[11px] text-[#64748B]">
              Clear the search filter or create a new Administrator account.
            </p>
          </div>
        ) : (
          <div className="rally-scroll-x">
            <table className="w-full min-w-[820px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[#E5E8E3] bg-[#F5F5F0]/70 text-[11px] font-semibold tracking-wider text-[#64748B] uppercase">
                  <th className="px-4 py-3">Administrator</th>
                  <th className="px-4 py-3">Club Workspace</th>
                  <th className="px-4 py-3">Workspace Activity</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E8E3] text-[12px]">
                {filteredAdmins.map((adm) => {
                  const stats = adm.stats || {}
                  return (
                    <tr
                      key={adm.id}
                      className="transition-colors hover:bg-[#F5F5F0]/40"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#253247] text-[11px] font-bold text-[#D7F66B]">
                            {getInitials(adm.full_name)}
                          </span>
                          <div className="min-w-0">
                            <p className="font-semibold text-[#172131]">
                              {adm.full_name}
                            </p>
                            <p className="font-mono text-[11px] text-[#64748B]">
                              @{adm.username}
                              {adm.job_title ? ` • ${adm.job_title}` : ''}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#172131]">
                          <Building2 className="h-3.5 w-3.5 shrink-0 text-[#12B9B0]" />
                          <span>{adm.club_name || 'RallyOS Club'}</span>
                        </div>
                        {adm.phone && (
                          <p className="mt-0.5 text-[10px] text-[#64748B]">
                            {adm.phone}
                          </p>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold">
                          <span className="rounded bg-[#F5F5F0] px-2 py-0.5 text-[#172131]">
                            Courts: {stats.courts_count ?? 0}
                          </span>
                          <span className="rounded bg-[#F5F5F0] px-2 py-0.5 text-[#172131]">
                            Scorekeepers: {stats.scorekeepers_count ?? 0}
                          </span>
                          <span className="rounded bg-[#F5F5F0] px-2 py-0.5 text-[#172131]">
                            Games: {stats.games_count ?? 0}
                          </span>
                          {(stats.live_games_count ?? 0) > 0 && (
                            <span className="rounded bg-[#12B9B0] px-2 py-0.5 font-bold text-[#FFFFFF]">
                              {stats.live_games_count} Live
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <Badge status={adm.is_active ? 'Confirmed' : 'Disabled'}>
                          {adm.is_active ? 'Active' : 'Suspended'}
                        </Badge>
                      </td>

                      <td className="px-4 py-3 text-[11px] text-[#64748B] whitespace-nowrap">
                        {formatShortDate(adm.created_at)}
                      </td>

                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setResetTarget(adm)
                              setNewPasswordInput('')
                            }}
                          >
                            <KeyRound className="h-3.5 w-3.5" />
                            <span>Set Password</span>
                          </Button>

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleToggleAdminStatus(adm)}
                          >
                            {adm.is_active ? 'Disable' : 'Enable'}
                          </Button>

                          <button
                            type="button"
                            onClick={() => setDeleteTarget(adm)}
                            className="rounded-lg p-1.5 text-[#64748B] hover:bg-[#E76B72]/15 hover:text-[#E76B72]"
                            title="Delete Administrator account"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create Administrator Modal */}
      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Administrator Account"
        description="Provision an isolated Administrator workspace. That Administrator can manage their own courts, games, settings, and Scorekeeper accounts."
        size="md"
      >
        <form onSubmit={handleCreateAdmin} className="space-y-3.5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[#172131]">
                Full Name
              </label>
              <input
                type="text"
                required
                value={createForm.full_name}
                onChange={(e) =>
                  setCreateForm({ ...createForm, full_name: e.target.value })
                }
                placeholder="e.g. Alex Morgan"
                className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-3 text-[12px] text-[#172131]"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[#172131]">
                Title (Optional)
              </label>
              <input
                type="text"
                value={createForm.job_title}
                onChange={(e) =>
                  setCreateForm({ ...createForm, job_title: e.target.value })
                }
                placeholder="e.g. Club Administrator"
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
                value={createForm.username}
                onChange={(e) =>
                  setCreateForm({ ...createForm, username: e.target.value })
                }
                placeholder="e.g. admin3"
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
                  value={createForm.password}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, password: e.target.value })
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
              value={createForm.phone}
              onChange={(e) =>
                setCreateForm({ ...createForm, phone: e.target.value })
              }
              placeholder="+1 (512) 555-0199"
              className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-3 text-[12px] text-[#172131]"
            />
          </div>

          <div className="flex flex-wrap-reverse items-center justify-end gap-2 border-t border-[#E5E8E3] pt-3 sm:flex-nowrap">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isCreating}>
              {isCreating ? 'Creating...' : 'Create Administrator'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Reset Administrator Password Modal */}
      <Modal
        isOpen={Boolean(resetTarget)}
        onClose={() => setResetTarget(null)}
        title={`Set Password — ${resetTarget?.full_name || ''}`}
        description={`Update the login password for Administrator @${resetTarget?.username || ''}.`}
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

      {/* Confirm Delete Administrator Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title={`Delete Administrator @${deleteTarget?.username || ''}?`}
        message={`This will permanently remove ${deleteTarget?.full_name || 'this Administrator'} along with their Scorekeepers, courts, games, and workspace settings.`}
        confirmLabel="Delete Administrator"
        variant="danger"
      />
    </div>
  )
}

