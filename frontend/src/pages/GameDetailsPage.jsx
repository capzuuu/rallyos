import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  Calendar,
  Clock,
  Edit3,
  History,
  MapPin,
  Monitor,
  Play,
  Radio,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { Modal } from '../components/ui/Modal'
import { useRally } from '../hooks/useRally'
import { useToast } from '../hooks/useToast'
import {
  DURATION_OPTIONS,
  MATCH_FORMATS,
  POINTS_OPTIONS,
  SCORING_TYPES,
} from '../utils/constants'
import { computeEndTime, formatShortDate } from '../utils/formatters'

export function GameDetailsPage() {
  const { gameId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const {
    games,
    getCourtsAvailability,
    updateGame,
    startGame,
  } = useRally()

  const game = useMemo(
    () =>
      games.find(
        (g) => String(g.id) === String(gameId) || g.code === gameId
      ),
    [games, gameId]
  )

  const [editOpen, setEditOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [editForm, setEditForm] = useState(null)

  if (!game) {
    return (
      <Card className="p-8 text-center">
        <p className="rally-section-heading text-[#172131]">
          Game &ldquo;{gameId}&rdquo; not found
        </p>
        <Link to="/games" className="mt-4 inline-block">
          <Button variant="secondary">Back to Games</Button>
        </Link>
      </Card>
    )
  }

  function openEdit() {
    setEditForm({
      scheduled_date: game.scheduled_date,
      start_time: game.start_time,
      duration_minutes: game.duration_minutes || 45,
      court_id: String(game.court_id || ''),
      match_format: game.match_format,
      scoring_type: game.scoring_type,
      points_to_win: game.points_to_win,
      win_by_two: game.win_by_two,
    })
    setEditOpen(true)
  }

  async function handleSaveEdit(e) {
    e.preventDefault()
    const durationMins = Number(editForm.duration_minutes)
    if (!Number.isFinite(durationMins) || durationMins < 5 || durationMins > 480) {
      toast.error('Duration must be between 5 and 480 minutes.')
      return
    }
    try {
      await updateGame(game.code, {
        scheduled_date: editForm.scheduled_date,
        start_time: editForm.start_time,
        end_time: computeEndTime(editForm.start_time, durationMins),
        duration_minutes: durationMins,
        court_id: editForm.court_id ? Number(editForm.court_id) : null,
        match_format: editForm.match_format,
        scoring_type: editForm.scoring_type,
        points_to_win: Number(editForm.points_to_win),
        win_by_two: Boolean(editForm.win_by_two),
      })
      toast.success(`${game.code} schedule and rules updated.`)
      setEditOpen(false)
    } catch (err) {
      toast.error(err.message)
    }
  }

  const pointOptions = Array.from(
    new Set(
      [
        ...POINTS_OPTIONS,
        Number(game.points_to_win),
        Number(editForm?.points_to_win),
      ].filter((n) => Number.isInteger(n) && n >= 1)
    )
  ).sort((a, b) => a - b)

  const editAvailability = editForm
    ? getCourtsAvailability(
        editForm.scheduled_date,
        editForm.start_time,
        Number(editForm.duration_minutes) || 45,
        game.id
      )
    : []

  return (
    <div className="space-y-5">
      {/* Top Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
          <Link to="/games" className="shrink-0">
            <Button variant="secondary" size="sm">
              <ArrowLeft className="h-3.5 w-3.5" />
              Games
            </Button>
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="rally-page-title text-[#172131] break-words">
                {game.code}
              </h1>
              <Badge status={game.status} />
            </div>
            <p className="rally-page-desc text-[#253247]/75 break-words">
              {game.match_type} • {game.match_format} • {game.scoring_type} to{' '}
              {game.points_to_win} {game.win_by_two ? '(Win by 2)' : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {game.status === 'Upcoming' && (
            <Button
              variant="primary"
              onClick={async () => {
                await startGame(game.code)
                toast.success(`${game.code} started!`)
                navigate(`/scorekeeper/${game.code}`)
              }}
            >
              <Play className="h-4 w-4" />
              Start Match
            </Button>
          )}
          {game.status !== 'Cancelled' && (
            <Link to={`/scorekeeper/${game.code}`}>
              <Button variant="primary">
                <Radio className="h-4 w-4" />
                Open Scorekeeper
              </Button>
            </Link>
          )}
          <Link to={`/scoreboard/${game.code}`}>
            <Button variant="navy">
              <Monitor className="h-4 w-4" />
              Public Scoreboard
            </Button>
          </Link>
          {game.status !== 'Completed' && game.status !== 'Cancelled' && (
            <>
              <Button variant="secondary" onClick={openEdit}>
                <Edit3 className="h-3.5 w-3.5" />
                Edit / Reschedule
              </Button>
              <Button variant="danger" onClick={() => setCancelOpen(true)}>
                <XCircle className="h-3.5 w-3.5" />
                Cancel
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Live / Match Score Banner */}
      <div className="rounded-2xl border border-[#3C485B] bg-[#172131] p-4 text-[#F1F3F5] sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-[#3C485B] pb-3 text-[12px]">
          <span className="font-semibold text-[#AEB8C7]">
            {game.court_name} • Game {game.current_game_number}
          </span>
          <span className="font-semibold text-[#12B9B0]">
            {game.status === 'Live'
              ? `Serving: Team ${game.serving_team} ${
                  game.match_type === 'Doubles'
                    ? `(Server #${game.server_number})`
                    : ''
                }`
              : `Status: ${game.status}`}
          </span>
        </div>

        <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-3 md:gap-6">
          {/* Team A */}
          <div className="min-w-0 rounded-xl border border-[#3C485B] bg-[#253247] p-3.5 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-[#AEB8C7] uppercase">
                Team A
              </span>
              {game.serving_team === 'A' && game.status === 'Live' && (
                <span className="rounded bg-[#12B9B0] px-2 py-0.5 text-[10px] font-bold text-[#FFFFFF]">
                  SERVING{' '}
                  {game.match_type === 'Doubles' ? `#${game.server_number}` : ''}
                </span>
              )}
              {game.winner_team === 'A' && (
                <span className="rounded bg-[#D7F66B] px-2 py-0.5 text-[10px] font-bold text-[#172131]">
                  WINNER
                </span>
              )}
            </div>
            <p className="mt-1.5 break-words text-[16px] font-bold text-[#FFFFFF] sm:text-[17px]">
              {game.team_a_name}
            </p>
            {game.team_a_players &&
              game.team_a_players.length > 0 &&
              game.team_a_players.join(' / ') !== game.team_a_name && (
                <p className="mt-0.5 break-words text-[11px] text-[#AEB8C7]">
                  {game.team_a_players.join(' • ')}
                </p>
              )}
          </div>

          {/* Center Score */}
          <div className="flex flex-col items-center justify-center text-center">
            <div className="flex items-center gap-3 sm:gap-5">
              <span className="text-[44px] font-bold leading-none tabular-nums text-[#D7F66B] sm:text-[56px]">
                {game.score_a}
              </span>
              <span className="text-[20px] font-bold text-[#AEB8C7] sm:text-[24px]">
                :
              </span>
              <span className="text-[44px] font-bold leading-none tabular-nums text-[#D7F66B] sm:text-[56px]">
                {game.score_b}
              </span>
            </div>
            {game.set_scores && game.set_scores.length > 0 && (
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {game.set_scores.map((s) => (
                  <span
                    key={s.game}
                    className="rounded border border-[#3C485B] bg-[#253247] px-2 py-0.5 text-[11px] text-[#F1F3F5]"
                  >
                    G{s.game}: {s.score_a}-{s.score_b}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Team B */}
          <div className="min-w-0 rounded-xl border border-[#3C485B] bg-[#253247] p-3.5 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-[#AEB8C7] uppercase">
                Team B
              </span>
              {game.serving_team === 'B' && game.status === 'Live' && (
                <span className="rounded bg-[#12B9B0] px-2 py-0.5 text-[10px] font-bold text-[#FFFFFF]">
                  SERVING{' '}
                  {game.match_type === 'Doubles' ? `#${game.server_number}` : ''}
                </span>
              )}
              {game.winner_team === 'B' && (
                <span className="rounded bg-[#D7F66B] px-2 py-0.5 text-[10px] font-bold text-[#172131]">
                  WINNER
                </span>
              )}
            </div>
            <p className="mt-1.5 break-words text-[16px] font-bold text-[#FFFFFF] sm:text-[17px]">
              {game.team_b_name}
            </p>
            {game.team_b_players &&
              game.team_b_players.length > 0 &&
              game.team_b_players.join(' / ') !== game.team_b_name && (
                <p className="mt-0.5 break-words text-[11px] text-[#AEB8C7]">
                  {game.team_b_players.join(' • ')}
                </p>
              )}
          </div>
        </div>
      </div>

      {/* Metadata & Match History */}
      <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-3">
        <Card className="space-y-3 p-4 lg:col-span-1">
          <h2 className="rally-card-heading border-b border-[#E5E8E3] pb-2 text-[#172131]">
            Match Information
          </h2>
          <div className="space-y-2.5 text-[12px]">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1.5 text-[#253247]/70">
                <MapPin className="h-3.5 w-3.5 shrink-0" /> Assigned Court
              </span>
              <span className="text-right font-semibold break-words text-[#172131]">
                {game.court_name}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1.5 text-[#253247]/70">
                <Calendar className="h-3.5 w-3.5 shrink-0" /> Scheduled Date
              </span>
              <span className="text-right font-semibold text-[#172131]">
                {formatShortDate(game.scheduled_date)}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1.5 text-[#253247]/70">
                <Clock className="h-3.5 w-3.5 shrink-0" /> Time Window
              </span>
              <span className="text-right font-semibold text-[#172131]">
                {game.start_time} – {game.end_time} ({game.duration_minutes}m)
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1.5 text-[#253247]/70">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" /> Scoring Rules
              </span>
              <span className="text-right font-semibold break-words text-[#172131]">
                {game.scoring_type} • {game.points_to_win} pts{' '}
                {game.win_by_two ? '(Win by 2)' : ''}
              </span>
            </div>
          </div>
        </Card>

        <Card className="p-4 lg:col-span-2">
          <div className="flex items-center justify-between border-b border-[#E5E8E3] pb-2">
            <h2 className="rally-card-heading inline-flex items-center gap-1.5 text-[#172131]">
              <History className="h-4 w-4 shrink-0 text-[#253247]" />
              Match Scoring History ({(game.score_events || []).length})
            </h2>
          </div>
          {!game.score_events || game.score_events.length === 0 ? (
            <p className="py-8 text-center text-[12px] text-[#253247]/65">
              No scoring events recorded yet. Start the match in Scorekeeper mode to log points.
            </p>
          ) : (
            <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
              {[...game.score_events].reverse().map((ev) => (
                <div
                  key={ev.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#E5E8E3] bg-[#F5F5F0] px-3 py-2 text-[12px]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold break-words text-[#172131]">
                      {ev.description}
                    </p>
                    <p className="text-[10px] text-[#253247]/65">
                      Game {ev.game_number} • Server: Team {ev.serving_team}{' '}
                      {game.match_type === 'Doubles'
                        ? `#${ev.server_number}`
                        : ''}
                    </p>
                  </div>
                  <span className="shrink-0 rounded bg-[#253247] px-2 py-0.5 font-bold text-[#D7F66B]">
                    {ev.score_a} - {ev.score_b}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Edit / Reschedule Modal */}
      {editForm && (
        <Modal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          title={`Reschedule / Edit ${game.code}`}
          description="Update court assignment, time slot, or match format."
        >
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-[11px] font-semibold text-[#253247]">
                  Date
                </label>
                <input
                  type="date"
                  required
                  value={editForm.scheduled_date}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      scheduled_date: e.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-[#E5E8E3] px-2.5 py-1.5 text-[12px]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#253247]">
                  Start Time
                </label>
                <input
                  type="time"
                  required
                  value={editForm.start_time}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      start_time: e.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-[#E5E8E3] px-2.5 py-1.5 text-[12px]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#253247]">
                  Duration (End:{' '}
                  {computeEndTime(
                    editForm.start_time,
                    Number(editForm.duration_minutes) || 45
                  )}
                  )
                </label>
                <div className="mt-1 flex items-center gap-1.5">
                  <input
                    type="number"
                    min={5}
                    max={480}
                    required
                    value={editForm.duration_minutes}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        duration_minutes:
                          e.target.value === '' ? '' : Number(e.target.value),
                      }))
                    }
                    className="w-full rounded-lg border border-[#E5E8E3] px-2.5 py-1.5 text-[12px]"
                  />
                  <span className="shrink-0 text-[11px] font-medium text-[#64748B]">
                    mins
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {DURATION_OPTIONS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() =>
                        setEditForm((prev) => ({
                          ...prev,
                          duration_minutes: d,
                        }))
                      }
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
                        Number(editForm.duration_minutes) === d
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

            <div>
              <label className="block text-[11px] font-semibold text-[#253247]">
                Assigned Court
              </label>
              <select
                value={editForm.court_id}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, court_id: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-[#E5E8E3] px-2.5 py-1.5 text-[12px]"
              >
                {editAvailability.map((c) => (
                  <option key={c.id} value={c.id} disabled={!c.available}>
                    {c.name} — {c.conflictReason}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-[11px] font-semibold text-[#253247]">
                  Format
                </label>
                <select
                  value={editForm.match_format}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      match_format: e.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-[#E5E8E3] px-2.5 py-1.5 text-[12px]"
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
                  Scoring
                </label>
                <select
                  value={editForm.scoring_type}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      scoring_type: e.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-[#E5E8E3] px-2.5 py-1.5 text-[12px]"
                >
                  {SCORING_TYPES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#253247]">
                  Points
                </label>
                <select
                  value={editForm.points_to_win}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      points_to_win: Number(e.target.value),
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-[#E5E8E3] px-2.5 py-1.5 text-[12px]"
                >
                  {pointOptions.map((pt) => (
                    <option key={pt} value={pt}>
                      To {pt}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap-reverse justify-end gap-2 border-t border-[#E5E8E3] pt-3 sm:flex-nowrap">
              <Button variant="secondary" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Save Changes</Button>
            </div>
          </form>
        </Modal>
      )}

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={async () => {
          await updateGame(game.code, { status: 'Cancelled' })
          toast.info(`${game.code} cancelled.`)
          setCancelOpen(false)
        }}
        title="Cancel Match"
        message={`Are you sure you want to cancel ${game.code}?`}
        confirmText="Cancel Match"
      />
    </div>
  )
}

