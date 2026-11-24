import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  History,
  Maximize2,
  Minimize2,
  Plus,
  RefreshCw,
  RotateCcw,
  Square,
  Trophy,
} from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import Logo from '../components/ui/Logo'
import { useGameWebSocket } from '../hooks/useGameWebSocket'
import { useRally } from '../hooks/useRally'
import { useToast } from '../hooks/useToast'
import { formatElapsedSeconds } from '../utils/formatters'

export function ScorekeeperPage() {
  const { gameId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const containerRef = useRef(null)

  const {
    games,
    isScorekeeper,
    addPoint,
    changeServer,
    triggerSideOut,
    undoLastEvent,
    completeGame,
    pushNotification,
    syncGameFromRealtime,
  } = useRally()

  const game = useMemo(
    () =>
      games.find(
        (g) => String(g.id) === String(gameId) || g.code === gameId
      ),
    [games, gameId]
  )

  // Real-time bidirectional WebSocket sync
  const handleWsGameUpdate = useCallback(
    (authoritativeGame) => {
      syncGameFromRealtime(authoritativeGame)
    },
    [syncGameFromRealtime]
  )

  const { isConnected: wsConnected, latencyMs, sendAction } = useGameWebSocket(
    game?.code || gameId,
    handleWsGameUpdate
  )

  const handleAddPoint = (team) => {
    if (!game || game.status === 'Completed') return
    const sent = sendAction('SCORE_POINT', { team })
    addPoint(game.code, team, !sent)
  }

  const handleChangeServer = (servingTeam, serverNumber, label) => {
    if (!game || game.status === 'Completed') return
    const sent = sendAction('CHANGE_SERVER', {
      serving_team: servingTeam,
      server_number: serverNumber,
    })
    changeServer(game.code, servingTeam, serverNumber, label, !sent)
  }

  const handleSideOut = () => {
    if (!game || game.status === 'Completed') return
    const sent = sendAction('TRIGGER_SIDEOUT')
    triggerSideOut(game.code, !sent)
  }

  const handleUndo = () => {
    if (!game || reversibleEventsCount === 0 || game.status === 'Completed') return
    const sent = sendAction('UNDO_POINT')
    undoLastEvent(game.code, !sent)
    toast.info('Undid most recent scoring action.')
  }

  const [elapsed, setElapsed] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [confirmEndOpen, setConfirmEndOpen] = useState(false)
  const [showHistory, setShowHistory] = useState(true)

  // Real-time animated "+1" point slide indicators
  const [animPointA, setAnimPointA] = useState(null)
  const [animPointB, setAnimPointB] = useState(null)
  const prevScoresRef = useRef({ a: null, b: null, code: null })

  // Trigger slide +1 animation whenever score increments
  useEffect(() => {
    if (!game) return
    const prev = prevScoresRef.current

    if (prev.code === game.code) {
      if (typeof prev.a === 'number' && game.score_a > prev.a) {
        setAnimPointA({ id: Date.now(), diff: game.score_a - prev.a })
      }
      if (typeof prev.b === 'number' && game.score_b > prev.b) {
        setAnimPointB({ id: Date.now(), diff: game.score_b - prev.b })
      }
    }

    prevScoresRef.current = { a: game.score_a, b: game.score_b, code: game.code }
  }, [game])

  // Live Match Timer
  useEffect(() => {
    if (!game || game.status === 'Completed' || game.status === 'Cancelled') {
      return undefined
    }
    const baseMs = game.started_at
      ? new Date(game.started_at).getTime()
      : Date.now()
    const updateClock = () => {
      const diff = Math.max(0, Math.floor((Date.now() - baseMs) / 1000))
      setElapsed(diff)
    }
    updateClock()
    const timer = setInterval(updateClock, 1000)
    return () => clearInterval(timer)
  }, [game])

  if (!game) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-[#172131] p-4 text-center text-[#F1F3F5] sm:p-6">
        <p className="break-words text-[17px] font-semibold">
          Game &ldquo;{gameId}&rdquo; not found
        </p>
        <Link
          to={isScorekeeper ? '/scorekeeper' : '/games'}
          className="mt-4 rounded-lg bg-[#D7F66B] px-4 py-2 text-[12px] font-semibold text-[#172131]"
        >
          {isScorekeeper ? 'Return to Scorekeeper Console' : 'Return to Games'}
        </Link>
      </div>
    )
  }

  const exitPath = isScorekeeper ? '/scorekeeper' : `/games/${game.code}`

  // Evaluate whether target points / win-by-two has been reached
  const margin = game.win_by_two ? 2 : 1
  const targetPts = Number(game.points_to_win || 11)
  const teamAReachedTarget =
    game.score_a >= targetPts && game.score_a - game.score_b >= margin
  const teamBReachedTarget =
    game.score_b >= targetPts && game.score_b - game.score_a >= margin
  const matchPointReached = teamAReachedTarget || teamBReachedTarget
  const leadingTeamName = teamAReachedTarget
    ? game.team_a_name
    : teamBReachedTarget
      ? game.team_b_name
      : game.score_a >= game.score_b
        ? game.team_a_name
        : game.team_b_name

  const reversibleEventsCount = (game.score_events || []).filter(
    (e) => e.prev
  ).length

  // Traditional Pickleball 3-number callout (Server Score - Receiver Score - Server #)
  const serverScore =
    game.serving_team === 'A' ? game.score_a : game.score_b
  const receiverScore =
    game.serving_team === 'A' ? game.score_b : game.score_a
  const officialCallout =
    game.match_type === 'Doubles'
      ? `${serverScore} - ${receiverScore} - ${game.server_number}`
      : `${serverScore} - ${receiverScore}`

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.().catch(() => { })
      setIsFullscreen(true)
    } else {
      document.exitFullscreen?.().catch(() => { })
      setIsFullscreen(false)
    }
  }

  function handleEndMatchConfirm() {
    const winner = teamAReachedTarget
      ? 'A'
      : teamBReachedTarget
        ? 'B'
        : game.score_a >= game.score_b
          ? 'A'
          : 'B'
    completeGame(game.code, winner)
    const winnerLabel = winner === 'A' ? game.team_a_name : game.team_b_name
    toast.success(`Match ${game.code} finalized! Winner: ${winnerLabel}.`)
    pushNotification(
      `${game.code} Finalized`,
      `${winnerLabel} won (${game.score_a}-${game.score_b})`
    )
    setConfirmEndOpen(false)
  }

  return (
    <div
      ref={containerRef}
      className="flex min-h-dvh flex-col bg-[#172131] text-[#F1F3F5]"
    >
      {/* LIVE GAME HEADER */}
      <header className="flex flex-col gap-2.5 border-b border-[#3C485B] bg-[#253247] px-3 py-2.5 sm:px-6 sm:py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5 sm:gap-3">
          <Link
            to={exitPath}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#3C485B] bg-[#172131] px-2.5 py-1.5 text-[12px] font-semibold text-[#F1F3F5] hover:border-[#D7F66B]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Exit
          </Link>

          <div className="flex min-w-0 items-center gap-2.5">
            <Logo
              variant="icon"
              theme="dark"
              className="h-7 w-auto shrink-0"
              alt="RallyOS"
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span className="text-[14px] font-bold text-[#FFFFFF]">
                  {game.code}
                </span>
                <span className="rounded bg-[#172131] px-2 py-0.5 text-[11px] font-semibold text-[#D7F66B]">
                  {game.court_name}
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-bold ${game.status === 'Completed'
                    ? 'bg-[#A6D957] text-[#172131]'
                    : 'bg-[#12B9B0] text-[#FFFFFF]'
                    }`}
                >
                  <span className="h-2 w-2 rounded-full bg-current" />
                  {game.status === 'Completed' ? 'COMPLETED' : 'LIVE'}
                </span>
              </div>
              <p className="truncate text-[11px] text-[#AEB8C7]">
                {game.match_type} • {game.match_format} • {game.scoring_type} to{' '}
                {game.points_to_win} {game.win_by_two ? '(Win by 2)' : ''}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          {/* Match Timer */}
          <div className="rounded-lg border border-[#3C485B] bg-[#172131] px-3 py-1.5 text-center">
            <span className="block text-[9px] font-semibold text-[#AEB8C7] uppercase">
              Match Timer
            </span>
            <span className="font-mono text-[13px] font-bold tabular-nums text-[#D7F66B] sm:text-[14px]">
              {formatElapsedSeconds(elapsed)}
            </span>
          </div>

          {/* Real-time TV Sync Status Badge */}
          <div
            title={
              wsConnected
                ? `TV WebSocket active (${latencyMs || '<2'}ms roundtrip)`
                : 'Connecting to Live TV WebSocket...'
            }
            className="hidden items-center gap-1.5 rounded-lg border border-[#3C485B] bg-[#172131] px-2.5 py-1.5 text-[11px] font-semibold sm:inline-flex"
          >
            <span
              className={`h-2 w-2 rounded-full ${
                wsConnected ? 'bg-[#D7F66B] animate-pulse' : 'bg-[#E76B72]'
              }`}
            />
            <span className={wsConnected ? 'text-[#D7F66B]' : 'text-[#AEB8C7]'}>
              {wsConnected
                ? `Live TV Sync (WebSocket ${latencyMs ? latencyMs + 'ms' : '0ms'})`
                : 'Live TV Sync: Connecting...'}
            </span>
          </div>

          <Link
            to={`/scoreboard/${game.code}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#3C485B] bg-[#172131] px-2.5 py-2 text-[11.5px] font-semibold text-[#F1F3F5] hover:border-[#12B9B0] sm:px-3 sm:text-[12px]"
          >
            <ExternalLink className="h-3.5 w-3.5 text-[#12B9B0]" />
            <span>TV Scoreboard</span>
          </Link>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#3C485B] bg-[#172131] px-2.5 py-2 text-[11.5px] font-semibold text-[#F1F3F5] hover:bg-[#3C485B] sm:px-3 sm:text-[12px]"
          >
            {isFullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
            <span className="hidden min-[380px]:inline">Fullscreen</span>
          </button>

          {game.status !== 'Completed' && (
            <button
              type="button"
              onClick={() => setConfirmEndOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#E76B72] px-3 py-2 text-[11.5px] font-semibold text-[#FFFFFF] hover:brightness-95 sm:px-3.5 sm:text-[12px]"
            >
              <Square className="h-3.5 w-3.5" />
              End Game
            </button>
          )}
        </div>
      </header>

      {/* Match Target Reached / Completed Banner */}
      {game.status === 'Completed' ? (
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-[#A6D957] bg-[#A6D957]/20 px-4 py-2.5 sm:px-6 sm:py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Trophy className="h-5 w-5 shrink-0 text-[#D7F66B]" />
            <span className="text-[13px] font-bold text-[#FFFFFF] sm:text-[14px]">
              MATCH COMPLETED — Winner:{' '}
              {game.winner_team === 'A' ? game.team_a_name : game.team_b_name} (
              {game.score_a} - {game.score_b})
            </span>
          </div>
          <Button
            size="sm"
            variant="primary"
            onClick={() => navigate(exitPath)}
          >
            {isScorekeeper ? 'Back to Scorekeeper Console' : 'View Final Match Summary'}
          </Button>
        </div>
      ) : (
        matchPointReached && (
          <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-[#D7F66B] bg-[#D7F66B] px-4 py-2.5 text-[#172131] sm:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span className="text-[12px] font-bold sm:text-[13px]">
                Target Score Reached! {leadingTeamName} has reached winning
                score ({game.score_a} - {game.score_b}).
              </span>
            </div>
            <button
              type="button"
              onClick={() => setConfirmEndOpen(true)}
              className="rounded-lg bg-[#172131] px-3.5 py-1.5 text-[12px] font-bold text-[#D7F66B] hover:bg-[#253247]"
            >
              Confirm &amp; Finalize Match Winner
            </button>
          </div>
        )
      )}

      {/* MAIN SCOREKEEPER WORKSPACE */}
      <div className="mx-auto flex w-full min-w-0 max-w-[1400px] flex-1 flex-col gap-4 p-3 sm:gap-5 sm:p-6">
        {/* Official Callout Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#3C485B] bg-[#253247] px-3 py-2.5 sm:px-4">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span className="rounded bg-[#172131] px-2.5 py-1 text-[11px] font-bold text-[#D7F66B]">
              GAME {game.current_game_number}
            </span>
            {game.set_scores && game.set_scores.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="text-[#AEB8C7]">Previous Games:</span>
                {game.set_scores.map((s) => (
                  <span
                    key={s.game}
                    className="rounded border border-[#3C485B] bg-[#172131] px-2 py-0.5 font-semibold text-[#F1F3F5]"
                  >
                    G{s.game}: {s.score_a}-{s.score_b}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#AEB8C7]">
              Official Score Call:
            </span>
            <span className="rounded-md bg-[#12B9B0] px-3 py-1 font-mono text-[13px] font-bold text-[#FFFFFF]">
              {officialCallout}
            </span>
          </div>
        </div>

        {/* TWO-TEAM SCOREBOARD + TOUCH CONTROLS */}
        <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-2">
          {/* TEAM A PANEL */}
          <div
            className={`flex min-w-0 flex-col justify-between rounded-2xl border-2 p-4 transition-all sm:p-6 ${game.serving_team === 'A'
              ? 'border-[#12B9B0] bg-[#253247]'
              : 'border-[#3C485B] bg-[#253247]/80'
              }`}
          >
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded bg-[#172131] px-2.5 py-1 text-[11px] font-bold text-[#AEB8C7] uppercase">
                  Team A {game.match_format !== 'Single Game' && `• Sets Won: ${game.games_won_a}`}
                </span>
                {game.serving_team === 'A' ? (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-[#12B9B0] px-2.5 py-1 text-[11px] font-bold text-[#FFFFFF] sm:px-3 sm:text-[12px]">
                    <span className="h-2 w-2 rounded-full bg-[#D7F66B]" />
                    SERVING{' '}
                    {game.match_type === 'Doubles'
                      ? `• SERVER #${game.server_number}`
                      : ''}
                  </span>
                ) : (
                  <span className="text-[11px] font-medium text-[#AEB8C7]">
                    Receiving
                  </span>
                )}
              </div>

              <h2 className="mt-3 break-words text-[18px] font-bold text-[#FFFFFF] sm:text-[22px]">
                {game.team_a_name}
              </h2>
              {game.team_a_players &&
                game.team_a_players.length > 0 &&
                game.team_a_players.join(' / ') !== game.team_a_name && (
                  <p className="mt-0.5 break-words text-[12px] text-[#AEB8C7]">
                    {game.team_a_players.join('  •  ')}
                  </p>
                )}
            </div>

            {/* Large Neon Lime Score */}
            <div className="relative rally-landscape-compact my-4 flex items-center justify-center rounded-2xl border border-[#3C485B] bg-[#172131] py-5 sm:my-6 sm:py-7">
              {animPointA && (
                <div
                  key={animPointA.id}
                  className="animate-point-slide pointer-events-none absolute top-2 right-4 z-20 flex items-center gap-1 rounded-full bg-[#D7F66B] px-3 py-0.5 font-mono text-xs sm:text-sm font-extrabold text-[#172131] shadow-lg shadow-[#D7F66B]/40"
                >
                  +{animPointA.diff}
                </div>
              )}
              <span
                key={`score-a-${game.score_a}`}
                className={`rally-score-display text-[#D7F66B] ${
                  animPointA ? 'animate-score-punch' : ''
                }`}
              >
                {game.score_a}
              </span>
            </div>

            {/* Team A Touch Controls */}
            <div className="space-y-2.5">
              <button
                type="button"
                disabled={game.status === 'Completed'}
                onClick={() => handleAddPoint('A')}
                className="rally-touch-target flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#D7F66B] py-3.5 text-[14px] font-bold text-[#172131] transition-transform active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 sm:py-4 sm:text-[15px]"
              >
                <Plus className="h-5 w-5 stroke-[2.6]" />
                Add Point
              </button>

              <div
                className={`grid gap-2 ${game.match_type === 'Doubles'
                  ? 'grid-cols-1 min-[360px]:grid-cols-2'
                  : 'grid-cols-1'
                  }`}
              >
                <button
                  type="button"
                  disabled={game.status === 'Completed'}
                  onClick={() => handleChangeServer('A', 1, 'Serve Team A')}
                  className={`rally-touch-target rounded-lg border py-2 text-[12px] font-semibold ${game.serving_team === 'A' && game.server_number === 1
                    ? 'border-[#12B9B0] bg-[#12B9B0] text-[#FFFFFF]'
                    : 'border-[#3C485B] bg-[#172131] text-[#AEB8C7] hover:text-[#FFFFFF]'
                    }`}
                >
                  {game.match_type === 'Doubles'
                    ? 'Set Server #1'
                    : 'Set Serving'}
                </button>
                {game.match_type === 'Doubles' && (
                  <button
                    type="button"
                    disabled={game.status === 'Completed'}
                    onClick={() =>
                      handleChangeServer('A', 2, 'Serve Team A #2')
                    }
                    className={`rally-touch-target rounded-lg border py-2 text-[12px] font-semibold ${game.serving_team === 'A' && game.server_number === 2
                      ? 'border-[#12B9B0] bg-[#12B9B0] text-[#FFFFFF]'
                      : 'border-[#3C485B] bg-[#172131] text-[#AEB8C7] hover:text-[#FFFFFF]'
                      }`}
                  >
                    Set Server #2
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* TEAM B PANEL */}
          <div
            className={`flex min-w-0 flex-col justify-between rounded-2xl border-2 p-4 transition-all sm:p-6 ${game.serving_team === 'B'
              ? 'border-[#12B9B0] bg-[#253247]'
              : 'border-[#3C485B] bg-[#253247]/80'
              }`}
          >
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded bg-[#172131] px-2.5 py-1 text-[11px] font-bold text-[#AEB8C7] uppercase">
                  Team B {game.match_format !== 'Single Game' && `• Sets Won: ${game.games_won_b}`}
                </span>
                {game.serving_team === 'B' ? (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-[#12B9B0] px-2.5 py-1 text-[11px] font-bold text-[#FFFFFF] sm:px-3 sm:text-[12px]">
                    <span className="h-2 w-2 rounded-full bg-[#D7F66B]" />
                    SERVING{' '}
                    {game.match_type === 'Doubles'
                      ? `• SERVER #${game.server_number}`
                      : ''}
                  </span>
                ) : (
                  <span className="text-[11px] font-medium text-[#AEB8C7]">
                    Receiving
                  </span>
                )}
              </div>

              <h2 className="mt-3 break-words text-[18px] font-bold text-[#FFFFFF] sm:text-[22px]">
                {game.team_b_name}
              </h2>
              {game.team_b_players &&
                game.team_b_players.length > 0 &&
                game.team_b_players.join(' / ') !== game.team_b_name && (
                  <p className="mt-0.5 break-words text-[12px] text-[#AEB8C7]">
                    {game.team_b_players.join('  •  ')}
                  </p>
                )}
            </div>

            {/* Large Neon Lime Score */}
            <div className="relative rally-landscape-compact my-4 flex items-center justify-center rounded-2xl border border-[#3C485B] bg-[#172131] py-5 sm:my-6 sm:py-7">
              {animPointB && (
                <div
                  key={animPointB.id}
                  className="animate-point-slide pointer-events-none absolute top-2 right-4 z-20 flex items-center gap-1 rounded-full bg-[#D7F66B] px-3 py-0.5 font-mono text-xs sm:text-sm font-extrabold text-[#172131] shadow-lg shadow-[#D7F66B]/40"
                >
                  +{animPointB.diff}
                </div>
              )}
              <span
                key={`score-b-${game.score_b}`}
                className={`rally-score-display text-[#D7F66B] ${
                  animPointB ? 'animate-score-punch' : ''
                }`}
              >
                {game.score_b}
              </span>
            </div>

            {/* Team B Touch Controls */}
            <div className="space-y-2.5">
              <button
                type="button"
                disabled={game.status === 'Completed'}
                onClick={() => handleAddPoint('B')}
                className="rally-touch-target flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#D7F66B] py-3.5 text-[14px] font-bold text-[#172131] transition-transform active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 sm:py-4 sm:text-[15px]"
              >
                <Plus className="h-5 w-5 stroke-[2.6]" />
                Add Point
              </button>

              <div
                className={`grid gap-2 ${game.match_type === 'Doubles'
                  ? 'grid-cols-1 min-[360px]:grid-cols-2'
                  : 'grid-cols-1'
                  }`}
              >
                <button
                  type="button"
                  disabled={game.status === 'Completed'}
                  onClick={() => handleChangeServer('B', 1, 'Serve Team B')}
                  className={`rally-touch-target rounded-lg border py-2 text-[12px] font-semibold ${game.serving_team === 'B' && game.server_number === 1
                    ? 'border-[#12B9B0] bg-[#12B9B0] text-[#FFFFFF]'
                    : 'border-[#3C485B] bg-[#172131] text-[#AEB8C7] hover:text-[#FFFFFF]'
                    }`}
                >
                  {game.match_type === 'Doubles'
                    ? 'Set Server #1'
                    : 'Set Serving'}
                </button>
                {game.match_type === 'Doubles' && (
                  <button
                    type="button"
                    disabled={game.status === 'Completed'}
                    onClick={() =>
                      handleChangeServer('B', 2, 'Serve Team B #2')
                    }
                    className={`rally-touch-target rounded-lg border py-2 text-[12px] font-semibold ${game.serving_team === 'B' && game.server_number === 2
                      ? 'border-[#12B9B0] bg-[#12B9B0] text-[#FFFFFF]'
                      : 'border-[#3C485B] bg-[#172131] text-[#AEB8C7] hover:text-[#FFFFFF]'
                      }`}
                  >
                    Set Server #2
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* CENTRAL ACTION BAR: SIDE-OUT, UNDO LAST POINT, SCORING HISTORY */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-3">
          <button
            type="button"
            disabled={game.status === 'Completed'}
            onClick={handleSideOut}
            className="rally-touch-target flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#12B9B0] bg-[#12B9B0]/20 px-3 py-3 text-[12px] font-semibold text-[#FFFFFF] hover:bg-[#12B9B0] disabled:cursor-not-allowed disabled:opacity-40 sm:py-3.5 sm:text-[13px]"
          >
            <RefreshCw className="h-4 w-4 shrink-0" />
            <span>
              {game.match_type === 'Doubles' && game.server_number === 1
                ? 'Rotate to 2nd Server'
                : 'Side-Out (Change Serving Team)'}
            </span>
          </button>

          <button
            type="button"
            disabled={reversibleEventsCount === 0 || game.status === 'Completed'}
            onClick={handleUndo}
            className="rally-touch-target flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#3C485B] bg-[#253247] px-3 py-3 text-[12px] font-semibold text-[#F1F3F5] hover:border-[#D7F66B] hover:text-[#D7F66B] disabled:cursor-not-allowed disabled:opacity-40 sm:py-3.5 sm:text-[13px]"
          >
            <RotateCcw className="h-4 w-4 shrink-0" />
            <span>Undo Last Point ({reversibleEventsCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setShowHistory((prev) => !prev)}
            className="rally-touch-target flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#3C485B] bg-[#253247] px-3 py-3 text-[12px] font-semibold text-[#F1F3F5] hover:bg-[#3C485B] sm:py-3.5 sm:text-[13px]"
          >
            <History className="h-4 w-4 shrink-0 text-[#D7F66B]" />
            <span>
              {showHistory ? 'Hide' : 'Show'} Audit History (
              {(game.score_events || []).length})
            </span>
          </button>
        </div>

        {/* SCORING AUDIT HISTORY LOG */}
        {showHistory && (
          <div className="rounded-xl border border-[#3C485B] bg-[#253247] p-3.5 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-1 border-b border-[#3C485B] pb-2">
              <span className="text-[12px] font-semibold text-[#FFFFFF]">
                Live Match Event Log (Synchronized with /scoreboard/{game.code})
              </span>
              <span className="text-[11px] text-[#AEB8C7]">
                Most recent first
              </span>
            </div>
            <div className="mt-2.5 max-h-44 space-y-1.5 overflow-y-auto pr-1">
              {(!game.score_events || game.score_events.length === 0) ? (
                <p className="py-3 text-center text-[11px] text-[#AEB8C7]">
                  No points recorded yet. Tap &ldquo;Add Point&rdquo; above to begin scoring.
                </p>
              ) : (
                [...game.score_events].reverse().map((ev) => (
                  <div
                    key={ev.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#3C485B]/70 bg-[#172131] px-3 py-1.5 text-[11px]"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="shrink-0 rounded bg-[#253247] px-1.5 py-0.5 font-mono text-[10px] text-[#AEB8C7]">
                        #{ev.id}
                      </span>
                      <span className="break-words font-medium text-[#F1F3F5]">
                        {ev.description}
                      </span>
                    </div>
                    <span className="shrink-0 font-mono font-bold text-[#D7F66B]">
                      {ev.score_a} - {ev.score_b}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmEndOpen}
        onClose={() => setConfirmEndOpen(false)}
        onConfirm={handleEndMatchConfirm}
        title="Finalize & End Match"
        message={`Save final score (${game.score_a} - ${game.score_b}), crown ${leadingTeamName} as the winner, release ${game.court_name}, and update any connected tournament brackets?`}
        confirmText="Finalize Match Result"
        variant="primary"
      />
    </div>
  )
}

