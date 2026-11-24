import { useMemo, useState } from 'react'
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  Monitor,
  Play,
  Radio,
  Search,
  Trophy,
} from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import StatCard from '../components/ui/StatCard'
import { useRally } from '../hooks/useRally'
import { useToast } from '../hooks/useToast'
import { formatShortDate } from '../utils/formatters'

export default function ScorekeeperHubPage() {
  const { games, courts, startGame } = useRally()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()

  const isTvModeDefault = location.pathname.startsWith('/scoreboard')
  const [search, setSearch] = useState('')
  const [courtFilter, setCourtFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')

  const liveGames = useMemo(
    () => games.filter((g) => g.status === 'Live'),
    [games]
  )
  const upcomingGames = useMemo(
    () => games.filter((g) => g.status === 'Upcoming'),
    [games]
  )
  const completedGames = useMemo(
    () => games.filter((g) => g.status === 'Completed'),
    [games]
  )

  const filteredGames = useMemo(() => {
    return games.filter((g) => {
      if (g.status === 'Cancelled') return false
      if (statusFilter !== 'ALL' && g.status !== statusFilter) return false
      if (
        courtFilter !== 'ALL' &&
        String(g.court_id) !== String(courtFilter)
      ) {
        return false
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const hay = `${g.code} ${g.team_a_name} ${g.team_b_name} ${g.court_name || ''} ${g.tournament_name || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [games, statusFilter, courtFilter, search])

  const handleStartAndScore = async (game) => {
    try {
      await startGame(game.code)
      toast.success(`${game.code} is now LIVE on ${game.court_name}.`)
      navigate(`/scorekeeper/${game.code}`)
    } catch (err) {
      toast.error(err.message || 'Unable to start match.')
    }
  }

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="rally-page-title text-[#172131]">
              {isTvModeDefault
                ? 'TV Scoreboard Monitor Console'
                : 'Scorekeeper & Live Scoring Console'}
            </h1>
            <span className="shrink-0 rounded-md bg-[#253247] px-2.5 py-0.5 text-[11px] font-bold text-[#D7F66B]">
              Official Scoring &amp; TV Display
            </span>
          </div>
          <p className="rally-page-desc mt-0.5 text-[#253247]/75">
            {isTvModeDefault
              ? 'Launch full-screen arena TV scoreboards for any live or scheduled court match.'
              : 'Operate official point-by-point match scoring, server rotation, and live TV scoreboards.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link to="/scorekeeper">
            <Button
              variant={!isTvModeDefault ? 'primary' : 'secondary'}
              size="sm"
            >
              <Radio className="h-3.5 w-3.5" />
              <span>Live Scorekeeper</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        <StatCard
          label="Live Matches on Court"
          value={liveGames.length}
          subtitle="Active scoring in progress"
          icon={Radio}
          accent="teal"
        />
        <StatCard
          label="Upcoming Matches Ready"
          value={upcomingGames.length}
          subtitle="Assigned & ready to start"
          icon={Clock}
          accent="lime"
        />
        <StatCard
          label="Completed Matches"
          value={completedGames.length}
          subtitle="Official results recorded"
          icon={CheckCircle2}
          accent="success"
        />
      </div>

      {/* Featured Live Courts Banner */}
      {liveGames.length > 0 && (
        <div className="rounded-2xl border border-[#3C485B] bg-[#172131] p-3.5 text-[#F1F3F5] sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-[#12B9B0]" />
              <h2 className="text-[14px] font-bold text-[#FFFFFF] sm:text-[15px]">
                Live Courts — Active Scoring &amp; TV Broadcasts
              </h2>
            </div>
            <span className="text-[11px] text-[#AEB8C7]">
              Real-time WebSocket &amp; BroadcastChannel Sync
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 md:gap-4">
            {liveGames.map((g) => (
              <div
                key={g.code}
                className="flex min-w-0 flex-col justify-between rounded-xl border border-[#12B9B0]/60 bg-[#253247] p-3.5 sm:p-4"
              >
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-[#172131] px-2 py-0.5 font-bold text-[#D7F66B]">
                        {g.code}
                      </span>
                      <span className="font-semibold text-[#FFFFFF]">
                        {g.court_name}
                      </span>
                    </div>
                    <span className="rounded bg-[#12B9B0] px-2 py-0.5 text-[10px] font-bold text-[#FFFFFF]">
                      GAME {g.current_game_number} • LIVE
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-1 items-center gap-2 rounded-xl bg-[#172131] p-3 text-center sm:grid-cols-3 sm:text-left">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-bold text-[#FFFFFF]">
                        {g.team_a_name}
                      </p>
                      <p className="text-[10px] text-[#AEB8C7]">
                        {g.serving_team === 'A'
                          ? `Serving ${g.match_type === 'Doubles' ? `#${g.server_number}` : ''}`
                          : 'Receiving'}
                      </p>
                    </div>

                    <div className="text-center">
                      <span className="font-mono text-[24px] font-bold tabular-nums text-[#D7F66B] sm:text-[26px]">
                        {g.score_a} - {g.score_b}
                      </span>
                    </div>

                    <div className="min-w-0 sm:text-right">
                      <p className="truncate text-[13px] font-bold text-[#FFFFFF]">
                        {g.team_b_name}
                      </p>
                      <p className="text-[10px] text-[#AEB8C7]">
                        {g.serving_team === 'B'
                          ? `Serving ${g.match_type === 'Doubles' ? `#${g.server_number}` : ''}`
                          : 'Receiving'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-3.5 grid grid-cols-1 gap-2.5 min-[380px]:grid-cols-2">
                  <Link
                    to={`/scorekeeper/${g.code}`}
                    className="flex items-center justify-center gap-1.5 rounded-lg bg-[#D7F66B] px-3 py-2.5 text-[12px] font-bold text-[#172131] hover:brightness-95"
                  >
                    <Radio className="h-3.5 w-3.5" />
                    <span>Open Scorekeeper</span>
                  </Link>
                  <Link
                    to={`/scoreboard/${g.code}`}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-[#3C485B] bg-[#172131] px-3 py-2.5 text-[12px] font-bold text-[#F1F3F5] hover:border-[#12B9B0]"
                  >
                    <Monitor className="h-3.5 w-3.5 text-[#12B9B0]" />
                    <span>TV Scoreboard</span>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search & Filters */}
      <Card className="p-3 sm:p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search game code, team, or court..."
              className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] pr-3 pl-9 text-[12px] text-[#172131]"
            />
          </div>

          <select
            value={courtFilter}
            onChange={(e) => setCourtFilter(e.target.value)}
            className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-3 text-[12px] text-[#172131]"
          >
            <option value="ALL">All Courts</option>
            {courts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rally-focus h-9 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-3 text-[12px] text-[#172131]"
          >
            <option value="ALL">All Match Statuses</option>
            <option value="Live">Live Matches</option>
            <option value="Upcoming">Upcoming Matches</option>
            <option value="Completed">Completed Matches</option>
          </select>
        </div>
      </Card>

      {/* All Matches Table for Scorekeeper & TV Scoreboard */}
      <Card
        title="Match Scoring & TV Scoreboard Directory"
        subtitle="Select any match below to operate the Scorekeeper terminal or open the TV Scoreboard"
      >
        <div className="rally-scroll-x">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[#E5E8E3] bg-[#F5F5F0]/70 text-[11px] font-semibold tracking-wider text-[#64748B] uppercase">
                <th className="px-4 py-3">Match</th>
                <th className="px-4 py-3">Teams / Players</th>
                <th className="px-4 py-3">Court &amp; Time</th>
                <th className="px-4 py-3">Rules</th>
                <th className="px-4 py-3">Live Score</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">
                  Scorekeeper &amp; TV Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E8E3] text-[12px]">
              {filteredGames.map((g) => (
                <tr
                  key={g.code}
                  className="transition-colors hover:bg-[#F5F5F0]/50"
                >
                  <td className="px-4 py-3">
                    <span className="rounded bg-[#253247] px-2 py-1 font-mono text-[11px] font-bold text-[#D7F66B]">
                      {g.code}
                    </span>
                    {g.tournament_name && (
                      <span className="mt-1 block text-[10px] font-medium text-[#12B9B0]">
                        {g.tournament_name}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-bold text-[#172131]">
                      {g.team_a_name}{' '}
                      <span className="font-normal text-[#64748B]">vs</span>{' '}
                      {g.team_b_name}
                    </p>
                    <p className="text-[11px] text-[#64748B]">
                      {g.match_type} • Game {g.current_game_number}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-[#172131]">
                      {g.court_name}
                    </p>
                    <p className="text-[11px] text-[#64748B]">
                      {formatShortDate(g.scheduled_date)} • {g.start_time}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-[11px] text-[#64748B]">
                    <p className="font-semibold text-[#172131]">
                      {g.scoring_type} to {g.points_to_win}
                    </p>
                    <p>{g.match_format}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#172131] px-2.5 py-1 font-mono text-[13px] font-bold text-[#D7F66B]">
                      {g.score_a} - {g.score_b}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge status={g.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                      {g.status === 'Upcoming' && (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => handleStartAndScore(g)}
                        >
                          <Play className="h-3.5 w-3.5" />
                          <span>Start &amp; Score</span>
                        </Button>
                      )}
                      {g.status !== 'Upcoming' && (
                        <Link to={`/scorekeeper/${g.code}`}>
                          <Button size="sm" variant="primary">
                            <Radio className="h-3.5 w-3.5" />
                            <span>
                              {g.status === 'Completed'
                                ? 'Score Log'
                                : 'Score Match'}
                            </span>
                          </Button>
                        </Link>
                      )}
                      <Link to={`/scoreboard/${g.code}`}>
                        <Button size="sm" variant="navy">
                          <Monitor className="h-3.5 w-3.5" />
                          <span>TV Scoreboard</span>
                        </Button>
                      </Link>
                      <Link
                        to={`/scoreboard/${g.code}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] text-[#253247] hover:bg-[#F5F5F0]"
                        title="Open TV Scoreboard in new tab"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredGames.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-[12px] text-[#64748B]"
                  >
                    No matches match the current filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

