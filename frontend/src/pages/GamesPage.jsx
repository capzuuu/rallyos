import { useMemo, useState } from 'react'
import {
  Activity,
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  Eye,
  List,
  Monitor,
  Play,
  Plus,
  Radio,
  Search,
  XCircle,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { EmptyState } from '../components/ui/EmptyState'
import { Modal } from '../components/ui/Modal'
import { StatCard } from '../components/ui/StatCard'
import { useRally } from '../hooks/useRally'
import { useToast } from '../hooks/useToast'
import {
  DURATION_OPTIONS,
  GAME_STATUSES,
  MATCH_FORMATS,
  MATCH_TYPES,
  POINTS_OPTIONS,
  SCORING_TYPES,
  TIME_SLOTS,
} from '../utils/constants'
import {
  addDaysStr,
  computeEndTime,
  formatShortDate,
  getTodayStr,
  rangesOverlap,
  timeToMinutes,
} from '../utils/formatters'

function getNowTimeStr() {
  const d = new Date()
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

function findAvailableSlotForCourt(
  court,
  baseDate,
  baseStartTime,
  durationMins,
  existingGames
) {
  if (!court.is_enabled || court.status === 'Disabled') {
    return { available: false, conflictReason: 'Court Disabled' }
  }

  const startDate = baseDate || getTodayStr()
  let candidateStart = baseStartTime || getNowTimeStr()

  for (let dayOffset = 0; dayOffset < 3; dayOffset += 1) {
    const dateToCheck =
      dayOffset === 0 ? startDate : addDaysStr(startDate, dayOffset)
    if (dayOffset > 0) {
      candidateStart = '08:00'
    }

    const hasMaintenanceOnDate =
      court.status === 'Maintenance' &&
      (!court.maintenance_date || court.maintenance_date === dateToCheck)
    const mStart = court.maintenance_start || '00:00'
    const mEnd = court.maintenance_end || '23:59'
    if (hasMaintenanceOnDate && mStart === '00:00' && mEnd === '23:59') {
      if (dayOffset === 0 && !court.maintenance_date) {
        return { available: false, conflictReason: 'Under Maintenance' }
      }
      continue
    }

    for (let step = 0; step < 30; step += 1) {
      const startMin = timeToMinutes(candidateStart)
      if (startMin + durationMins > 23 * 60 + 59) {
        break
      }
      const candidateEnd = computeEndTime(candidateStart, durationMins)

      if (
        hasMaintenanceOnDate &&
        rangesOverlap(candidateStart, candidateEnd, mStart, mEnd)
      ) {
        if (timeToMinutes(mEnd) > startMin) {
          candidateStart = mEnd
          continue
        }
        break
      }

      const conflict = existingGames.find(
        (g) =>
          Number(g.court_id) === Number(court.id) &&
          g.scheduled_date === dateToCheck &&
          (g.status === 'Upcoming' || g.status === 'Live') &&
          rangesOverlap(candidateStart, candidateEnd, g.start_time, g.end_time)
      )

      if (!conflict) {
        return {
          available: true,
          scheduled_date: dateToCheck,
          start_time: candidateStart,
          end_time: candidateEnd,
          conflictReason:
            step > 0 || dayOffset > 0 ? 'Available (Next Slot)' : 'Available',
        }
      }

      const nextStart = conflict.end_time
      if (timeToMinutes(nextStart) <= startMin) {
        break
      }
      candidateStart = nextStart
    }
  }

  return { available: false, conflictReason: 'Maintenance / Fully Booked' }
}

export function GamesPage() {
  const {
    games,
    courts,
    settings,
    getCourtsAvailability,
    createGame,
    updateGame,
    startGame,
    pushNotification,
  } = useRally()
  const toast = useToast()
  const navigate = useNavigate()
  const today = getTodayStr()

  // Filters & View Mode
  const [viewMode, setViewMode] = useState('list')
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [courtFilter, setCourtFilter] = useState('')
  const [matchTypeFilter, setMatchTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // Create Game Modal State
  const [createOpen, setCreateOpen] = useState(false)
  const [calendarPreset, setCalendarPreset] = useState(null)
  const [cancelTarget, setCancelTarget] = useState(null)

  const defaults = settings?.game_defaults || {}
  const [form, setForm] = useState({
    match_type: 'Doubles',
    team_a_name: '',
    team_b_name: '',
    duration_minutes: defaults.duration_minutes || 45,
    court_id: '',
    match_format: defaults.match_format || 'Single Game',
    scoring_type: defaults.scoring_type || 'Side-Out',
    points_to_win: defaults.points_to_win || 11,
    win_by_two: defaults.win_by_two !== false,
  })

  // Summary metrics
  const summary = useMemo(() => {
    return {
      todaysGames: games.filter((g) => g.scheduled_date === today).length,
      liveGames: games.filter((g) => g.status === 'Live').length,
      upcomingGames: games.filter((g) => g.status === 'Upcoming').length,
      completedGames: games.filter((g) => g.status === 'Completed').length,
    }
  }, [games, today])

  // Filtered games
  const filteredGames = useMemo(() => {
    return games.filter((g) => {
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const hay = [
          g.code,
          g.team_a_name,
          g.team_b_name,
          ...(g.team_a_players || []),
          ...(g.team_b_players || []),
        ]
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (dateFilter && g.scheduled_date !== dateFilter) return false
      if (courtFilter && String(g.court_id) !== String(courtFilter)) return false
      if (matchTypeFilter && g.match_type !== matchTypeFilter) return false
      if (statusFilter && g.status !== statusFilter) return false
      return true
    })
  }, [
    games,
    search,
    dateFilter,
    courtFilter,
    matchTypeFilter,
    statusFilter,
  ])

  // Live court availability for the Create Game modal
  const courtAvailability = useMemo(() => {
    const durationMins = Number(form.duration_minutes) || 45
    if (calendarPreset) {
      return getCourtsAvailability(
        calendarPreset.date,
        calendarPreset.time,
        durationMins
      ).map((c) => ({
        ...c,
        scheduled_date: calendarPreset.date,
        start_time: calendarPreset.time,
        end_time: computeEndTime(calendarPreset.time, durationMins),
      }))
    }
    const baseDate = getTodayStr()
    const baseTime = getNowTimeStr()
    return courts.map((court) => {
      const slot = findAvailableSlotForCourt(
        court,
        baseDate,
        baseTime,
        durationMins,
        games
      )
      return {
        ...court,
        ...slot,
      }
    })
  }, [
    calendarPreset,
    getCourtsAvailability,
    courts,
    games,
    form.duration_minutes,
  ])

  const pointOptions = useMemo(() => {
    const vals = new Set(POINTS_OPTIONS)
    const defPt = Number(defaults.points_to_win)
    if (Number.isInteger(defPt) && defPt >= 1) vals.add(defPt)
    const formPt = Number(form.points_to_win)
    if (Number.isInteger(formPt) && formPt >= 1) vals.add(formPt)
    return Array.from(vals).sort((a, b) => a - b)
  }, [defaults.points_to_win, form.points_to_win])

  function openCreateModal() {
    const defaultDuration = Number(defaults.duration_minutes || 45)
    const baseDate = getTodayStr()
    const baseTime = getNowTimeStr()
    const avail = courts.map((court) => ({
      ...court,
      ...findAvailableSlotForCourt(
        court,
        baseDate,
        baseTime,
        defaultDuration,
        games
      ),
    }))
    const firstAvail = avail.find((c) => c.available)
    setCalendarPreset(null)
    setForm((prev) => ({
      ...prev,
      team_a_name: '',
      team_b_name: '',
      duration_minutes: defaultDuration,
      match_format: defaults.match_format || 'Single Game',
      scoring_type: defaults.scoring_type || 'Side-Out',
      points_to_win: Number(defaults.points_to_win || 11),
      win_by_two: defaults.win_by_two !== false,
      court_id: firstAvail ? String(firstAvail.id) : '',
    }))
    setCreateOpen(true)
  }

  async function handleCreateSubmit(e) {
    e.preventDefault()
    const teamAName = form.team_a_name.trim()
    const teamBName = form.team_b_name.trim()
    const durationMins = Number(form.duration_minutes)

    if (!teamAName) {
      toast.error('Please enter a name for Team A.')
      return
    }
    if (!teamBName) {
      toast.error('Please enter a name for Team B.')
      return
    }
    if (!Number.isFinite(durationMins) || durationMins < 5 || durationMins > 480) {
      toast.error('Duration must be between 5 and 480 minutes.')
      return
    }
    if (!form.court_id) {
      toast.error('Please assign an available court.')
      return
    }

    const selectedCourtSlot = courtAvailability.find(
      (c) => String(c.id) === String(form.court_id)
    )
    const targetDate = selectedCourtSlot?.scheduled_date || getTodayStr()
    const targetStart = selectedCourtSlot?.start_time || getNowTimeStr()
    const targetEnd =
      selectedCourtSlot?.end_time || computeEndTime(targetStart, durationMins)

    try {
      const created = await createGame({
        match_type: form.match_type,
        team_a_name: teamAName,
        team_a_players: [],
        team_b_name: teamBName,
        team_b_players: [],
        court_id: Number(form.court_id),
        scheduled_date: targetDate,
        start_time: targetStart,
        end_time: targetEnd,
        duration_minutes: durationMins,
        match_format: form.match_format,
        scoring_type: form.scoring_type,
        points_to_win: Number(form.points_to_win),
        win_by_two: Boolean(form.win_by_two),
      })
      toast.success(
        `${created.code} created on ${created.court_name} (${durationMins} mins).`
      )
      pushNotification(
        `${created.code} Created`,
        `${created.team_a_name} vs ${created.team_b_name} (${created.court_name})`
      )
      setCalendarPreset(null)
      setCreateOpen(false)
    } catch (err) {
      toast.error(err.message || 'Unable to create game.')
    }
  }

  async function handleStartMatch(game) {
    try {
      await startGame(game.code)
      toast.success(`${game.code} is now LIVE on ${game.court_name}.`)
      navigate(`/scorekeeper/${game.code}`)
    } catch (err) {
      toast.error(err.message || 'Unable to start match.')
    }
  }

  async function handleConfirmCancel() {
    if (!cancelTarget) return
    try {
      await updateGame(cancelTarget.code, { status: 'Cancelled' })
      toast.info(`${cancelTarget.code} marked as Cancelled.`)
      setCancelTarget(null)
    } catch (err) {
      toast.error(err.message)
    }
  }

  const calendarDate = dateFilter || today

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="rally-page-title text-[#172131]">Games</h1>
          <p className="rally-page-desc mt-0.5 text-[#253247]/75">
            Create matches, manage players, and track live scores.
          </p>
        </div>
        <Button onClick={openCreateModal} className="w-full sm:w-auto shrink-0">
          <Plus className="h-4 w-4" />
          Create Game
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-3.5 lg:grid-cols-4">
        <StatCard
          label="Today's Games"
          value={summary.todaysGames}
          subtext={formatShortDate(today)}
          icon={CalendarIcon}
        />
        <StatCard
          label="Live Games"
          value={summary.liveGames}
          subtext="Active on courts now"
          icon={Radio}
          highlight
        />
        <StatCard
          label="Upcoming Games"
          value={summary.upcomingGames}
          subtext="Scheduled matches"
          icon={Clock}
        />
        <StatCard
          label="Completed Games"
          value={summary.completedGames}
          subtext="Finalized results"
          icon={CheckCircle2}
        />
      </div>

      {/* Filters & View Switcher */}
      <Card className="p-3 sm:p-3.5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="grid w-full flex-1 grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            <div className="relative lg:col-span-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[#253247]/50" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Team or Game ID..."
                className="w-full rounded-lg border border-[#E5E8E3] bg-[#F5F5F0] py-1.5 pr-3 pl-8 text-[12px] text-[#172131] placeholder:text-[#253247]/50 focus:border-[#253247] focus:bg-[#FFFFFF] focus:outline-none"
              />
            </div>

            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              aria-label="Filter by match date"
              className="w-full rounded-lg border border-[#E5E8E3] bg-[#F5F5F0] px-2.5 py-1.5 text-[12px] text-[#172131] focus:border-[#253247] focus:bg-[#FFFFFF] focus:outline-none"
            />

            <select
              value={courtFilter}
              onChange={(e) => setCourtFilter(e.target.value)}
              aria-label="Filter by court"
              className="w-full rounded-lg border border-[#E5E8E3] bg-[#F5F5F0] px-2.5 py-1.5 text-[12px] text-[#172131] focus:border-[#253247] focus:bg-[#FFFFFF] focus:outline-none"
            >
              <option value="">All Courts</option>
              {courts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <select
              value={matchTypeFilter}
              onChange={(e) => setMatchTypeFilter(e.target.value)}
              aria-label="Filter by match type"
              className="w-full rounded-lg border border-[#E5E8E3] bg-[#F5F5F0] px-2.5 py-1.5 text-[12px] text-[#172131] focus:border-[#253247] focus:bg-[#FFFFFF] focus:outline-none"
            >
              <option value="">All Match Types</option>
              {MATCH_TYPES.map((mt) => (
                <option key={mt} value={mt}>
                  {mt}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by game status"
              className="w-full rounded-lg border border-[#E5E8E3] bg-[#F5F5F0] px-2.5 py-1.5 text-[12px] text-[#172131] focus:border-[#253247] focus:bg-[#FFFFFF] focus:outline-none"
            >
              <option value="">All Statuses</option>
              {GAME_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 xl:justify-end">
            {(search ||
              dateFilter ||
              courtFilter ||
              matchTypeFilter ||
              statusFilter) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearch('')
                    setDateFilter('')
                    setCourtFilter('')
                    setMatchTypeFilter('')
                    setStatusFilter('')
                  }}
                >
                  Reset
                </Button>
              )}

            <div className="inline-flex rounded-lg border border-[#E5E8E3] bg-[#F5F5F0] p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${viewMode === 'list'
                    ? 'bg-[#253247] text-[#D7F66B]'
                    : 'text-[#253247] hover:text-[#172131]'
                  }`}
              >
                <List className="h-3.5 w-3.5" />
                List
              </button>
              <button
                type="button"
                onClick={() => setViewMode('calendar')}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${viewMode === 'calendar'
                    ? 'bg-[#253247] text-[#D7F66B]'
                    : 'text-[#253247] hover:text-[#172131]'
                  }`}
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                Calendar
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* Main List or Calendar View */}
      {viewMode === 'list' ? (
        <Card className="overflow-hidden">
          {filteredGames.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Activity}
                title="No games match your filters"
                description="Clear the active filters or schedule a new pickleball match."
                action={
                  <Button onClick={openCreateModal}>+ Create Game</Button>
                }
              />
            </div>
          ) : (
            <div className="rally-scroll-x">
              <table className="w-full min-w-[780px] divide-y divide-[#E5E8E3] text-left text-[12px]">
                <thead className="bg-[#253247] text-[11px] font-semibold text-[#F1F3F5]">
                  <tr>
                    <th className="px-4 py-3">Game ID</th>
                    <th className="px-4 py-3">Teams</th>
                    <th className="px-3.5 py-3">Match Type</th>
                    <th className="px-3.5 py-3">Assigned Court</th>
                    <th className="px-3.5 py-3">Schedule</th>
                    <th className="px-3.5 py-3">Score</th>
                    <th className="px-3.5 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E8E3] bg-[#FFFFFF]">
                  {filteredGames.map((game) => (
                    <tr
                      key={game.code}
                      className="transition-colors hover:bg-[#F5F5F0]/70"
                    >
                      <td className="px-4 py-3 font-semibold whitespace-nowrap">
                        <Link
                          to={`/games/${game.code}`}
                          className="rounded bg-[#253247] px-2 py-0.5 text-[11px] font-semibold text-[#D7F66B] hover:brightness-110"
                        >
                          {game.code}
                        </Link>
                        {game.tournament_name && (
                          <span className="mt-1 block text-[10px] font-normal text-[#12B9B0]">
                            {game.tournament_name}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`font-semibold ${game.winner_team === 'A'
                                  ? 'text-[#172131] underline decoration-[#D7F66B] decoration-2'
                                  : 'text-[#172131]'
                                }`}
                            >
                              {game.team_a_name}
                            </span>
                            {game.status === 'Live' &&
                              game.serving_team === 'A' && (
                                <span
                                  className="inline-block h-2 w-2 rounded-full bg-[#12B9B0]"
                                  title="Currently Serving"
                                />
                              )}
                          </div>
                          <span className="text-[11px] text-[#253247]/65">
                            vs {game.team_b_name}
                            {game.status === 'Live' &&
                              game.serving_team === 'B' && (
                                <span
                                  className="ml-1.5 inline-block h-2 w-2 rounded-full bg-[#12B9B0]"
                                  title="Currently Serving"
                                />
                              )}
                          </span>
                        </div>
                      </td>

                      <td className="px-3.5 py-3 whitespace-nowrap">
                        <span className="font-medium text-[#172131]">
                          {game.match_type}
                        </span>
                        <span className="block text-[10px] text-[#253247]/65">
                          {game.match_format} • To {game.points_to_win}
                        </span>
                      </td>

                      <td className="px-3.5 py-3 whitespace-nowrap">
                        <span className="font-semibold text-[#172131]">
                          {game.court_name || `Court ${game.court_id}`}
                        </span>
                      </td>

                      <td className="px-3.5 py-3 whitespace-nowrap">
                        <span className="font-medium text-[#172131]">
                          {formatShortDate(game.scheduled_date)}
                        </span>
                        <span className="block text-[11px] text-[#253247]/70">
                          {game.start_time} – {game.end_time}
                        </span>
                      </td>

                      <td className="px-3.5 py-3 whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 rounded-md bg-[#172131] px-2.5 py-1 font-bold text-[#D7F66B]">
                          <span>{game.score_a}</span>
                          <span className="text-[#AEB8C7]">-</span>
                          <span>{game.score_b}</span>
                        </div>
                        {game.match_format !== 'Single Game' && (
                          <span className="mt-0.5 block text-[10px] text-[#253247]/65">
                            Sets: {game.games_won_a}-{game.games_won_b} (G
                            {game.current_game_number})
                          </span>
                        )}
                      </td>

                      <td className="px-3.5 py-3 whitespace-nowrap">
                        <Badge status={game.status} />
                      </td>

                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {game.status === 'Upcoming' && (
                            <Button
                              size="xs"
                              variant="primary"
                              onClick={() => handleStartMatch(game)}
                            >
                              <Play className="h-3 w-3" />
                              Start
                            </Button>
                          )}
                          {game.status === 'Live' && (
                            <Link to={`/scorekeeper/${game.code}`}>
                              <Button size="xs" variant="primary">
                                <Radio className="h-3 w-3" />
                                Scorekeeper
                              </Button>
                            </Link>
                          )}
                          <Link
                            to={`/scoreboard/${game.code}`}
                            title="Open Public TV Scoreboard"
                          >
                            <Button size="xs" variant="navy">
                              <Monitor className="h-3 w-3" />
                              Board
                            </Button>
                          </Link>
                          <Link
                            to={`/games/${game.code}`}
                            title="Game Details"
                          >
                            <Button size="xs" variant="secondary">
                              <Eye className="h-3 w-3" />
                              Details
                            </Button>
                          </Link>
                          {game.status !== 'Completed' &&
                            game.status !== 'Cancelled' && (
                              <button
                                type="button"
                                onClick={() => setCancelTarget(game)}
                                className="rounded-lg p-1 text-[#253247]/60 hover:bg-[#E76B72]/20 hover:text-[#E76B72]"
                                title="Cancel Game"
                              >
                                <XCircle className="h-4 w-4" />
                              </button>
                            )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        /* Calendar View */
        <Card className="overflow-hidden p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="rally-card-heading text-[#172131]">
                Court Schedule Matrix — {formatShortDate(calendarDate)}
              </h2>
              <p className="text-[11px] text-[#253247]/70">
                Click any match card to open Game Details or click an open slot to create a game.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px]">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-[#D7F66B] border border-[#172131]/20" />
                Available
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-[#253247]" />
                Assigned Match
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-[#12B9B0]" />
                Live Game
              </span>
            </div>
          </div>

          <div className="rally-scroll-x">
            <table className="w-full min-w-[960px] border-collapse text-[11px]">
              <thead>
                <tr className="bg-[#253247] text-[#F1F3F5]">
                  <th className="w-44 border border-[#3C485B] px-3 py-2 text-left font-semibold">
                    Court
                  </th>
                  {TIME_SLOTS.slice(0, 12).map((slot) => (
                    <th
                      key={slot}
                      className="min-w-24 border border-[#3C485B] px-2 py-2 text-center font-semibold"
                    >
                      {slot}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {courts.map((court) => (
                  <tr key={court.id}>
                    <td className="border border-[#E5E8E3] bg-[#F5F5F0] px-3 py-2.5 font-semibold text-[#172131]">
                      <div>{court.name}</div>
                      <span className="text-[10px] font-normal text-[#253247]/70">
                        {court.surface_type} • {court.status}
                      </span>
                    </td>
                    {TIME_SLOTS.slice(0, 12).map((slot) => {
                      const slotHour = slot.slice(0, 2)
                      const matchInSlot = games.find(
                        (g) =>
                          Number(g.court_id) === Number(court.id) &&
                          g.scheduled_date === calendarDate &&
                          g.status !== 'Cancelled' &&
                          g.start_time.slice(0, 2) === slotHour
                      )

                      if (matchInSlot) {
                        const isLive = matchInSlot.status === 'Live'
                        return (
                          <td
                            key={slot}
                            className="border border-[#E5E8E3] p-1 align-top"
                          >
                            <Link
                              to={`/games/${matchInSlot.code}`}
                              className={`block rounded-md p-1.5 text-left transition-transform hover:scale-[1.01] ${isLive
                                  ? 'bg-[#12B9B0] text-[#FFFFFF]'
                                  : 'bg-[#253247] text-[#F1F3F5]'
                                }`}
                            >
                              <div className="flex items-center justify-between font-bold">
                                <span>{matchInSlot.code}</span>
                                <span className="text-[#D7F66B]">
                                  {matchInSlot.score_a}-{matchInSlot.score_b}
                                </span>
                              </div>
                              <p className="mt-0.5 truncate text-[10px]">
                                {matchInSlot.team_a_name}
                              </p>
                              <p className="truncate text-[10px] opacity-85">
                                vs {matchInSlot.team_b_name}
                              </p>
                            </Link>
                          </td>
                        )
                      }

                      return (
                        <td
                          key={slot}
                          className="border border-[#E5E8E3] p-1 text-center"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setCalendarPreset({
                                date: calendarDate,
                                time: slot,
                              })
                              setForm((prev) => ({
                                ...prev,
                                team_a_name: '',
                                team_b_name: '',
                                duration_minutes: Number(
                                  defaults.duration_minutes || 45
                                ),
                                match_format:
                                  defaults.match_format || 'Single Game',
                                scoring_type:
                                  defaults.scoring_type || 'Side-Out',
                                points_to_win: Number(
                                  defaults.points_to_win || 11
                                ),
                                win_by_two: defaults.win_by_two !== false,
                                court_id: String(court.id),
                              }))
                              setCreateOpen(true)
                            }}
                            className="w-full rounded-md bg-[#D7F66B]/35 py-2.5 text-[10px] font-semibold text-[#172131] transition-colors hover:bg-[#D7F66B]"
                          >
                            + Assign
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Create Game Modal */}
      <Modal
        open={createOpen}
        onClose={() => {
          setCalendarPreset(null)
          setCreateOpen(false)
        }}
        title="Create Pickleball Game"
        description="Set team names, customize duration, configure rules, and assign an available court."
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          {/* Match Type Toggle */}
          <div>
            <label className="block text-[11px] font-semibold text-[#253247]">
              Match Type
            </label>
            <div className="mt-1 grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
              {MATCH_TYPES.map((mt) => (
                <button
                  key={mt}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, match_type: mt }))}
                  className={`rounded-lg border py-2 text-[12px] font-semibold transition-colors ${form.match_type === mt
                      ? 'border-[#172131] bg-[#D7F66B] text-[#172131]'
                      : 'border-[#E5E8E3] bg-[#F5F5F0] text-[#253247]'
                    }`}
                >
                  {mt} ({mt === 'Doubles' ? '2v2 Teams' : '1v1 Match'})
                </button>
              ))}
            </div>
          </div>

          {/* Team Names */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-[#E5E8E3] bg-[#F5F5F0] p-3">
              <label
                htmlFor="create-game-team-a"
                className="block text-[12px] font-semibold text-[#172131]"
              >
                Team A Name
              </label>
              <input
                id="create-game-team-a"
                type="text"
                required
                value={form.team_a_name}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, team_a_name: e.target.value }))
                }
                placeholder="Enter Team A name"
                className="mt-2 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-2.5 py-1.5 text-[12px] text-[#172131]"
              />
            </div>

            <div className="rounded-xl border border-[#E5E8E3] bg-[#F5F5F0] p-3">
              <label
                htmlFor="create-game-team-b"
                className="block text-[12px] font-semibold text-[#172131]"
              >
                Team B Name
              </label>
              <input
                id="create-game-team-b"
                type="text"
                required
                value={form.team_b_name}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, team_b_name: e.target.value }))
                }
                placeholder="Enter Team B name"
                className="mt-2 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-2.5 py-1.5 text-[12px] text-[#172131]"
              />
            </div>
          </div>

          {/* Custom Match Duration */}
          <div>
            <label
              htmlFor="create-game-duration"
              className="block text-[11px] font-semibold text-[#253247]"
            >
              Duration
            </label>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <div className="flex w-full items-center gap-1.5 sm:w-44">
                <input
                  id="create-game-duration"
                  type="number"
                  min={5}
                  max={480}
                  required
                  value={form.duration_minutes}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      duration_minutes:
                        e.target.value === '' ? '' : Number(e.target.value),
                    }))
                  }
                  placeholder="Minutes (e.g. 45)"
                  className="w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-2.5 py-1.5 text-[12px]"
                />
                <span className="shrink-0 text-[11px] font-medium text-[#64748B]">
                  mins
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {DURATION_OPTIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() =>
                      setForm((prev) => ({ ...prev, duration_minutes: d }))
                    }
                    className={`rounded px-2 py-1 text-[11px] font-semibold transition-colors ${Number(form.duration_minutes) === d
                        ? 'bg-[#253247] text-[#D7F66B]'
                        : 'bg-[#F5F5F0] text-[#253247] hover:bg-[#E5E8E3]'
                      }`}
                  >
                    {d}m
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Available Courts Selector */}
          <div>
            <label className="block text-[11px] font-semibold text-[#253247]">
              Assigned Court
            </label>
            {courtAvailability.length === 0 ? (
              <p className="mt-1.5 rounded-lg border border-[#E5E8E3] bg-[#F5F5F0] px-3 py-2 text-[11px] text-[#64748B]">
                No courts found. Add a court in the Courts page first.
              </p>
            ) : (
              <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                {courtAvailability.map((c) => {
                  const selected = String(form.court_id) === String(c.id)
                  return (
                    <button
                      key={c.id}
                      type="button"
                      disabled={!c.available}
                      onClick={() =>
                        setForm((prev) => ({ ...prev, court_id: String(c.id) }))
                      }
                      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-[12px] transition-all ${!c.available
                          ? 'cursor-not-allowed border-[#E76B72]/50 bg-[#E76B72]/10 text-[#253247]/55'
                          : selected
                            ? 'border-[#172131] bg-[#D7F66B] font-semibold text-[#172131]'
                            : 'border-[#E5E8E3] bg-[#FFFFFF] text-[#172131] hover:bg-[#F5F5F0]'
                        }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{c.name}</p>
                        <p className="truncate text-[10px] opacity-80">
                          {c.surface_type} • {c.conflictReason}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${c.available
                            ? 'bg-[#253247] text-[#D7F66B]'
                            : 'bg-[#E76B72] text-[#FFFFFF]'
                          }`}
                      >
                        {c.available ? 'OPEN' : 'BUSY'}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Match Format & Scoring Rules */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-[11px] font-semibold text-[#253247]">
                Match Format
              </label>
              <select
                value={form.match_format}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    match_format: e.target.value,
                  }))
                }
                className="mt-1 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-2.5 py-1.5 text-[12px]"
              >
                {MATCH_FORMATS.map((mf) => (
                  <option key={mf} value={mf}>
                    {mf}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#253247]">
                Scoring System
              </label>
              <select
                value={form.scoring_type}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    scoring_type: e.target.value,
                  }))
                }
                className="mt-1 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-2.5 py-1.5 text-[12px]"
              >
                {SCORING_TYPES.map((st) => (
                  <option key={st} value={st}>
                    {st} Scoring
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#253247]">
                Points to Win
              </label>
              <select
                value={form.points_to_win}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    points_to_win: Number(e.target.value),
                  }))
                }
                className="mt-1 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-2.5 py-1.5 text-[12px]"
              >
                {pointOptions.map((pt) => (
                  <option key={pt} value={pt}>
                    Game to {pt}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end pb-1.5">
              <label className="inline-flex cursor-pointer items-center gap-2 text-[12px] font-semibold text-[#172131]">
                <input
                  type="checkbox"
                  checked={form.win_by_two}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      win_by_two: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded border-[#3C485B] accent-[#253247]"
                />
                Win by 2 points
              </label>
            </div>
          </div>

          <div className="flex flex-wrap-reverse justify-end gap-2 border-t border-[#E5E8E3] pt-3.5 sm:flex-nowrap">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Create Game
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        onConfirm={handleConfirmCancel}
        title="Cancel Match"
        message={`Cancel ${cancelTarget?.code} (${cancelTarget?.team_a_name} vs ${cancelTarget?.team_b_name})? This will release ${cancelTarget?.court_name}.`}
        confirmText="Cancel Match"
      />
    </div>
  )
}

