import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Award,
  Calendar,
  CheckCircle2,
  Eye,
  Plus,
  Search,
  Trophy,
  Users,
} from 'lucide-react'
import { useRally } from '../hooks/useRally'
import { useToast } from '../hooks/useToast'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import EmptyState from '../components/ui/EmptyState'
import Modal from '../components/ui/Modal'
import StatCard from '../components/ui/StatCard'
import {
  MATCH_FORMATS,
  MATCH_TYPES,
  POINTS_OPTIONS,
  SCORING_TYPES,
  SKILL_DIVISIONS,
  TOURNAMENT_FORMATS,
  TOURNAMENT_STATUSES,
} from '../utils/constants'
import { addDaysStr, formatShortDate, getTodayStr } from '../utils/formatters'

export default function TournamentsPage() {
  const navigate = useNavigate()
  const { courts, tournaments, settings, createTournament, pushNotification } =
    useRally()
  const { showToast } = useToast()

  const today = getTodayStr()

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [formatFilter, setFormatFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [categoryFilter, setCategoryFilter] = useState('ALL')

  // Creation modal
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({
    name: '',
    description: '',
    tournament_type: 'Championship',
    match_type: 'Doubles',
    skill_division: '4.5+',
    format:
      settings?.tournaments?.default_tournament_format || 'Single Elimination',
    registration_deadline: today,
    start_date: addDaysStr(today, 2),
    max_participants: settings?.tournaments?.default_max_participants || 8,
    entry_fee_info: '',
    assigned_court_ids: [],
    match_format: settings?.tournaments?.default_match_format || 'Best of 3',
    scoring_type: settings?.games?.default_scoring_type || 'Side-Out',
    points_to_win: settings?.games?.default_points_to_win || 11,
    win_by_two: settings?.games?.default_win_by_two !== false,
    status: 'Registration Open',
  })

  const stats = useMemo(() => {
    const activeCount = tournaments.filter(
      (t) => t.status === 'Ongoing' || t.status === 'Registration Open'
    ).length
    const upcomingCount = tournaments.filter(
      (t) =>
        t.status === 'Registration Open' ||
        t.status === 'Registration Closed' ||
        t.status === 'Draft'
    ).length
    const totalPlayers = tournaments.reduce(
      (sum, t) => sum + (t.participants?.length || 0),
      0
    )
    const completedCount = tournaments.filter(
      (t) => t.status === 'Completed'
    ).length

    return {
      activeCount,
      upcomingCount,
      totalPlayers,
      completedCount,
    }
  }, [tournaments])

  const filteredTournaments = useMemo(() => {
    return tournaments.filter((t) => {
      if (formatFilter !== 'ALL' && t.format !== formatFilter) return false
      if (statusFilter !== 'ALL' && t.status !== statusFilter) return false
      if (categoryFilter !== 'ALL' && t.match_type !== categoryFilter) {
        return false
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const hay = `${t.code} ${t.name} ${t.skill_division} ${t.tournament_type}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [tournaments, formatFilter, statusFilter, categoryFilter, searchQuery])

  const toggleCourtSelection = (courtId) => {
    setForm((prev) => {
      const exists = prev.assigned_court_ids.includes(courtId)
      const next = exists
        ? prev.assigned_court_ids.filter((id) => id !== courtId)
        : [...prev.assigned_court_ids, courtId]
      return { ...prev, assigned_court_ids: next }
    })
  }

  const handleCreateSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) {
      showToast({
        type: 'error',
        title: 'Missing Name',
        message: 'Please enter a tournament name.',
      })
      return
    }
    if (courts.length > 0 && form.assigned_court_ids.length === 0) {
      showToast({
        type: 'error',
        title: 'No Courts Selected',
        message: 'Please assign at least one court to the tournament.',
      })
      return
    }

    try {
      const created = await createTournament({
        ...form,
        participants: [],
      })

      pushNotification(
        'Tournament Created',
        `${created.name} (${created.format}) scheduled for ${created.start_date}.`
      )
      showToast({
        type: 'success',
        title: 'Tournament Created',
        message: `${created.name} (${created.code}) is ready.`,
      })
      setCreateOpen(false)
      navigate(`/tournaments/${created.code}`)
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Creation Failed',
        message: err.message || 'Unable to create tournament.',
      })
    }
  }

  const getAssignedCourtsLabel = (courtIds) => {
    if (!Array.isArray(courtIds) || courtIds.length === 0) return 'Unassigned'
    return courtIds
      .map((cid) => {
        const found = courts.find((c) => Number(c.id) === Number(cid))
        return found ? `Court #${found.court_number}` : `Court #${cid}`
      })
      .join(', ')
  }

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="rally-page-title">Tournaments</h1>
          <p className="rally-page-desc mt-0.5">
            Create competitions, organize brackets, and manage tournament
            matches.
          </p>
        </div>

        <Button variant="primary" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          <span>+ Create Tournament</span>
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active Tournaments"
          value={stats.activeCount}
          subtitle="Ongoing or open registration"
          icon={Trophy}
          accent="lime"
        />
        <StatCard
          label="Upcoming Tournaments"
          value={stats.upcomingCount}
          subtitle="Scheduled competitions"
          icon={Calendar}
          accent="teal"
        />
        <StatCard
          label="Registered Players"
          value={stats.totalPlayers}
          subtitle="Confirmed teams & players"
          icon={Users}
          accent="navy"
        />
        <StatCard
          label="Completed Tournaments"
          value={stats.completedCount}
          subtitle="Finalized standings"
          icon={Award}
          accent="success"
        />
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#64748B]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tournament or code..."
              className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#F5F5F0] pl-8 pr-3 text-[12px] text-[#172131] placeholder:text-[#64748B]"
            />
          </div>

          <select
            value={formatFilter}
            onChange={(e) => setFormatFilter(e.target.value)}
            className="rally-focus h-9 rounded-lg border border-[#E5E8E3] bg-[#F5F5F0] px-2.5 text-[12px] text-[#172131]"
          >
            <option value="ALL">All Formats</option>
            {TOURNAMENT_FORMATS.map((fmt) => (
              <option key={fmt} value={fmt}>
                {fmt}
              </option>
            ))}
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rally-focus h-9 rounded-lg border border-[#E5E8E3] bg-[#F5F5F0] px-2.5 text-[12px] text-[#172131]"
          >
            <option value="ALL">All Categories (Singles & Doubles)</option>
            {MATCH_TYPES.map((mt) => (
              <option key={mt} value={mt}>
                {mt}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rally-focus h-9 rounded-lg border border-[#E5E8E3] bg-[#F5F5F0] px-2.5 text-[12px] text-[#172131]"
          >
            <option value="ALL">All Statuses</option>
            {TOURNAMENT_STATUSES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {/* Tournament Table */}
      <Card>
        {filteredTournaments.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title="No tournaments match your filters"
            description="Create a new pickleball tournament or clear your active filter selection."
            action={
              <Button variant="primary" onClick={() => setCreateOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                <span>+ Create Tournament</span>
              </Button>
            }
          />
        ) : (
          <div className="rally-scroll-x">
            <table className="w-full min-w-[820px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[#E5E8E3] bg-[#F5F5F0]/70 text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
                  <th className="px-4 py-3">Tournament Name</th>
                  <th className="px-4 py-3">Format</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Start Date</th>
                  <th className="px-4 py-3">Participants</th>
                  <th className="px-4 py-3">Assigned Courts</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E8E3] text-[12px]">
                {filteredTournaments.map((trn) => {
                  const count = trn.participants?.length || 0
                  const max = trn.max_participants || 8
                  const fillPercent = Math.min(
                    100,
                    Math.round((count / max) * 100)
                  )

                  return (
                    <tr
                      key={trn.id}
                      className="transition-colors hover:bg-[#F5F5F0]/50"
                    >
                      <td className="px-4 py-3.5">
                        <Link
                          to={`/tournaments/${trn.code}`}
                          className="font-semibold text-[#172131] hover:text-[#12B9B0]"
                        >
                          {trn.name}
                        </Link>
                        <p className="mt-0.5 text-[11px] text-[#64748B]">
                          {trn.code} • {trn.tournament_type}
                        </p>
                      </td>

                      <td className="px-4 py-3.5">
                        <span className="inline-flex rounded-md bg-[#253247] px-2 py-0.5 text-[11px] font-medium text-[#FFFFFF]">
                          {trn.format}
                        </span>
                        <p className="mt-0.5 text-[10px] text-[#64748B]">
                          {trn.match_format} • {trn.points_to_win} pts
                        </p>
                      </td>

                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-[#172131]">
                          {trn.match_type}
                        </p>
                        <p className="text-[11px] text-[#12B9B0] font-medium">
                          Division {trn.skill_division}
                        </p>
                      </td>

                      <td className="px-4 py-3.5">
                        <p className="font-medium text-[#172131]">
                          {formatShortDate(trn.start_date)}
                        </p>
                        <p className="text-[10px] text-[#64748B]">
                          Reg deadline: {formatShortDate(trn.registration_deadline)}
                        </p>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[#172131]">
                            {count} / {max}
                          </span>
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[#E5E8E3]">
                            <div
                              className="h-full rounded-full bg-[#12B9B0]"
                              style={{ width: `${fillPercent}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-[#253247] font-medium">
                        {getAssignedCourtsLabel(trn.assigned_court_ids)}
                      </td>

                      <td className="px-4 py-3.5">
                        <Badge status={trn.status}>{trn.status}</Badge>
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => navigate(`/tournaments/${trn.code}`)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>Manage</span>
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create Tournament Modal */}
      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Tournament"
        description="Configure division, bracket format, assigned courts, and match rules."
        size="lg"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-[11px] font-semibold text-[#172131]">
                Tournament Name
              </label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Summer Pickleball Classic 4.5+"
                className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-3 text-[12px] text-[#172131]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-[11px] font-semibold text-[#172131]">
                Description
              </label>
              <textarea
                rows={2}
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="Tournament overview, check-in notes, and division guidelines..."
                className="rally-focus w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] p-2.5 text-[12px] text-[#172131]"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[#172131]">
                Tournament Type
              </label>
              <select
                value={form.tournament_type}
                onChange={(e) =>
                  setForm({ ...form, tournament_type: e.target.value })
                }
                className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-2.5 text-[12px] text-[#172131]"
              >
                <option value="Championship">Championship</option>
                <option value="Club Open">Club Open</option>
                <option value="Invitational">Invitational</option>
                <option value="League Playoff">League Playoff</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[#172131]">
                Singles or Doubles
              </label>
              <select
                value={form.match_type}
                onChange={(e) =>
                  setForm({ ...form, match_type: e.target.value })
                }
                className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-2.5 text-[12px] text-[#172131]"
              >
                {MATCH_TYPES.map((mt) => (
                  <option key={mt} value={mt}>
                    {mt}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[#172131]">
                Skill Division
              </label>
              <select
                value={form.skill_division}
                onChange={(e) =>
                  setForm({ ...form, skill_division: e.target.value })
                }
                className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-2.5 text-[12px] text-[#172131]"
              >
                {SKILL_DIVISIONS.map((sd) => (
                  <option key={sd} value={sd}>
                    Division {sd}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[#172131]">
                Tournament Format
              </label>
              <select
                value={form.format}
                onChange={(e) => setForm({ ...form, format: e.target.value })}
                className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-2.5 text-[12px] text-[#172131]"
              >
                {TOURNAMENT_FORMATS.map((tf) => (
                  <option key={tf} value={tf}>
                    {tf}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[#172131]">
                Registration Deadline
              </label>
              <input
                type="date"
                required
                value={form.registration_deadline}
                onChange={(e) =>
                  setForm({ ...form, registration_deadline: e.target.value })
                }
                className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-2.5 text-[12px] text-[#172131]"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[#172131]">
                Tournament Start Date
              </label>
              <input
                type="date"
                required
                value={form.start_date}
                onChange={(e) =>
                  setForm({ ...form, start_date: e.target.value })
                }
                className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-2.5 text-[12px] text-[#172131]"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[#172131]">
                Maximum Participants
              </label>
              <select
                value={form.max_participants}
                onChange={(e) =>
                  setForm({ ...form, max_participants: Number(e.target.value) })
                }
                className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-2.5 text-[12px] text-[#172131]"
              >
                <option value={4}>4 Teams / Players</option>
                <option value={8}>8 Teams / Players</option>
                <option value={12}>12 Teams / Players</option>
                <option value={16}>16 Teams / Players</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[#172131]">
                Entry Fee (Optional Info Only)
              </label>
              <input
                type="text"
                value={form.entry_fee_info}
                onChange={(e) =>
                  setForm({ ...form, entry_fee_info: e.target.value })
                }
                placeholder="e.g. $40 / Team (Informational Only)"
                className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-3 text-[12px] text-[#172131]"
              />
            </div>
          </div>

          {/* Available Courts Multi-select */}
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold text-[#172131]">
              Assign Available Courts
            </label>
            <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2 sm:grid-cols-3">
              {courts.map((c) => {
                const selected = form.assigned_court_ids.includes(Number(c.id))
                const disabled = !c.is_enabled || c.status === 'Disabled'
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleCourtSelection(Number(c.id))}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left text-[11px] transition-all ${
                      selected
                        ? 'border-[#172131] bg-[#253247] text-[#FFFFFF]'
                        : disabled
                          ? 'cursor-not-allowed border-[#E5E8E3] bg-[#F5F5F0] text-[#AEB8C7]'
                          : 'border-[#E5E8E3] bg-[#FFFFFF] text-[#172131] hover:border-[#253247]'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">
                        Court #{c.court_number}
                      </p>
                      <p
                        className={`truncate text-[10px] ${
                          selected ? 'text-[#D7F66B]' : 'text-[#64748B]'
                        }`}
                      >
                        {c.surface_type}
                      </p>
                    </div>
                    {selected && (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#D7F66B]" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Match Scoring Rules */}
          <div className="rounded-lg border border-[#E5E8E3] bg-[#F5F5F0] p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#253247]">
              Match Scoring Rules
            </p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-[10px] font-medium text-[#64748B]">
                  Match Format
                </label>
                <select
                  value={form.match_format}
                  onChange={(e) =>
                    setForm({ ...form, match_format: e.target.value })
                  }
                  className="h-8 w-full rounded-md border border-[#E5E8E3] bg-[#FFFFFF] px-2 text-[11px] text-[#172131]"
                >
                  {MATCH_FORMATS.map((mf) => (
                    <option key={mf} value={mf}>
                      {mf}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium text-[#64748B]">
                  Scoring Type
                </label>
                <select
                  value={form.scoring_type}
                  onChange={(e) =>
                    setForm({ ...form, scoring_type: e.target.value })
                  }
                  className="h-8 w-full rounded-md border border-[#E5E8E3] bg-[#FFFFFF] px-2 text-[11px] text-[#172131]"
                >
                  {SCORING_TYPES.map((st) => (
                    <option key={st} value={st}>
                      {st} Scoring
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium text-[#64748B]">
                  Points to Win
                </label>
                <select
                  value={form.points_to_win}
                  onChange={(e) =>
                    setForm({ ...form, points_to_win: Number(e.target.value) })
                  }
                  className="h-8 w-full rounded-md border border-[#E5E8E3] bg-[#FFFFFF] px-2 text-[11px] text-[#172131]"
                >
                  {POINTS_OPTIONS.map((pt) => (
                    <option key={pt} value={pt}>
                      Game to {pt}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-[11px] font-medium text-[#172131]">
                <input
                  type="checkbox"
                  checked={form.win_by_two}
                  onChange={(e) =>
                    setForm({ ...form, win_by_two: e.target.checked })
                  }
                  className="h-3.5 w-3.5 rounded accent-[#253247]"
                />
                <span>Win by 2 points</span>
              </label>
            </div>
          </div>

          <div className="flex flex-wrap-reverse items-center justify-end gap-2 border-t border-[#E5E8E3] pt-3 sm:flex-nowrap">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Create Tournament
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

