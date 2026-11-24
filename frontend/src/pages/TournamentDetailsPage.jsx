import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Award,
  Calendar,
  CheckCircle2,
  Clock,
  Edit3,
  GitBranch,
  MapPin,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  Trophy,
  Users,
} from 'lucide-react'
import { useRally } from '../hooks/useRally'
import { useToast } from '../hooks/useToast'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import EmptyState from '../components/ui/EmptyState'
import Modal from '../components/ui/Modal'
import { TIME_SLOTS, TOURNAMENT_STATUSES } from '../utils/constants'
import {
  extractErrorMessage,
  formatShortDate,
  getTodayStr,
} from '../utils/formatters'

const TABS = [
  { id: 'Overview', label: 'Overview', icon: Trophy },
  { id: 'Participants', label: 'Participants', icon: Users },
  { id: 'Brackets', label: 'Brackets', icon: GitBranch },
  { id: 'Schedule', label: 'Schedule', icon: Calendar },
  { id: 'Results', label: 'Results', icon: Award },
]

export default function TournamentDetailsPage() {
  const { tournamentId } = useParams()
  const navigate = useNavigate()
  const {
    courts,
    games,
    tournaments,
    updateTournament,
    addParticipant,
    updateParticipant,
    removeParticipant,
    regenerateTournamentBracket,
    updateTournamentMatch,
    createGame,
    getCourtsAvailability,
    pushNotification,
  } = useRally()
  const { showToast } = useToast()

  const [activeTab, setActiveTab] = useState('Overview')

  // Participant Modals
  const [participantModalOpen, setParticipantModalOpen] = useState(false)
  const [editingParticipant, setEditingParticipant] = useState(null)
  const [participantForm, setParticipantForm] = useState({
    name: '',
    category: '',
    seed: 1,
    registered_at: getTodayStr(),
    status: 'Confirmed',
  })
  const [deleteParticipantTarget, setDeleteParticipantTarget] = useState(null)

  // Match Score / Result Modal
  const [scoreModalMatch, setScoreModalMatch] = useState(null)
  const [scoreForm, setScoreForm] = useState({
    score_a: 11,
    score_b: 8,
    winner: '',
  })

  // Schedule & Court Assignment Modal
  const [scheduleModalMatch, setScheduleModalMatch] = useState(null)
  const [scheduleForm, setScheduleForm] = useState({
    court_id: '',
    scheduled_date: '',
    start_time: '09:00',
  })

  const tournament = useMemo(() => {
    return tournaments.find(
      (t) => String(t.id) === String(tournamentId) || t.code === tournamentId
    )
  }, [tournaments, tournamentId])

  const assignedCourts = useMemo(() => {
    if (!tournament) return []
    return (tournament.assigned_court_ids || [])
      .map((cid) => courts.find((c) => Number(c.id) === Number(cid)))
      .filter(Boolean)
  }, [tournament, courts])

  const matches = useMemo(() => {
    return tournament?.matches || []
  }, [tournament])

  const upcomingMatches = useMemo(() => {
    return matches.filter((m) => m.status !== 'Completed')
  }, [matches])

  const completedMatches = useMemo(() => {
    return matches.filter((m) => m.status === 'Completed')
  }, [matches])

  // Group elimination rounds for Brackets tab
  const bracketRounds = useMemo(() => {
    if (!tournament || tournament.format === 'Round Robin') return []
    const map = new Map()
    for (const m of matches) {
      const key = m.round_name || `Round ${m.round_order || 1}`
      if (!map.has(key)) {
        map.set(key, [])
      }
      map.get(key).push(m)
    }
    return Array.from(map.entries())
  }, [tournament, matches])

  // Calculate Round Robin Standings
  const roundRobinStandings = useMemo(() => {
    if (!tournament) return []
    const statsMap = new Map()
    for (const p of tournament.participants || []) {
      statsMap.set(p.name, {
        name: p.name,
        seed: p.seed,
        played: 0,
        wins: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
      })
    }

    for (const m of matches) {
      if (m.status !== 'Completed') continue
      if (
        !m.team_a ||
        !m.team_b ||
        m.team_a.startsWith('TBD') ||
        m.team_b.startsWith('TBD')
      ) {
        continue
      }
      if (!statsMap.has(m.team_a)) {
        statsMap.set(m.team_a, {
          name: m.team_a,
          seed: 99,
          played: 0,
          wins: 0,
          losses: 0,
          pointsFor: 0,
          pointsAgainst: 0,
        })
      }
      if (!statsMap.has(m.team_b)) {
        statsMap.set(m.team_b, {
          name: m.team_b,
          seed: 99,
          played: 0,
          wins: 0,
          losses: 0,
          pointsFor: 0,
          pointsAgainst: 0,
        })
      }

      const rowA = statsMap.get(m.team_a)
      const rowB = statsMap.get(m.team_b)
      const sA = Number(m.score_a || 0)
      const sB = Number(m.score_b || 0)

      rowA.played += 1
      rowB.played += 1
      rowA.pointsFor += sA
      rowA.pointsAgainst += sB
      rowB.pointsFor += sB
      rowB.pointsAgainst += sA

      if (m.winner === m.team_a || (sA > sB && !m.winner)) {
        rowA.wins += 1
        rowB.losses += 1
      } else {
        rowB.wins += 1
        rowA.losses += 1
      }
    }

    return Array.from(statsMap.values()).sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins
      const diffA = a.pointsFor - a.pointsAgainst
      const diffB = b.pointsFor - b.pointsAgainst
      if (diffB !== diffA) return diffB - diffA
      return a.seed - b.seed
    })
  }, [tournament, matches])

  // Calculate Final Tournament Rankings for Results Tab
  const finalRankings = useMemo(() => {
    if (!tournament) return []
    if (tournament.format === 'Round Robin') {
      return roundRobinStandings.map((r, idx) => ({
        rank: idx + 1,
        name: r.name,
        record: `${r.wins}W - ${r.losses}L`,
        badge:
          idx === 0
            ? 'Champion'
            : idx === 1
              ? 'Runner-Up'
              : idx === 2
                ? '3rd Place'
                : 'Participant',
      }))
    }

    // Elimination rankings
    const ranked = []
    const used = new Set()
    const finalMatch = [...matches]
      .sort((a, b) => (b.round_order || 1) - (a.round_order || 1))
      .find((m) => m.status === 'Completed' && m.winner)

    if (finalMatch && finalMatch.winner) {
      const runnerUp =
        finalMatch.winner === finalMatch.team_a
          ? finalMatch.team_b
          : finalMatch.team_a
      ranked.push({
        rank: 1,
        name: finalMatch.winner,
        record: `Won ${finalMatch.round_name} (${finalMatch.score_a}-${finalMatch.score_b})`,
        badge: 'Champion',
      })
      used.add(finalMatch.winner)

      if (runnerUp && !runnerUp.startsWith('TBD')) {
        ranked.push({
          rank: 2,
          name: runnerUp,
          record: `Finalist (${finalMatch.round_name})`,
          badge: 'Runner-Up',
        })
        used.add(runnerUp)
      }
    }

    for (const r of roundRobinStandings) {
      if (!used.has(r.name)) {
        ranked.push({
          rank: ranked.length + 1,
          name: r.name,
          record: `${r.wins}W - ${r.losses}L`,
          badge: ranked.length < 4 ? 'Semifinalist' : 'Participant',
        })
        used.add(r.name)
      }
    }
    return ranked
  }, [tournament, matches, roundRobinStandings])

  const scheduleAvailability = useMemo(() => {
    if (!scheduleModalMatch) return []
    return getCourtsAvailability(
      scheduleForm.scheduled_date || tournament?.start_date || getTodayStr(),
      scheduleForm.start_time || '09:00',
      45
    )
  }, [
    scheduleModalMatch,
    scheduleForm.scheduled_date,
    scheduleForm.start_time,
    tournament,
    getCourtsAvailability,
  ])

  if (!tournament) {
    return (
      <Card className="p-8 text-center">
        <p className="text-[15px] font-semibold text-[#172131]">
          Tournament not found
        </p>
        <p className="mt-1 text-[12px] text-[#64748B]">
          The requested tournament ({tournamentId}) does not exist.
        </p>
        <div className="mt-4">
          <Button variant="primary" onClick={() => navigate('/tournaments')}>
            Back to Tournaments
          </Button>
        </div>
      </Card>
    )
  }

  const handleOpenAddParticipant = () => {
    const nextSeed = (tournament.participants?.length || 0) + 1
    setEditingParticipant(null)
    setParticipantForm({
      name: '',
      category: `${tournament.match_type} • ${tournament.skill_division}`,
      seed: nextSeed,
      registered_at: getTodayStr(),
      status: 'Confirmed',
    })
    setParticipantModalOpen(true)
  }

  const handleOpenEditParticipant = (p) => {
    setEditingParticipant(p)
    setParticipantForm({
      name: p.name,
      category:
        p.category || `${tournament.match_type} • ${tournament.skill_division}`,
      seed: p.seed || 1,
      registered_at: p.registered_at || getTodayStr(),
      status: p.status || 'Confirmed',
    })
    setParticipantModalOpen(true)
  }

  const handleSaveParticipant = async (e) => {
    e.preventDefault()
    if (!participantForm.name.trim()) return

    try {
      if (editingParticipant) {
        await updateParticipant(tournament.id, editingParticipant.id, {
          name: participantForm.name.trim(),
          players: participantForm.name.trim().split(' / '),
          category: participantForm.category,
          seed: Number(participantForm.seed),
          registered_at: participantForm.registered_at,
          status: participantForm.status,
        })
        showToast({
          type: 'success',
          title: 'Participant Updated',
          message: `${participantForm.name} updated.`,
        })
      } else {
        await addParticipant(tournament.id, {
          name: participantForm.name.trim(),
          players: participantForm.name.trim().split(' / '),
          category: participantForm.category,
          seed: Number(participantForm.seed),
          registered_at: participantForm.registered_at,
          status: participantForm.status,
        })
        showToast({
          type: 'success',
          title: 'Participant Registered',
          message: `${participantForm.name} added to ${tournament.name}.`,
        })
      }
      setParticipantModalOpen(false)
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Registration Error',
        message: extractErrorMessage(err),
      })
    }
  }

  const handleRegenerateBracket = async () => {
    try {
      await regenerateTournamentBracket(tournament.id)
      showToast({
        type: 'success',
        title: 'Brackets Generated',
        message: `${tournament.format} bracket generated for ${tournament.participants?.length || 0} entries.`,
      })
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Bracket Error',
        message: extractErrorMessage(err),
      })
    }
  }

  const handleOpenScoreModal = (match) => {
    if (
      !match.team_a ||
      !match.team_b ||
      match.team_a.startsWith('TBD') ||
      match.team_b.startsWith('TBD')
    ) {
      showToast({
        type: 'warning',
        title: 'Teams Not Determined',
        message: 'Complete earlier bracket matches to populate both teams first.',
      })
      return
    }
    setScoreModalMatch(match)
    setScoreForm({
      score_a: match.score_a || tournament.points_to_win || 11,
      score_b: match.score_b || 7,
      winner: match.winner || match.team_a,
    })
  }

  const handleSaveMatchResult = async (e) => {
    e.preventDefault()
    if (!scoreModalMatch) return
    const sA = Number(scoreForm.score_a)
    const sB = Number(scoreForm.score_b)
    const winTeam =
      scoreForm.winner ||
      (sA >= sB ? scoreModalMatch.team_a : scoreModalMatch.team_b)

    try {
      await updateTournamentMatch(tournament.id, scoreModalMatch.id, {
        score_a: sA,
        score_b: sB,
        winner: winTeam,
        status: 'Completed',
      })

      pushNotification(
        'Bracket Match Completed',
        `${winTeam} won ${scoreModalMatch.round_name} (${sA}-${sB}) and advanced.`
      )
      showToast({
        type: 'success',
        title: 'Match Finalized & Advanced',
        message: `${winTeam} recorded as winner (${sA}-${sB}).`,
      })
      setScoreModalMatch(null)
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Save Failed',
        message: extractErrorMessage(err),
      })
    }
  }

  const handleLaunchLiveScoringForMatch = async (match) => {
    if (
      !match.team_a ||
      !match.team_b ||
      match.team_a.startsWith('TBD') ||
      match.team_b.startsWith('TBD')
    ) {
      showToast({
        type: 'warning',
        title: 'Teams Not Ready',
        message: 'Both teams must be determined before launching Live Scoring.',
      })
      return
    }

    // Check if an existing game is already linked
    const existingGame = games.find(
      (g) =>
        g.code === match.game_code ||
        (Number(g.tournament_id) === Number(tournament.id) &&
          g.tournament_match_id === match.id)
    )
    if (existingGame) {
      navigate(`/scorekeeper/${existingGame.code}`)
      return
    }

    try {
      const created = await createGame({
        match_type: tournament.match_type,
        team_a_name: match.team_a,
        team_a_players: match.team_a.split(' / '),
        team_b_name: match.team_b,
        team_b_players: match.team_b.split(' / '),
        court_id: match.court_id || tournament.assigned_court_ids?.[0] || null,
        scheduled_date: match.scheduled_date || tournament.start_date,
        start_time: match.start_time || '10:00',
        duration_minutes: 45,
        match_format: tournament.match_format,
        scoring_type: tournament.scoring_type,
        points_to_win: tournament.points_to_win,
        win_by_two: tournament.win_by_two,
        tournament_id: tournament.id,
        tournament_name: tournament.name,
        tournament_match_id: match.id,
      })

      await updateTournamentMatch(tournament.id, match.id, {
        game_code: created.code,
        status: 'Live',
      })

      navigate(`/scorekeeper/${created.code}`)
    } catch {
      const created = await createGame({
        match_type: tournament.match_type,
        team_a_name: match.team_a,
        team_a_players: match.team_a.split(' / '),
        team_b_name: match.team_b,
        team_b_players: match.team_b.split(' / '),
        court_id: null,
        scheduled_date: match.scheduled_date || tournament.start_date,
        start_time: match.start_time || '10:00',
        duration_minutes: 45,
        match_format: tournament.match_format,
        scoring_type: tournament.scoring_type,
        points_to_win: tournament.points_to_win,
        win_by_two: tournament.win_by_two,
        tournament_id: tournament.id,
        tournament_name: tournament.name,
        tournament_match_id: match.id,
      })
      await updateTournamentMatch(tournament.id, match.id, {
        game_code: created.code,
        status: 'Live',
      })
      navigate(`/scorekeeper/${created.code}`)
    }
  }

  const handleOpenScheduleModal = (match) => {
    setScheduleModalMatch(match)
    setScheduleForm({
      court_id: match.court_id || tournament.assigned_court_ids?.[0] || 1,
      scheduled_date: match.scheduled_date || tournament.start_date,
      start_time: match.start_time || '09:00',
    })
  }

  const handleSaveSchedule = async (e) => {
    e.preventDefault()
    if (!scheduleModalMatch) return

    const chosenCourt = scheduleAvailability.find(
      (c) => Number(c.id) === Number(scheduleForm.court_id)
    )
    if (chosenCourt && !chosenCourt.available) {
      showToast({
        type: 'error',
        title: 'Court Conflict',
        message: chosenCourt.conflictReason,
      })
      return
    }

    try {
      await updateTournamentMatch(tournament.id, scheduleModalMatch.id, {
        court_id: Number(scheduleForm.court_id),
        scheduled_date: scheduleForm.scheduled_date,
        start_time: scheduleForm.start_time,
      })

      showToast({
        type: 'success',
        title: 'Match Scheduled',
        message: `${scheduleModalMatch.id} assigned to ${chosenCourt ? chosenCourt.name : `Court #${scheduleForm.court_id}`
          } at ${scheduleForm.start_time}.`,
      })
      setScheduleModalMatch(null)
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Schedule Error',
        message: extractErrorMessage(err),
      })
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-2.5 sm:gap-3">
          <button
            type="button"
            onClick={() => navigate('/tournaments')}
            className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] text-[#172131] hover:bg-[#F5F5F0]"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-[#253247] px-2 py-0.5 text-[11px] font-bold text-[#D7F66B]">
                {tournament.code}
              </span>
              <h1 className="rally-page-title break-words">{tournament.name}</h1>
              <Badge status={tournament.status}>{tournament.status}</Badge>
            </div>
            <p className="rally-page-desc mt-0.5 break-words">
              {tournament.format} • {tournament.match_type} Division{' '}
              {tournament.skill_division} • Starts{' '}
              {formatShortDate(tournament.start_date)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={tournament.status}
            onChange={(e) => {
              updateTournament(tournament.id, { status: e.target.value })
              showToast({
                type: 'info',
                title: 'Status Updated',
                message: `${tournament.name} is now ${e.target.value}.`,
              })
            }}
            className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-3 text-[12px] font-semibold text-[#172131] sm:w-auto"
          >
            {TOURNAMENT_STATUSES.map((st) => (
              <option key={st} value={st}>
                Status: {st}
              </option>
            ))}
          </select>

          <Button
            variant="outline"
            onClick={handleRegenerateBracket}
            title="Rebuild bracket matches from seeded participants"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Sync Bracket</span>
          </Button>

          <Button variant="primary" onClick={handleOpenAddParticipant}>
            <Plus className="h-4 w-4" />
            <span>+ Add Participant</span>
          </Button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[#E5E8E3] pb-2">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold transition-all sm:gap-2 sm:px-3.5 sm:py-2 sm:text-[12px] ${active
                ? 'bg-[#253247] text-[#D7F66B] shadow-xs'
                : 'text-[#64748B] hover:bg-[#FFFFFF] hover:text-[#172131]'
                }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
              {tab.id === 'Participants' && (
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] ${active
                    ? 'bg-[#D7F66B] text-[#172131]'
                    : 'bg-[#E5E8E3] text-[#253247]'
                    }`}
                >
                  {tournament.participants?.length || 0}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'Overview' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Tournament Details Card */}
          <Card
            title="Tournament Details"
            subtitle="Competition rules and registration parameters"
            className="lg:col-span-2"
          >
            <div className="space-y-4 p-4">
              {tournament.description && (
                <p className="rounded-lg bg-[#F5F5F0] p-3 text-[12px] text-[#253247]">
                  {tournament.description}
                </p>
              )}

              <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:grid-cols-3">
                <div className="rounded-lg border border-[#E5E8E3] p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#64748B]">
                    Registration Status
                  </p>
                  <div className="mt-1">
                    <Badge status={tournament.status}>{tournament.status}</Badge>
                  </div>
                </div>

                <div className="rounded-lg border border-[#E5E8E3] p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#64748B]">
                    Total Participants
                  </p>
                  <p className="mt-1 text-[15px] font-bold text-[#172131]">
                    {tournament.participants?.length || 0} /{' '}
                    {tournament.max_participants}
                  </p>
                </div>

                <div className="rounded-lg border border-[#E5E8E3] p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#64748B]">
                    Tournament Format
                  </p>
                  <p className="mt-1 text-[13px] font-semibold text-[#172131]">
                    {tournament.format}
                  </p>
                </div>

                <div className="rounded-lg border border-[#E5E8E3] p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#64748B]">
                    Category & Division
                  </p>
                  <p className="mt-1 text-[13px] font-semibold text-[#172131]">
                    {tournament.match_type} • {tournament.skill_division}
                  </p>
                </div>

                <div className="rounded-lg border border-[#E5E8E3] p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#64748B]">
                    Scoring Format
                  </p>
                  <p className="mt-1 text-[12px] font-semibold text-[#172131]">
                    {tournament.match_format} • {tournament.points_to_win} pts (
                    {tournament.scoring_type})
                  </p>
                </div>

                <div className="rounded-lg border border-[#E5E8E3] p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#64748B]">
                    Entry Information
                  </p>
                  <p className="mt-1 text-[12px] font-medium text-[#172131]">
                    {tournament.entry_fee_info || 'Optional Info Only'}
                  </p>
                </div>
              </div>

              {/* Upcoming Matches inside Overview */}
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-[13px] font-semibold text-[#172131]">
                    Upcoming Tournament Matches ({upcomingMatches.length})
                  </h4>
                  <button
                    type="button"
                    onClick={() => setActiveTab('Schedule')}
                    className="text-[11px] font-semibold text-[#12B9B0] hover:underline"
                  >
                    View Full Schedule →
                  </button>
                </div>

                {upcomingMatches.length === 0 ? (
                  <p className="rounded-lg border border-[#E5E8E3] bg-[#F5F5F0] p-3 text-[12px] text-[#64748B]">
                    All scheduled bracket matches have been completed.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {upcomingMatches.slice(0, 4).map((m) => (
                      <div
                        key={m.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-3.5 py-2.5"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-[#253247] px-1.5 py-0.5 text-[10px] font-semibold text-[#D7F66B]">
                              {m.code}
                            </span>
                            <span className="text-[11px] font-medium text-[#64748B]">
                              {m.round_name}
                            </span>
                          </div>
                          <p className="mt-1 text-[12px] font-semibold text-[#172131]">
                            {m.team_a} <span className="text-[#64748B]">vs</span>{' '}
                            {m.team_b}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-[#64748B]">
                            {m.court_name} • {m.start_time}
                          </span>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleLaunchLiveScoringForMatch(m)}
                          >
                            <Play className="h-3 w-3" />
                            <span>Score Live</span>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Assigned Courts Sidebar Card */}
          <Card
            title="Assigned Courts"
            subtitle="Dedicated pickleball courts for this event"
          >
            <div className="space-y-2.5 p-4">
              {assignedCourts.length === 0 ? (
                <p className="text-[12px] text-[#64748B]">
                  No courts currently assigned.
                </p>
              ) : (
                assignedCourts.map((c) => (
                  <div
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#E5E8E3] bg-[#F5F5F0]/60 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-[#172131]">
                        {c.name}
                      </p>
                      <p className="text-[11px] text-[#64748B]">
                        Court #{c.court_number} • {c.surface_type}
                      </p>
                    </div>
                    <Badge status={c.status}>{c.status}</Badge>
                  </div>
                ))
              )}

              <div className="pt-2">
                <Link
                  to="/courts"
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#12B9B0] hover:underline"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  <span>Open Court Availability Schedule</span>
                </Link>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 2: PARTICIPANTS */}
      {activeTab === 'Participants' && (
        <Card
          title={`Registered Participants (${tournament.participants?.length || 0} / ${tournament.max_participants})`}
          subtitle="Add, edit, seed, or remove players and teams"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRegenerateBracket}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Rebuild Brackets</span>
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleOpenAddParticipant}
              >
                <Plus className="h-3.5 w-3.5" />
                <span>+ Add Participant</span>
              </Button>
            </div>
          }
        >
          {(tournament.participants || []).length === 0 ? (
            <EmptyState
              icon={Users}
              title="No participants registered yet"
              description="Add players or doubles teams to generate the tournament bracket."
              action={
                <Button variant="primary" onClick={handleOpenAddParticipant}>
                  <Plus className="h-3.5 w-3.5" />
                  <span>+ Add Participant</span>
                </Button>
              }
            />
          ) : (
            <div className="rally-scroll-x">
              <table className="w-full min-w-[680px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-[#E5E8E3] bg-[#F5F5F0]/70 text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
                    <th className="px-4 py-3">Seed</th>
                    <th className="px-4 py-3">Player / Team Name</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Registration Date</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E8E3] text-[12px]">
                  {[...(tournament.participants || [])]
                    .sort((a, b) => (a.seed || 99) - (b.seed || 99))
                    .map((p) => (
                      <tr
                        key={p.id}
                        className="transition-colors hover:bg-[#F5F5F0]/40"
                      >
                        <td className="px-4 py-3">
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-[#253247] text-[11px] font-bold text-[#D7F66B]">
                            #{p.seed}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-semibold text-[#172131]">
                          {p.name}
                        </td>
                        <td className="px-4 py-3 text-[#64748B]">
                          {p.category ||
                            `${tournament.match_type} • ${tournament.skill_division}`}
                        </td>
                        <td className="px-4 py-3 text-[#253247]">
                          {formatShortDate(p.registered_at)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge status={p.status || 'Confirmed'}>
                            {p.status || 'Confirmed'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenEditParticipant(p)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#E5E8E3] bg-[#FFFFFF] text-[#253247] hover:bg-[#F5F5F0]"
                              title="Edit participant"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteParticipantTarget(p)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#E5E8E3] bg-[#FFFFFF] text-[#E76B72] hover:bg-[#E76B72]/10"
                              title="Remove participant"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* TAB 3: BRACKETS */}
      {activeTab === 'Brackets' && (
        <div className="space-y-4">
          {tournament.format === 'Round Robin' ? (
            <>
              {/* Round Robin Standings Table */}
              <Card
                title="Round Robin Standings"
                subtitle="Automatically calculated from finalized pool play matches"
              >
                <div className="rally-scroll-x">
                  <table className="w-full min-w-[680px] border-collapse text-left">
                    <thead>
                      <tr className="border-b border-[#E5E8E3] bg-[#F5F5F0]/70 text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
                        <th className="px-4 py-3">Rank</th>
                        <th className="px-4 py-3">Player / Team</th>
                        <th className="px-4 py-3">Played</th>
                        <th className="px-4 py-3">Wins</th>
                        <th className="px-4 py-3">Losses</th>
                        <th className="px-4 py-3">Points For</th>
                        <th className="px-4 py-3">Points Against</th>
                        <th className="px-4 py-3">Diff</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5E8E3] text-[12px]">
                      {roundRobinStandings.map((row, index) => {
                        const diff = row.pointsFor - row.pointsAgainst
                        return (
                          <tr
                            key={row.name}
                            className={
                              index === 0 ? 'bg-[#D7F66B]/15 font-semibold' : ''
                            }
                          >
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold ${index === 0
                                  ? 'bg-[#D7F66B] text-[#172131]'
                                  : 'bg-[#253247] text-[#FFFFFF]'
                                  }`}
                              >
                                {index + 1}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-semibold text-[#172131]">
                              {row.name}
                            </td>
                            <td className="px-4 py-3">{row.played}</td>
                            <td className="px-4 py-3 font-bold text-[#12B9B0]">
                              {row.wins}
                            </td>
                            <td className="px-4 py-3 text-[#E76B72]">
                              {row.losses}
                            </td>
                            <td className="px-4 py-3">{row.pointsFor}</td>
                            <td className="px-4 py-3">{row.pointsAgainst}</td>
                            <td className="px-4 py-3 font-semibold">
                              {diff > 0 ? `+${diff}` : diff}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Round Robin Match Cards */}
              <Card
                title="Round Robin Match Matrix"
                subtitle="Record scores or launch live scorekeeper for pool matches"
              >
                <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                  {matches.map((m) => {
                    const isDone = m.status === 'Completed'
                    return (
                      <div
                        key={m.id}
                        className="rounded-xl border border-[#E5E8E3] bg-[#FFFFFF] p-3.5 shadow-2xs"
                      >
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <span className="rounded bg-[#253247] px-2 py-0.5 text-[10px] font-bold text-[#D7F66B]">
                            Match #{m.match_number} ({m.code})
                          </span>
                          <Badge status={m.status}>{m.status}</Badge>
                        </div>

                        <div className="space-y-1.5">
                          <div
                            className={`flex items-center justify-between rounded-lg px-2.5 py-2 text-[12px] ${isDone && m.winner === m.team_a
                              ? 'bg-[#253247] font-bold text-[#D7F66B]'
                              : 'bg-[#F5F5F0] text-[#172131]'
                              }`}
                          >
                            <span className="truncate">{m.team_a}</span>
                            <span className="ml-2 text-[13px] font-bold">
                              {isDone ? m.score_a : '—'}
                            </span>
                          </div>
                          <div
                            className={`flex items-center justify-between rounded-lg px-2.5 py-2 text-[12px] ${isDone && m.winner === m.team_b
                              ? 'bg-[#253247] font-bold text-[#D7F66B]'
                              : 'bg-[#F5F5F0] text-[#172131]'
                              }`}
                          >
                            <span className="truncate">{m.team_b}</span>
                            <span className="ml-2 text-[13px] font-bold">
                              {isDone ? m.score_b : '—'}
                            </span>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#E5E8E3] pt-2.5 text-[11px] text-[#64748B]">
                          <span>
                            {m.court_name} • {m.start_time}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenScoreModal(m)}
                              className="rounded bg-[#F5F5F0] px-2 py-1 text-[11px] font-semibold text-[#172131] hover:bg-[#D7F66B]"
                            >
                              {isDone ? 'Edit Score' : 'Record Score'}
                            </button>
                            {!isDone && (
                              <button
                                type="button"
                                onClick={() => handleLaunchLiveScoringForMatch(m)}
                                className="rounded bg-[#253247] px-2 py-1 text-[11px] font-semibold text-[#D7F66B]"
                              >
                                Live
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Card>
            </>
          ) : (
            /* Single Elimination / Double Elimination Bracket Columns */
            <Card
              title={`${tournament.format} Bracket`}
              subtitle="Winners automatically advance to their next bracket slot when finalized"
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRegenerateBracket}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Reset Bracket</span>
                </Button>
              }
            >
              <div className="rally-scroll-x p-3 sm:p-4">
                <div className="flex min-w-[640px] items-stretch gap-4 sm:min-w-[680px] sm:gap-6">
                  {bracketRounds.map(([roundName, roundMatches]) => (
                    <div
                      key={roundName}
                      className="flex min-w-[260px] flex-1 flex-col"
                    >
                      <div className="mb-3 rounded-lg bg-[#253247] px-3 py-2 text-center">
                        <p className="text-[12px] font-semibold text-[#D7F66B]">
                          {roundName}
                        </p>
                        <p className="text-[10px] text-[#AEB8C7]">
                          {roundMatches.length}{' '}
                          {roundMatches.length === 1 ? 'Match' : 'Matches'}
                        </p>
                      </div>

                      <div className="flex flex-1 flex-col justify-around gap-4">
                        {roundMatches.map((m) => {
                          const isCompleted = m.status === 'Completed'
                          const winnerIsA =
                            isCompleted && m.winner && m.winner === m.team_a
                          const winnerIsB =
                            isCompleted && m.winner && m.winner === m.team_b

                          return (
                            <div
                              key={m.id}
                              className="rounded-xl border border-[#E5E8E3] bg-[#FFFFFF] p-3.5 shadow-xs transition-all hover:border-[#253247]"
                            >
                              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                <span className="text-[11px] font-bold text-[#253247]">
                                  Match #{m.match_number} • {m.code}
                                </span>
                                <Badge status={m.status}>{m.status}</Badge>
                              </div>

                              {/* Team A Slot */}
                              <div
                                className={`flex items-center justify-between rounded-lg px-3 py-2 text-[12px] ${winnerIsA
                                  ? 'bg-[#253247] font-bold text-[#D7F66B]'
                                  : 'bg-[#F5F5F0] text-[#172131]'
                                  }`}
                              >
                                <div className="flex items-center gap-1.5 truncate">
                                  {winnerIsA && (
                                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#D7F66B]" />
                                  )}
                                  <span className="truncate">{m.team_a}</span>
                                </div>
                                <span className="ml-2 text-[13px] font-bold">
                                  {isCompleted ? m.score_a : '—'}
                                </span>
                              </div>

                              {/* Team B Slot */}
                              <div
                                className={`mt-1.5 flex items-center justify-between rounded-lg px-3 py-2 text-[12px] ${winnerIsB
                                  ? 'bg-[#253247] font-bold text-[#D7F66B]'
                                  : 'bg-[#F5F5F0] text-[#172131]'
                                  }`}
                              >
                                <div className="flex items-center gap-1.5 truncate">
                                  {winnerIsB && (
                                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#D7F66B]" />
                                  )}
                                  <span className="truncate">{m.team_b}</span>
                                </div>
                                <span className="ml-2 text-[13px] font-bold">
                                  {isCompleted ? m.score_b : '—'}
                                </span>
                              </div>

                              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#E5E8E3] pt-2 text-[10px] text-[#64748B]">
                                <span>
                                  {m.court_name} • {m.start_time}
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenScoreModal(m)}
                                    className="rounded bg-[#F5F5F0] px-2 py-1 text-[11px] font-semibold text-[#172131] hover:bg-[#D7F66B]"
                                  >
                                    {isCompleted ? 'Update' : 'Finalize'}
                                  </button>
                                  {!isCompleted && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleLaunchLiveScoringForMatch(m)
                                      }
                                      className="rounded bg-[#253247] px-2 py-1 text-[11px] font-semibold text-[#D7F66B]"
                                    >
                                      Live Score
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* TAB 4: SCHEDULE */}
      {activeTab === 'Schedule' && (
        <Card
          title="Tournament Match Schedule"
          subtitle="Assign courts, reschedule match times, or launch live scoring"
        >
          {matches.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="No matches scheduled"
              description="Generate the tournament bracket to create match schedules."
            />
          ) : (
            <div className="rally-scroll-x">
              <table className="w-full min-w-[820px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-[#E5E8E3] bg-[#F5F5F0]/70 text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
                    <th className="px-4 py-3">Match ID</th>
                    <th className="px-4 py-3">Round</th>
                    <th className="px-4 py-3">Participants</th>
                    <th className="px-4 py-3">Assigned Court</th>
                    <th className="px-4 py-3">Match Date</th>
                    <th className="px-4 py-3">Start Time</th>
                    <th className="px-4 py-3">Match Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E8E3] text-[12px]">
                  {matches.map((m) => (
                    <tr
                      key={m.id}
                      className="transition-colors hover:bg-[#F5F5F0]/40"
                    >
                      <td className="px-4 py-3 font-bold text-[#172131]">
                        {m.code}
                      </td>
                      <td className="px-4 py-3 text-[#64748B]">{m.round_name}</td>
                      <td className="px-4 py-3 font-semibold text-[#172131]">
                        {m.team_a}{' '}
                        <span className="font-normal text-[#64748B]">vs</span>{' '}
                        {m.team_b}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 rounded-md bg-[#F5F5F0] px-2 py-0.5 font-medium text-[#253247]">
                          <MapPin className="h-3 w-3 text-[#12B9B0]" />
                          {m.court_name || 'Unassigned'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {formatShortDate(m.scheduled_date)}
                      </td>
                      <td className="px-4 py-3 font-medium text-[#172131]">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3 text-[#64748B]" />
                          {m.start_time}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge status={m.status}>{m.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenScheduleModal(m)}
                          >
                            Assign / Reschedule
                          </Button>
                          {m.status !== 'Completed' && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleLaunchLiveScoringForMatch(m)}
                            >
                              <Play className="h-3 w-3" />
                              <span>Start</span>
                            </Button>
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
      )}

      {/* TAB 5: RESULTS */}
      {activeTab === 'Results' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Completed Matches List */}
          <Card
            title={`Completed Matches (${completedMatches.length})`}
            subtitle="Official verified scores and advancing winners"
            className="lg:col-span-2"
          >
            {completedMatches.length === 0 ? (
              <EmptyState
                icon={Award}
                title="No completed matches yet"
                description="Finalize match scores in the Brackets tab or via Live Game Scoring."
              />
            ) : (
              <div className="divide-y divide-[#E5E8E3]">
                {completedMatches.map((m) => (
                  <div
                    key={m.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-[#253247] px-1.5 py-0.5 text-[10px] font-bold text-[#D7F66B]">
                          {m.code}
                        </span>
                        <span className="text-[11px] font-medium text-[#64748B]">
                          {m.round_name} • {m.court_name}
                        </span>
                      </div>
                      <p className="mt-1 break-words text-[13px] font-semibold text-[#172131]">
                        {m.team_a} vs {m.team_b}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                      <div className="rounded-lg bg-[#172131] px-3 py-1.5 text-right">
                        <p className="text-[10px] uppercase tracking-wider text-[#AEB8C7]">
                          Final Score
                        </p>
                        <p className="text-[14px] font-bold text-[#D7F66B]">
                          {m.score_a} – {m.score_b}
                        </p>
                      </div>

                      <div className="min-w-[120px] rounded-lg border border-[#A6D957] bg-[#A6D957]/15 px-3 py-1.5 sm:min-w-[140px]">
                        <p className="text-[10px] font-semibold uppercase text-[#253247]">
                          Winner
                        </p>
                        <p className="truncate text-[12px] font-bold text-[#172131]">
                          {m.winner}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Final Tournament Rankings */}
          <Card
            title="Tournament Rankings"
            subtitle="Current podium & division standings"
          >
            <div className="space-y-2.5 p-4">
              {finalRankings.map((item) => (
                <div
                  key={item.name}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 ${item.rank === 1
                    ? 'border-[#172131] bg-[#253247] text-[#FFFFFF]'
                    : 'border-[#E5E8E3] bg-[#F5F5F0]/70 text-[#172131]'
                    }`}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span
                      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold ${item.rank === 1
                        ? 'bg-[#D7F66B] text-[#172131]'
                        : 'bg-[#253247] text-[#FFFFFF]'
                        }`}
                    >
                      #{item.rank}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold">{item.name}</p>
                      <p
                        className={`text-[11px] ${item.rank === 1 ? 'text-[#AEB8C7]' : 'text-[#64748B]'
                          }`}
                      >
                        {item.record}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${item.rank === 1
                      ? 'bg-[#D7F66B] text-[#172131]'
                      : 'bg-[#E5E8E3] text-[#253247]'
                      }`}
                  >
                    {item.badge}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Add / Edit Participant Modal */}
      <Modal
        isOpen={participantModalOpen}
        onClose={() => setParticipantModalOpen(false)}
        title={editingParticipant ? 'Edit Participant' : 'Add Participant'}
        description="Register a player or doubles pair and assign their seed number."
        size="md"
      >
        <form onSubmit={handleSaveParticipant} className="space-y-3.5">
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[#172131]">
              {tournament.match_type === 'Doubles'
                ? 'Team / Pair Name (e.g. Johns / Waters)'
                : 'Player Full Name'}
            </label>
            <input
              type="text"
              required
              value={participantForm.name}
              onChange={(e) =>
                setParticipantForm({ ...participantForm, name: e.target.value })
              }
              placeholder={
                tournament.match_type === 'Doubles'
                  ? 'Player 1 / Player 2'
                  : 'Player Name'
              }
              className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-3 text-[12px] text-[#172131]"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[#172131]">
                Seed Number
              </label>
              <input
                type="number"
                min={1}
                max={32}
                required
                value={participantForm.seed}
                onChange={(e) =>
                  setParticipantForm({
                    ...participantForm,
                    seed: Number(e.target.value),
                  })
                }
                className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-3 text-[12px] text-[#172131]"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[#172131]">
                Status
              </label>
              <select
                value={participantForm.status}
                onChange={(e) =>
                  setParticipantForm({
                    ...participantForm,
                    status: e.target.value,
                  })
                }
                className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-2.5 text-[12px] text-[#172131]"
              >
                <option value="Confirmed">Confirmed</option>
                <option value="Checked-In">Checked-In</option>
                <option value="Waitlist">Waitlist</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[#172131]">
                Category
              </label>
              <input
                type="text"
                value={participantForm.category}
                onChange={(e) =>
                  setParticipantForm({
                    ...participantForm,
                    category: e.target.value,
                  })
                }
                className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-3 text-[12px] text-[#172131]"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[#172131]">
                Registration Date
              </label>
              <input
                type="date"
                value={participantForm.registered_at}
                onChange={(e) =>
                  setParticipantForm({
                    ...participantForm,
                    registered_at: e.target.value,
                  })
                }
                className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-2.5 text-[12px] text-[#172131]"
              />
            </div>
          </div>

          <div className="flex flex-wrap-reverse items-center justify-end gap-2 border-t border-[#E5E8E3] pt-3 sm:flex-nowrap">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setParticipantModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              {editingParticipant ? 'Save Changes' : 'Add Participant'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Finalize Bracket Match Score Modal */}
      <Modal
        isOpen={Boolean(scoreModalMatch)}
        onClose={() => setScoreModalMatch(null)}
        title={`Record Match Result — ${scoreModalMatch?.code || ''}`}
        description="Finalizing this match automatically advances the winning team in the bracket."
        size="md"
      >
        {scoreModalMatch && (
          <form onSubmit={handleSaveMatchResult} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-[#E5E8E3] bg-[#F5F5F0] p-3">
                <p className="truncate text-[12px] font-bold text-[#172131]">
                  {scoreModalMatch.team_a}
                </p>
                <label className="mt-2 block text-[10px] font-semibold uppercase text-[#64748B]">
                  Score
                </label>
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={scoreForm.score_a}
                  onChange={(e) => {
                    const val = Number(e.target.value)
                    setScoreForm((prev) => ({
                      ...prev,
                      score_a: val,
                      winner:
                        val >= prev.score_b
                          ? scoreModalMatch.team_a
                          : scoreModalMatch.team_b,
                    }))
                  }}
                  className="mt-1 h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-3 text-[14px] font-bold text-[#172131]"
                />
              </div>

              <div className="rounded-lg border border-[#E5E8E3] bg-[#F5F5F0] p-3">
                <p className="truncate text-[12px] font-bold text-[#172131]">
                  {scoreModalMatch.team_b}
                </p>
                <label className="mt-2 block text-[10px] font-semibold uppercase text-[#64748B]">
                  Score
                </label>
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={scoreForm.score_b}
                  onChange={(e) => {
                    const val = Number(e.target.value)
                    setScoreForm((prev) => ({
                      ...prev,
                      score_b: val,
                      winner:
                        prev.score_a >= val
                          ? scoreModalMatch.team_a
                          : scoreModalMatch.team_b,
                    }))
                  }}
                  className="mt-1 h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-3 text-[14px] font-bold text-[#172131]"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold text-[#172131]">
                Advancing Winner
              </label>
              <select
                value={scoreForm.winner}
                onChange={(e) =>
                  setScoreForm({ ...scoreForm, winner: e.target.value })
                }
                className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-3 text-[12px] font-semibold text-[#172131]"
              >
                <option value={scoreModalMatch.team_a}>
                  {scoreModalMatch.team_a}
                </option>
                <option value={scoreModalMatch.team_b}>
                  {scoreModalMatch.team_b}
                </option>
              </select>
            </div>

            <div className="flex flex-wrap-reverse items-center justify-end gap-2 border-t border-[#E5E8E3] pt-3 sm:flex-nowrap">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setScoreModalMatch(null)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Save & Advance Winner
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Schedule & Assign Court Modal */}
      <Modal
        isOpen={Boolean(scheduleModalMatch)}
        onClose={() => setScheduleModalMatch(null)}
        title={`Assign Court & Schedule — ${scheduleModalMatch?.code || ''}`}
        description={`${scheduleModalMatch?.team_a || ''} vs ${scheduleModalMatch?.team_b || ''}`}
        size="md"
      >
        {scheduleModalMatch && (
          <form onSubmit={handleSaveSchedule} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-[#172131]">
                  Match Date
                </label>
                <input
                  type="date"
                  required
                  value={scheduleForm.scheduled_date}
                  onChange={(e) =>
                    setScheduleForm({
                      ...scheduleForm,
                      scheduled_date: e.target.value,
                    })
                  }
                  className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-2.5 text-[12px] text-[#172131]"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-[#172131]">
                  Start Time
                </label>
                <select
                  value={scheduleForm.start_time}
                  onChange={(e) =>
                    setScheduleForm({
                      ...scheduleForm,
                      start_time: e.target.value,
                    })
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
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] font-semibold text-[#172131]">
                Select Available Court (Conflict-Checked)
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {scheduleAvailability.map((c) => {
                  const selected =
                    Number(scheduleForm.court_id) === Number(c.id)
                  return (
                    <button
                      key={c.id}
                      type="button"
                      disabled={!c.available}
                      onClick={() =>
                        setScheduleForm({ ...scheduleForm, court_id: c.id })
                      }
                      className={`flex items-center justify-between rounded-lg border p-2.5 text-left text-[11px] transition-all ${selected
                        ? 'border-[#172131] bg-[#253247] text-[#FFFFFF]'
                        : c.available
                          ? 'border-[#E5E8E3] bg-[#FFFFFF] text-[#172131] hover:border-[#253247]'
                          : 'cursor-not-allowed border-[#E5E8E3] bg-[#F5F5F0] text-[#AEB8C7]'
                        }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">
                          Court #{c.court_number} • {c.name}
                        </p>
                        <p
                          className={`truncate text-[10px] ${selected
                            ? 'text-[#D7F66B]'
                            : c.available
                              ? 'text-[#12B9B0]'
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

            <div className="flex flex-wrap-reverse items-center justify-end gap-2 border-t border-[#E5E8E3] pt-3 sm:flex-nowrap">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setScheduleModalMatch(null)}
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

      {/* Confirm Remove Participant */}
      <ConfirmDialog
        isOpen={Boolean(deleteParticipantTarget)}
        onClose={() => setDeleteParticipantTarget(null)}
        onConfirm={async () => {
          if (deleteParticipantTarget) {
            try {
              await removeParticipant(tournament.id, deleteParticipantTarget.id)
              showToast({
                type: 'info',
                title: 'Participant Removed',
                message: `${deleteParticipantTarget.name} removed from ${tournament.name}.`,
              })
            } catch (err) {
              showToast({
                type: 'error',
                title: 'Remove Error',
                message: extractErrorMessage(err),
              })
            }
            setDeleteParticipantTarget(null)
          }
        }}
        title="Remove Participant"
        message={`Are you sure you want to remove "${deleteParticipantTarget?.name}" from this tournament?`}
        confirmLabel="Remove Participant"
        variant="danger"
      />
    </div>
  )
}

