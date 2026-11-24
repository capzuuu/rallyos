import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Activity,
  Calendar,
  CheckCircle2,
  Edit3,
  Eye,
  History,
  MapPin,
  Monitor,
  Play,
  Plus,
  Power,
  Radio,
  ShieldAlert,
  Wrench,
} from 'lucide-react'
import { useRally } from '../hooks/useRally'
import { useToast } from '../hooks/useToast'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Modal from '../components/ui/Modal'
import StatCard from '../components/ui/StatCard'
import {
  COURT_STATUSES,
  COURT_SURFACES,
  DURATION_OPTIONS,
  TIME_SLOTS,
} from '../utils/constants'
import {
  computeEndTime,
  extractErrorMessage,
  formatShortDate,
  getTodayStr,
} from '../utils/formatters'

export default function CourtsPage() {
  const navigate = useNavigate()
  const {
    courts,
    games,
    settings,
    addCourt,
    updateCourt,
    updateGame,
    createGame,
    startGame,
    getCourtsAvailability,
    pushNotification,
  } = useRally()
  const { showToast } = useToast()

  const today = getTodayStr()

  // Court & Match Filter State
  const [surfaceFilter, setSurfaceFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [matchStatusFilter, setMatchStatusFilter] = useState('ALL')
  const [matchCourtFilter, setMatchCourtFilter] = useState('ALL')

  // Add / Edit Court Modal
  const [courtModalOpen, setCourtModalOpen] = useState(false)
  const [editingCourt, setEditingCourt] = useState(null)
  const [isSavingCourt, setIsSavingCourt] = useState(false)
  const [courtForm, setCourtForm] = useState({
    court_number: 1,
    name: '',
    surface_type: 'Indoor',
    status: 'Available',
    is_enabled: true,
  })

  // Maintenance Schedule Modal
  const [maintenanceCourt, setMaintenanceCourt] = useState(null)
  const [maintenanceForm, setMaintenanceForm] = useState({
    status: 'Maintenance',
    maintenance_note: '',
    maintenance_date: today,
    maintenance_start: '13:00',
    maintenance_end: '16:00',
  })

  // Court History & Schedule Modal
  const [historyCourt, setHistoryCourt] = useState(null)

  // 6-Step Court Assignment Workflow Modal
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [assignForm, setAssignForm] = useState({
    scheduled_date: today,
    start_time: '11:00',
    duration_minutes: 45,
    court_id: '',
    assignment_mode: 'existing', // 'existing' | 'new'
    existing_game_id: '',
    match_type: 'Doubles',
    team_a_name: '',
    team_b_name: '',
  })

  // Summary Stats
  const stats = useMemo(() => {
    const total = courts.length
    const available = courts.filter(
      (c) => c.is_enabled && c.status === 'Available' && !c.current_game
    ).length
    const occupied = courts.filter(
      (c) => c.status === 'Occupied' || Boolean(c.current_game)
    ).length
    const maintenance = courts.filter(
      (c) => c.status === 'Maintenance' || !c.is_enabled || c.status === 'Disabled'
    ).length
    return { total, available, occupied, maintenance }
  }, [courts])

  const filteredCourts = useMemo(() => {
    return courts.filter((c) => {
      if (surfaceFilter !== 'ALL' && c.surface_type !== surfaceFilter) {
        return false
      }
      if (statusFilter !== 'ALL' && c.status !== statusFilter) {
        return false
      }
      return true
    })
  }, [courts, surfaceFilter, statusFilter])

  const courtById = useMemo(() => {
    const map = new Map()
    courts.forEach((c) => map.set(Number(c.id), c))
    return map
  }, [courts])

  // Real-time availability for the 6-step Court Assignment workflow
  const assignAvailability = useMemo(() => {
    return getCourtsAvailability(
      assignForm.scheduled_date,
      assignForm.start_time,
      Number(assignForm.duration_minutes) || 45,
      assignForm.assignment_mode === 'existing'
        ? assignForm.existing_game_id
        : null
    )
  }, [
    getCourtsAvailability,
    assignForm.scheduled_date,
    assignForm.start_time,
    assignForm.duration_minutes,
    assignForm.assignment_mode,
    assignForm.existing_game_id,
  ])

  const assignableUpcomingGames = useMemo(() => {
    return games.filter((g) => g.status === 'Upcoming')
  }, [games])

  const courtScopedGames = useMemo(() => {
    return games.filter((g) => {
      if (g.status === 'Cancelled') return false
      if (
        matchCourtFilter !== 'ALL' &&
        String(g.court_id) !== String(matchCourtFilter)
      ) {
        return false
      }
      return true
    })
  }, [games, matchCourtFilter])

  const matchStatusCounts = useMemo(() => {
    const counts = { ALL: 0, Live: 0, Upcoming: 0, Completed: 0 }
    courtScopedGames.forEach((g) => {
      counts.ALL += 1
      if (g.status in counts) counts[g.status] += 1
    })
    return counts
  }, [courtScopedGames])

  const courtMatches = useMemo(() => {
    const statusPriority = { Live: 0, Upcoming: 1, Completed: 2 }
    return courtScopedGames
      .filter(
        (g) => matchStatusFilter === 'ALL' || g.status === matchStatusFilter
      )
      .slice()
      .sort((a, b) => {
        const pA = statusPriority[a.status] ?? 9
        const pB = statusPriority[b.status] ?? 9
        if (pA !== pB) return pA - pB
        const cA = courtById.get(Number(a.court_id))?.court_number ?? 999
        const cB = courtById.get(Number(b.court_id))?.court_number ?? 999
        if (cA !== cB) return cA - cB
        return Number(b.id) - Number(a.id)
      })
  }, [courtScopedGames, matchStatusFilter, courtById])

  // Handlers
  const handleOpenAddCourt = () => {
    const usedNumbers = new Set(courts.map((c) => Number(c.court_number)))
    let nextNum =
      courts.reduce((m, c) => Math.max(m, Number(c.court_number) || 0), 0) + 1
    if (nextNum > 99) {
      nextNum = 1
      while (usedNumbers.has(nextNum) && nextNum <= 99) {
        nextNum += 1
      }
    }
    setEditingCourt(null)
    setCourtForm({
      court_number: nextNum,
      name: `Court #${nextNum}`,
      surface_type: 'Indoor',
      status: 'Available',
      is_enabled: true,
    })
    setCourtModalOpen(true)
  }

  const handleOpenEditCourt = (court) => {
    setEditingCourt(court)
    setCourtForm({
      court_number: court.court_number,
      name: court.name,
      surface_type: court.surface_type,
      status: court.status,
      is_enabled: court.is_enabled !== false,
    })
    setCourtModalOpen(true)
  }

  const handleSaveCourt = async (e) => {
    e.preventDefault()
    if (isSavingCourt) return

    const parsedNum = Number(courtForm.court_number)
    const trimmedName = courtForm.name.trim()
    if (!Number.isInteger(parsedNum) || parsedNum < 1 || parsedNum > 99) {
      showToast({
        type: 'error',
        title: 'Invalid Court Number',
        message: 'Court number must be a whole number between 1 and 99.',
      })
      return
    }
    if (trimmedName.length < 2) {
      showToast({
        type: 'error',
        title: 'Invalid Court Name',
        message: 'Court name must be at least 2 characters.',
      })
      return
    }

    setIsSavingCourt(true)
    try {
      if (editingCourt) {
        await updateCourt(editingCourt.id, {
          court_number: parsedNum,
          name: trimmedName,
          surface_type: courtForm.surface_type,
          status: courtForm.is_enabled ? courtForm.status : 'Disabled',
          is_enabled: courtForm.is_enabled,
        })
        showToast({
          type: 'success',
          title: 'Court Updated',
          message: `${trimmedName} updated.`,
        })
      } else {
        await addCourt({
          court_number: parsedNum,
          name: trimmedName,
          surface_type: courtForm.surface_type,
          status: 'Available',
          is_enabled: true,
        })
        showToast({
          type: 'success',
          title: 'Court Added',
          message: `Court #${parsedNum} (${trimmedName}) added.`,
        })
      }
      setCourtModalOpen(false)
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Court Error',
        message: extractErrorMessage(err),
      })
    } finally {
      setIsSavingCourt(false)
    }
  }

  const handleToggleEnableCourt = async (court) => {
    const nextEnabled = !court.is_enabled
    try {
      await updateCourt(court.id, {
        is_enabled: nextEnabled,
        status: nextEnabled ? 'Available' : 'Disabled',
      })
      showToast({
        type: 'info',
        title: nextEnabled ? 'Court Enabled' : 'Court Disabled',
        message: `${court.name} is now ${nextEnabled ? 'Available' : 'Disabled'}.`,
      })
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Court Error',
        message: extractErrorMessage(err),
      })
    }
  }

  const handleOpenMaintenanceModal = (court) => {
    setMaintenanceCourt(court)
    setMaintenanceForm({
      status: court.status === 'Maintenance' ? 'Maintenance' : 'Maintenance',
      maintenance_note:
        court.maintenance_note || 'Net tension calibration & surface cleaning',
      maintenance_date: court.maintenance_date || today,
      maintenance_start: court.maintenance_start || '13:00',
      maintenance_end: court.maintenance_end || '16:00',
    })
  }

  const handleSaveMaintenance = async (e) => {
    e.preventDefault()
    if (!maintenanceCourt) return
    const clearing = maintenanceForm.status === 'Available'
    try {
      await updateCourt(maintenanceCourt.id, {
        status: clearing ? 'Available' : 'Maintenance',
        is_enabled: true,
        maintenance_note: clearing ? '' : maintenanceForm.maintenance_note,
        maintenance_date: clearing ? '' : maintenanceForm.maintenance_date,
        maintenance_start: clearing ? '' : maintenanceForm.maintenance_start,
        maintenance_end: clearing ? '' : maintenanceForm.maintenance_end,
      })
      showToast({
        type: 'success',
        title: clearing ? 'Maintenance Cleared' : 'Maintenance Scheduled',
        message: clearing
          ? `${maintenanceCourt.name} returned to Available status.`
          : `${maintenanceCourt.name} blocked for ${maintenanceForm.maintenance_date} (${maintenanceForm.maintenance_start}–${maintenanceForm.maintenance_end}).`,
      })
      setMaintenanceCourt(null)
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Court Error',
        message: extractErrorMessage(err),
      })
    }
  }

  const handleOpenAssignModal = (courtId = 1, dateStr = today, timeStr = '11:00') => {
    const firstUpcoming = assignableUpcomingGames[0]?.id || ''
    const gameDefaults = settings?.game_defaults || {}
    setAssignForm((prev) => ({
      ...prev,
      scheduled_date: dateStr,
      start_time: timeStr,
      duration_minutes: Number(gameDefaults.duration_minutes || 45),
      court_id: Number(courtId),
      existing_game_id: firstUpcoming,
      assignment_mode: firstUpcoming ? 'existing' : 'new',
    }))
    setAssignModalOpen(true)
  }

  const handleConfirmCourtAssignment = async (e) => {
    e.preventDefault()
    const targetCourt = assignAvailability.find(
      (c) => Number(c.id) === Number(assignForm.court_id)
    )
    if (!targetCourt || !targetCourt.available) {
      showToast({
        type: 'error',
        title: 'Conflicting Court Assignment',
        message: targetCourt?.conflictReason || 'Selected court is unavailable.',
      })
      return
    }

    try {
      if (
        assignForm.assignment_mode === 'existing' &&
        assignForm.existing_game_id
      ) {
        await updateGame(assignForm.existing_game_id, {
          court_id: Number(assignForm.court_id),
          scheduled_date: assignForm.scheduled_date,
          start_time: assignForm.start_time,
          duration_minutes: Number(assignForm.duration_minutes),
        })
        pushNotification(
          'Court Assigned',
          `Match assigned to ${targetCourt.name} at ${assignForm.start_time}.`
        )
        showToast({
          type: 'success',
          title: 'Match Assigned to Court',
          message: `Scheduled on ${targetCourt.name} (${assignForm.scheduled_date} • ${assignForm.start_time}).`,
        })
      } else {
        const gameDefaults = settings?.game_defaults || {}
        const created = await createGame({
          match_type: assignForm.match_type,
          team_a_name: assignForm.team_a_name.trim(),
          team_a_players: [],
          team_b_name: assignForm.team_b_name.trim(),
          team_b_players: [],
          court_id: Number(assignForm.court_id),
          scheduled_date: assignForm.scheduled_date,
          start_time: assignForm.start_time,
          duration_minutes:
            Number(assignForm.duration_minutes) ||
            Number(gameDefaults.duration_minutes || 45),
          match_format: gameDefaults.match_format || 'Single Game',
          scoring_type: gameDefaults.scoring_type || 'Side-Out',
          points_to_win: Number(gameDefaults.points_to_win || 11),
          win_by_two: gameDefaults.win_by_two !== false,
        })
        pushNotification(
          'Court Assigned',
          `${created.code} scheduled on ${targetCourt.name} at ${assignForm.start_time}.`
        )
        showToast({
          type: 'success',
          title: 'New Match Assigned',
          message: `${created.code} created on ${targetCourt.name}.`,
        })
      }
      setAssignModalOpen(false)
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Assignment Blocked',
        message: extractErrorMessage(err),
      })
    }
  }

  const handleStartQueuedMatch = async (game) => {
    try {
      await startGame(game.code)
      showToast({
        type: 'success',
        title: 'Match Started',
        message: `${game.code} is now LIVE on ${game.court_name || 'Court'}.`,
      })
      navigate(`/scorekeeper/${game.code}`)
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Unable to Start Match',
        message: extractErrorMessage(err),
      })
    }
  }

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="rally-page-title">Courts</h1>
          <p className="rally-page-desc mt-0.5">
            Manage court availability, queues, and match assignments.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={() =>
              handleOpenAssignModal(courts[0]?.id || '', today, '11:00')
            }
          >
            <Calendar className="h-3.5 w-3.5" />
            <span>Assign Match to Court</span>
          </Button>
          <Button variant="primary" onClick={handleOpenAddCourt}>
            <Plus className="h-4 w-4" />
            <span>Add Court</span>
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Courts"
          value={stats.total}
          subtitle="Indoor & outdoor courts"
          icon={MapPin}
          accent="navy"
        />
        <StatCard
          label="Available Courts"
          value={stats.available}
          subtitle="Open for immediate play"
          icon={CheckCircle2}
          accent="lime"
        />
        <StatCard
          label="Occupied Courts"
          value={stats.occupied}
          subtitle="Active live matches"
          icon={Activity}
          accent="teal"
        />
        <StatCard
          label="Maintenance Courts"
          value={stats.maintenance}
          subtitle="Scheduled service or disabled"
          icon={Wrench}
          accent="danger"
        />
      </div>

      {/* Filters for Court Cards */}
      <Card className="p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:gap-2.5">
            <select
              value={surfaceFilter}
              onChange={(e) => setSurfaceFilter(e.target.value)}
              className="rally-focus h-9 w-full max-w-full rounded-lg border border-[#E5E8E3] bg-[#F5F5F0] px-3 text-[12px] font-medium text-[#172131] sm:w-auto"
            >
              <option value="ALL">All Surfaces (Indoor & Outdoor)</option>
              {COURT_SURFACES.map((s) => (
                <option key={s} value={s}>
                  {s} Courts
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rally-focus h-9 w-full max-w-full rounded-lg border border-[#E5E8E3] bg-[#F5F5F0] px-3 text-[12px] font-medium text-[#172131] sm:w-auto"
            >
              <option value="ALL">All Court Statuses</option>
              {COURT_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] font-medium text-[#64748B]">
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
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-xs bg-[#E76B72]" />
              Maintenance / Disabled
            </span>
          </div>
        </div>
      </Card>

      {/* Court Management Card Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredCourts.map((court) => {
          const liveGame = court.current_game
          const nextMatch = court.next_scheduled_match
          const isOccupied = Boolean(liveGame) || court.status === 'Occupied'
          const isMaint =
            court.status === 'Maintenance' ||
            !court.is_enabled ||
            court.status === 'Disabled'

          return (
            <div
              key={court.id}
              className={`flex flex-col justify-between rounded-xl border bg-[#FFFFFF] p-4 shadow-2xs transition-all ${liveGame
                  ? 'border-[#12B9B0] ring-1 ring-[#12B9B0]/30'
                  : isMaint
                    ? 'border-[#E76B72]/50'
                    : 'border-[#E5E8E3]'
                }`}
            >
              <div>
                {/* Card Top Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <span
                      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[13px] font-extrabold ${liveGame
                          ? 'bg-[#12B9B0] text-[#172131]'
                          : isMaint
                            ? 'bg-[#E76B72]/20 text-[#E76B72]'
                            : 'bg-[#253247] text-[#D7F66B]'
                        }`}
                    >
                      #{court.court_number}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-[14px] font-semibold text-[#172131]">
                        {court.name}
                      </h3>
                      <p className="text-[11px] font-medium text-[#64748B]">
                        Court #{court.court_number} • {court.surface_type}
                      </p>
                    </div>
                  </div>

                  <Badge status={liveGame ? 'Occupied' : court.status}>
                    {liveGame ? 'Occupied' : court.status}
                  </Badge>
                </div>

                {/* Current Live Game Box */}
                <div className="mt-3.5 space-y-2">
                  {liveGame ? (
                    <div className="rounded-lg bg-[#172131] p-3 text-[#FFFFFF]">
                      <div className="flex flex-wrap items-center justify-between gap-1 text-[10px]">
                        <span className="inline-flex items-center gap-1 font-bold uppercase tracking-wider text-[#12B9B0]">
                          <Radio className="h-3 w-3 animate-pulse" />
                          Current Game ({liveGame.code})
                        </span>
                        <span className="font-bold text-[#D7F66B]">
                          {liveGame.score_a} – {liveGame.score_b}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-[12px] font-semibold">
                        {liveGame.team_a_name} vs {liveGame.team_b_name}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Link
                          to={`/scorekeeper/${liveGame.code}`}
                          className="rounded bg-[#D7F66B] px-2.5 py-1 text-[10px] font-bold text-[#172131] hover:bg-[#c8ea57]"
                        >
                          Open Scorekeeper
                        </Link>
                        <Link
                          to={`/scoreboard/${liveGame.code}`}
                          className="rounded bg-[#253247] px-2.5 py-1 text-[10px] font-semibold text-[#F1F3F5] hover:text-[#D7F66B]"
                        >
                          TV Scoreboard
                        </Link>
                      </div>
                    </div>
                  ) : isMaint ? (
                    <div className="rounded-lg border border-[#E76B72]/40 bg-[#E76B72]/10 p-3">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#991B1B]">
                        <ShieldAlert className="h-3.5 w-3.5 text-[#E76B72]" />
                        <span>
                          {court.status === 'Disabled' || !court.is_enabled
                            ? 'Court Disabled'
                            : `Maintenance (${court.maintenance_start || 'All Day'}–${court.maintenance_end || ''})`}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-[#64748B]">
                        {court.maintenance_note ||
                          'Unavailable for match assignments.'}
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-[#A6D957]/50 bg-[#D7F66B]/20 p-3">
                      <p className="text-[11px] font-semibold text-[#172131]">
                        Current Game: None — Ready for Play
                      </p>
                      <p className="text-[11px] text-[#253247]">
                        Court is open for immediate match assignment.
                      </p>
                    </div>
                  )}

                  {/* Next Scheduled Match */}
                  <div className="rounded-lg border border-[#E5E8E3] bg-[#F5F5F0]/70 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#64748B]">
                      Next Scheduled Match
                    </p>
                    {nextMatch ? (
                      <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px]">
                        <span className="truncate font-semibold text-[#172131]">
                          {nextMatch.code}: {nextMatch.team_a_name} vs{' '}
                          {nextMatch.team_b_name}
                        </span>
                        <span className="shrink-0 font-bold text-[#12B9B0]">
                          {nextMatch.start_time}
                        </span>
                      </div>
                    ) : (
                      <p className="mt-0.5 text-[11px] text-[#64748B]">
                        No upcoming matches queued
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Court Action Footer */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#E5E8E3] pt-3">
                <div className="flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleOpenEditCourt(court)}
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-[#E5E8E3] bg-[#FFFFFF] px-2 text-[11px] font-medium text-[#172131] hover:bg-[#F5F5F0]"
                    title="Edit Court Details"
                  >
                    <Edit3 className="h-3 w-3" />
                    <span>Edit</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenMaintenanceModal(court)}
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-[#E5E8E3] bg-[#FFFFFF] px-2 text-[11px] font-medium text-[#172131] hover:bg-[#F5F5F0]"
                    title="Set Maintenance Schedule"
                  >
                    <Wrench className="h-3 w-3" />
                    <span>Maint.</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleToggleEnableCourt(court)}
                    className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-medium ${court.is_enabled
                        ? 'border-[#E5E8E3] bg-[#FFFFFF] text-[#64748B] hover:text-[#E76B72]'
                        : 'border-[#A6D957] bg-[#A6D957]/20 text-[#172131]'
                      }`}
                    title={court.is_enabled ? 'Disable Court' : 'Enable Court'}
                  >
                    <Power className="h-3 w-3" />
                    <span>{court.is_enabled ? 'Disable' : 'Enable'}</span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setHistoryCourt(court)}
                    className="inline-flex h-7 items-center gap-1 rounded-md bg-[#F5F5F0] px-2 text-[11px] font-semibold text-[#253247] hover:bg-[#E5E8E3]"
                    title="View Court Schedule & Match History"
                  >
                    <History className="h-3 w-3" />
                    <span>History</span>
                  </button>

                  <button
                    type="button"
                    disabled={isMaint || isOccupied}
                    onClick={() =>
                      handleOpenAssignModal(court.id, today, '11:00')
                    }
                    className="inline-flex h-7 items-center gap-1 rounded-md bg-[#D7F66B] px-2.5 text-[11px] font-bold text-[#172131] hover:bg-[#c8ea57] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Assign</span>
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* COURT MATCHES & QUEUE */}
      <Card
        title="Court Matches & Queue"
        subtitle="Live, upcoming, and completed pickleball games assigned across your courts"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={matchCourtFilter}
              onChange={(e) => setMatchCourtFilter(e.target.value)}
              aria-label="Filter matches by court"
              className="rally-focus h-8 w-full max-w-full rounded-lg border border-[#E5E8E3] bg-[#F5F5F0] px-2.5 text-[11px] font-semibold text-[#172131] sm:w-auto"
            >
              <option value="ALL">All Courts</option>
              {courts.map((c) => (
                <option key={c.id} value={c.id}>
                  Court #{c.court_number} — {c.name}
                </option>
              ))}
            </select>

            <div className="inline-flex flex-wrap rounded-lg border border-[#E5E8E3] bg-[#F5F5F0] p-0.5">
              {[
                { key: 'ALL', label: `All (${matchStatusCounts.ALL})` },
                { key: 'Live', label: `Live (${matchStatusCounts.Live})` },
                {
                  key: 'Upcoming',
                  label: `Upcoming (${matchStatusCounts.Upcoming})`,
                },
                {
                  key: 'Completed',
                  label: `Completed (${matchStatusCounts.Completed})`,
                },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setMatchStatusFilter(tab.key)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all ${
                    matchStatusFilter === tab.key
                      ? 'bg-[#253247] text-[#D7F66B]'
                      : 'text-[#64748B] hover:text-[#172131]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        }
      >
        {courtMatches.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-[13px] font-semibold text-[#172131]">
              {matchStatusFilter !== 'ALL' || matchCourtFilter !== 'ALL'
                ? 'No court matches match your current filter.'
                : 'No matches have been assigned to your courts yet.'}
            </p>
            <p className="mt-1 text-[11px] text-[#64748B]">
              {matchStatusFilter !== 'ALL' || matchCourtFilter !== 'ALL'
                ? 'Reset the filters or assign a match to an available court.'
                : 'Create a game or assign an upcoming match to a court to see it here.'}
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {(matchStatusFilter !== 'ALL' || matchCourtFilter !== 'ALL') && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setMatchStatusFilter('ALL')
                    setMatchCourtFilter('ALL')
                  }}
                >
                  Reset Filters
                </Button>
              )}
              <Button
                size="sm"
                variant="primary"
                onClick={() =>
                  handleOpenAssignModal(
                    matchCourtFilter !== 'ALL'
                      ? Number(matchCourtFilter)
                      : courts[0]?.id || '',
                    today,
                    '11:00'
                  )
                }
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Assign Match</span>
              </Button>
            </div>
          </div>
        ) : (
          <div className="rally-scroll-x">
            <table className="w-full min-w-[780px] divide-y divide-[#E5E8E3] text-left text-[12px]">
              <thead className="bg-[#253247] text-[11px] font-semibold text-[#F1F3F5]">
                <tr>
                  <th className="px-4 py-3">Court</th>
                  <th className="px-3.5 py-3">Game ID</th>
                  <th className="px-4 py-3">Teams</th>
                  <th className="px-3.5 py-3">Rules &amp; Duration</th>
                  <th className="px-3.5 py-3">Score</th>
                  <th className="px-3.5 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E8E3] bg-[#FFFFFF]">
                {courtMatches.map((game) => {
                  const courtInfo = courtById.get(Number(game.court_id))
                  return (
                    <tr
                      key={game.id || game.code}
                      className="transition-colors hover:bg-[#F5F5F0]/70"
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-semibold text-[#172131]">
                          {courtInfo
                            ? `Court #${courtInfo.court_number} — ${courtInfo.name}`
                            : game.court_name || 'Unassigned'}
                        </div>
                        {courtInfo && (
                          <span className="block text-[10px] text-[#64748B]">
                            {courtInfo.surface_type} • {courtInfo.status}
                          </span>
                        )}
                      </td>

                      <td className="px-3.5 py-3 whitespace-nowrap">
                        <Link
                          to={`/games/${game.code}`}
                          className="rounded bg-[#253247] px-2 py-0.5 text-[11px] font-semibold text-[#D7F66B] hover:brightness-110"
                        >
                          {game.code}
                        </Link>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-[#172131]">
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
                          {game.match_type} • {game.match_format}
                        </span>
                        <span className="block text-[10px] text-[#64748B]">
                          {game.scoring_type} • To {game.points_to_win} pts •{' '}
                          {game.duration_minutes} mins
                        </span>
                      </td>

                      <td className="px-3.5 py-3 whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 rounded-md bg-[#172131] px-2.5 py-1 font-bold text-[#D7F66B]">
                          <span>{game.score_a}</span>
                          <span className="text-[#AEB8C7]">-</span>
                          <span>{game.score_b}</span>
                        </div>
                        {game.match_format !== 'Single Game' && (
                          <span className="mt-0.5 block text-[10px] text-[#64748B]">
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
                              onClick={() => handleStartQueuedMatch(game)}
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
                            <Button size="xs" variant="outline">
                              <Eye className="h-3 w-3" />
                              Details
                            </Button>
                          </Link>
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

      {/* Add / Edit Court Modal */}
      <Modal
        isOpen={courtModalOpen}
        onClose={() => setCourtModalOpen(false)}
        title={editingCourt ? 'Edit Court Details' : 'Add New Pickleball Court'}
        description={
          editingCourt
            ? 'Configure court number, display name, surface environment, and operational status.'
            : 'Configure court number, display name, and surface environment.'
        }
        size="md"
      >
        <form onSubmit={handleSaveCourt} className="space-y-3.5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[#172131]">
                Court Number
              </label>
              <input
                type="number"
                min={1}
                max={99}
                required
                value={courtForm.court_number}
                onChange={(e) =>
                  setCourtForm({
                    ...courtForm,
                    court_number: Number(e.target.value),
                  })
                }
                className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-3 text-[12px] text-[#172131]"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[#172131]">
                Indoor or Outdoor
              </label>
              <select
                value={courtForm.surface_type}
                onChange={(e) =>
                  setCourtForm({ ...courtForm, surface_type: e.target.value })
                }
                className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-2.5 text-[12px] text-[#172131]"
              >
                {COURT_SURFACES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[#172131]">
              Court Name
            </label>
            <input
              type="text"
              required
              value={courtForm.name}
              onChange={(e) =>
                setCourtForm({ ...courtForm, name: e.target.value })
              }
              placeholder="e.g. Championship Court #7"
              className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-3 text-[12px] text-[#172131]"
            />
          </div>

          {editingCourt && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-[#172131]">
                  Operational Status
                </label>
                <select
                  value={courtForm.status}
                  onChange={(e) =>
                    setCourtForm({ ...courtForm, status: e.target.value })
                  }
                  className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-2.5 text-[12px] text-[#172131]"
                >
                  {COURT_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end pb-1.5">
                <label className="flex items-center gap-2 text-[12px] font-medium text-[#172131]">
                  <input
                    type="checkbox"
                    checked={courtForm.is_enabled}
                    onChange={(e) =>
                      setCourtForm({
                        ...courtForm,
                        is_enabled: e.target.checked,
                      })
                    }
                    className="h-4 w-4 rounded accent-[#253247]"
                  />
                  <span>Court Enabled for Bookings</span>
                </label>
              </div>
            </div>
          )}

          <div className="flex flex-wrap-reverse items-center justify-end gap-2 border-t border-[#E5E8E3] pt-3 sm:flex-nowrap">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setCourtModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isSavingCourt}>
              {isSavingCourt
                ? 'Saving...'
                : editingCourt
                  ? 'Save Changes'
                  : 'Add Court'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Maintenance Schedule Modal */}
      <Modal
        isOpen={Boolean(maintenanceCourt)}
        onClose={() => setMaintenanceCourt(null)}
        title={`Maintenance Schedule — ${maintenanceCourt?.name || ''}`}
        description="Block court time slots for resurfacing, net adjustments, or lighting service."
        size="md"
      >
        {maintenanceCourt && (
          <form onSubmit={handleSaveMaintenance} className="space-y-3.5">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[#172131]">
                Court Action
              </label>
              <select
                value={maintenanceForm.status}
                onChange={(e) =>
                  setMaintenanceForm({
                    ...maintenanceForm,
                    status: e.target.value,
                  })
                }
                className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-2.5 text-[12px] font-semibold text-[#172131]"
              >
                <option value="Maintenance">
                  Place Court Under Maintenance
                </option>
                <option value="Available">
                  Clear Maintenance & Mark Available
                </option>
              </select>
            </div>

            {maintenanceForm.status === 'Maintenance' && (
              <>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-[#172131]">
                    Maintenance Reason / Note
                  </label>
                  <input
                    type="text"
                    required
                    value={maintenanceForm.maintenance_note}
                    onChange={(e) =>
                      setMaintenanceForm({
                        ...maintenanceForm,
                        maintenance_note: e.target.value,
                      })
                    }
                    className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-3 text-[12px] text-[#172131]"
                  />
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-[#172131]">
                      Date
                    </label>
                    <input
                      type="date"
                      value={maintenanceForm.maintenance_date}
                      onChange={(e) =>
                        setMaintenanceForm({
                          ...maintenanceForm,
                          maintenance_date: e.target.value,
                        })
                      }
                      className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-2 text-[11px] text-[#172131]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-[#172131]">
                      Start Time
                    </label>
                    <select
                      value={maintenanceForm.maintenance_start}
                      onChange={(e) =>
                        setMaintenanceForm({
                          ...maintenanceForm,
                          maintenance_start: e.target.value,
                        })
                      }
                      className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-2 text-[11px] text-[#172131]"
                    >
                      {TIME_SLOTS.map((ts) => (
                        <option key={ts} value={ts}>
                          {ts}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-[#172131]">
                      End Time
                    </label>
                    <select
                      value={maintenanceForm.maintenance_end}
                      onChange={(e) =>
                        setMaintenanceForm({
                          ...maintenanceForm,
                          maintenance_end: e.target.value,
                        })
                      }
                      className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-2 text-[11px] text-[#172131]"
                    >
                      {TIME_SLOTS.map((ts) => (
                        <option key={ts} value={ts}>
                          {ts}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </>
            )}

            <div className="flex flex-wrap-reverse items-center justify-end gap-2 border-t border-[#E5E8E3] pt-3 sm:flex-nowrap">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setMaintenanceCourt(null)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Save Schedule
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* 6-Step Court Assignment Workflow Modal */}
      <Modal
        isOpen={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        title="Assign Match to Court"
        description="1. Date → 2. Start Time → 3. Duration → 4. Filter Available Courts → 5. Assign Match"
        size="lg"
      >
        <form onSubmit={handleConfirmCourtAssignment} className="space-y-4">
          {/* Steps 1, 2, 3 */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[#172131]">
                1. Select Date
              </label>
              <input
                type="date"
                required
                value={assignForm.scheduled_date}
                onChange={(e) =>
                  setAssignForm({
                    ...assignForm,
                    scheduled_date: e.target.value,
                  })
                }
                className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-2.5 text-[12px] text-[#172131]"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[#172131]">
                2. Select Start Time
              </label>
              <select
                value={assignForm.start_time}
                onChange={(e) =>
                  setAssignForm({ ...assignForm, start_time: e.target.value })
                }
                className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-2.5 text-[12px] text-[#172131]"
              >
                {TIME_SLOTS.map((ts) => (
                  <option key={ts} value={ts}>
                    {ts}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[#172131]">
                3. Duration (Ends{' '}
                {computeEndTime(
                  assignForm.start_time,
                  Number(assignForm.duration_minutes) || 45
                )}
                )
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={5}
                  max={480}
                  required
                  value={assignForm.duration_minutes}
                  onChange={(e) =>
                    setAssignForm({
                      ...assignForm,
                      duration_minutes:
                        e.target.value === '' ? '' : Number(e.target.value),
                    })
                  }
                  placeholder="Minutes"
                  className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-2.5 text-[12px] text-[#172131]"
                />
                <span className="shrink-0 text-[11px] font-medium text-[#64748B]">
                  mins
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {DURATION_OPTIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() =>
                      setAssignForm({ ...assignForm, duration_minutes: d })
                    }
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${Number(assignForm.duration_minutes) === d
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

          {/* Step 4: Available Courts Filter Grid */}
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold text-[#172131]">
              4. Select Available Court (Conflicts Prevented Automatically)
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {assignAvailability.map((c) => {
                const selected = Number(assignForm.court_id) === Number(c.id)
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={!c.available}
                    onClick={() =>
                      setAssignForm({ ...assignForm, court_id: c.id })
                    }
                    className={`flex items-center justify-between rounded-lg border p-2.5 text-left text-[11px] transition-all ${selected
                        ? 'border-[#172131] bg-[#253247] text-[#FFFFFF]'
                        : c.available
                          ? 'border-[#E5E8E3] bg-[#D7F66B]/25 text-[#172131] hover:border-[#253247]'
                          : 'cursor-not-allowed border-[#E5E8E3] bg-[#F5F5F0] text-[#AEB8C7]'
                      }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">
                        Court #{c.court_number} • {c.name}
                      </p>
                      <p
                        className={`truncate text-[10px] ${selected
                            ? 'text-[#D7F66B]'
                            : c.available
                              ? 'text-[#12B9B0] font-semibold'
                              : 'text-[#E76B72]'
                          }`}
                      >
                        {c.conflictReason}
                      </p>
                    </div>
                    {selected && (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-[#D7F66B]" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Step 5: Match Selection */}
          <div className="rounded-lg border border-[#E5E8E3] bg-[#F5F5F0] p-3">
            <div className="mb-2.5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
              <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[#172131]">
                <input
                  type="radio"
                  name="assignment_mode"
                  checked={assignForm.assignment_mode === 'existing'}
                  onChange={() =>
                    setAssignForm({
                      ...assignForm,
                      assignment_mode: 'existing',
                    })
                  }
                  className="accent-[#253247]"
                />
                <span>5. Assign Existing Upcoming Match</span>
              </label>
              <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[#172131]">
                <input
                  type="radio"
                  name="assignment_mode"
                  checked={assignForm.assignment_mode === 'new'}
                  onChange={() =>
                    setAssignForm({ ...assignForm, assignment_mode: 'new' })
                  }
                  className="accent-[#253247]"
                />
                <span>Or Schedule Quick New Match</span>
              </label>
            </div>

            {assignForm.assignment_mode === 'existing' ? (
              <select
                value={assignForm.existing_game_id}
                onChange={(e) =>
                  setAssignForm({
                    ...assignForm,
                    existing_game_id: e.target.value,
                  })
                }
                className="h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-3 text-[12px] text-[#172131]"
              >
                {assignableUpcomingGames.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.code}: {g.team_a_name} vs {g.team_b_name} ({g.match_type})
                  </option>
                ))}
              </select>
            ) : (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[10px] font-semibold text-[#64748B]">
                    Team A Name
                  </label>
                  <input
                    type="text"
                    required
                    value={assignForm.team_a_name}
                    onChange={(e) =>
                      setAssignForm({
                        ...assignForm,
                        team_a_name: e.target.value,
                      })
                    }
                    placeholder="Enter Team A name"
                    className="h-8 w-full rounded-md border border-[#E5E8E3] bg-[#FFFFFF] px-2.5 text-[11px]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-semibold text-[#64748B]">
                    Team B Name
                  </label>
                  <input
                    type="text"
                    required
                    value={assignForm.team_b_name}
                    onChange={(e) =>
                      setAssignForm({
                        ...assignForm,
                        team_b_name: e.target.value,
                      })
                    }
                    placeholder="Enter Team B name"
                    className="h-8 w-full rounded-md border border-[#E5E8E3] bg-[#FFFFFF] px-2.5 text-[11px]"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap-reverse items-center justify-end gap-2 border-t border-[#E5E8E3] pt-3 sm:flex-nowrap">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setAssignModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Confirm Court Assignment
            </Button>
          </div>
        </form>
      </Modal>

      {/* Court Schedule & Match History Modal */}
      <Modal
        isOpen={Boolean(historyCourt)}
        onClose={() => setHistoryCourt(null)}
        title={
          historyCourt
            ? `Court #${historyCourt.court_number} — ${historyCourt.name}`
            : ''
        }
        description="Complete match schedule and historical results for this court."
        size="lg"
      >
        {historyCourt && (
          <div className="space-y-3">
            {games.filter(
              (g) => Number(g.court_id) === Number(historyCourt.id)
            ).length === 0 ? (
              <p className="rounded-lg bg-[#F5F5F0] p-4 text-center text-[12px] text-[#64748B]">
                No matches recorded on this court yet.
              </p>
            ) : (
              <div className="divide-y divide-[#E5E8E3] rounded-lg border border-[#E5E8E3]">
                {games
                  .filter((g) => Number(g.court_id) === Number(historyCourt.id))
                  .map((g) => (
                    <div
                      key={g.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-[12px]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-[#172131]">
                            {g.code}
                          </span>
                          <Badge status={g.status}>{g.status}</Badge>
                        </div>
                        <p className="mt-0.5 break-words font-medium text-[#253247]">
                          {g.team_a_name} vs {g.team_b_name}
                        </p>
                      </div>
                      <div className="shrink-0 text-left sm:text-right">
                        <p className="font-bold text-[#172131]">
                          Score: {g.score_a} – {g.score_b}
                        </p>
                        <p className="text-[11px] text-[#64748B]">
                          {formatShortDate(g.scheduled_date)} • {g.start_time}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

