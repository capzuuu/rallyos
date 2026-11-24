import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Maximize2, Minimize2, Radio, Trophy } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import Logo from '../components/ui/Logo'
import apiClient from '../api/client'
import { useGameWebSocket } from '../hooks/useGameWebSocket'
import { useRally } from '../hooks/useRally'
import { formatElapsedSeconds } from '../utils/formatters'

export function PublicScoreboardPage() {
  const { gameId } = useParams()
  const { games, isAuthenticated, isScorekeeper } = useRally()
  const boardRef = useRef(null)

  const [isFullscreen, setIsFullscreen] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [fetchedEntry, setFetchedEntry] = useState(null)
  const [wsGameOverride, setWsGameOverride] = useState(null)

  // Real-time animated "+1" point slide indicators
  const [animPointA, setAnimPointA] = useState(null)
  const [animPointB, setAnimPointB] = useState(null)
  const prevScoresRef = useRef({ a: null, b: null, code: null })

  const contextGame = useMemo(
    () =>
      games.find(
        (g) => String(g.id) === String(gameId) || g.code === gameId
      ),
    [games, gameId]
  )

  const fetchedGame =
    fetchedEntry?.gameId === gameId ? fetchedEntry.data : null

  const game = wsGameOverride || contextGame || fetchedGame

  // Fetch initial match state directly so TV/LAN devices without a signed-in session still load
  useEffect(() => {
    if (!gameId || contextGame) return undefined
    let active = true
    apiClient
      .get(`/games/${encodeURIComponent(gameId)}`)
      .then((res) => {
        if (active && res?.data) {
          setFetchedEntry({ gameId, data: res.data })
        }
      })
      .catch(() => {
        // Ignore if game does not exist or endpoint is forbidden for current session
      })
    return () => {
      active = false
    }
  }, [gameId, contextGame])

  // Instant Real-Time WebSocket subscription with zero-latency updates and 15s heartbeat
  const handleWsGameUpdate = useCallback((authoritativeGame) => {
    if (authoritativeGame) {
      setWsGameOverride(authoritativeGame)
    }
  }, [])

  const { isConnected: wsConnected, latencyMs } = useGameWebSocket(
    gameId,
    handleWsGameUpdate
  )

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

  useEffect(() => {
    if (!game || game.status === 'Completed' || game.status === 'Cancelled') {
      return undefined
    }
    const baseMs = game.started_at
      ? new Date(game.started_at).getTime()
      : Date.now()
    const tick = () => {
      setElapsed(Math.max(0, Math.floor((Date.now() - baseMs) / 1000)))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [game])

  function handleFullscreen() {
    if (!document.fullscreenElement) {
      boardRef.current?.requestFullscreen?.().catch(() => {})
      setIsFullscreen(true)
    } else {
      document.exitFullscreen?.().catch(() => {})
      setIsFullscreen(false)
    }
  }

  if (!game) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-[#172131] p-4 text-center text-[#F1F3F5] sm:p-8">
        <p className="text-[17px] font-bold text-[#FFFFFF] sm:text-[20px]">
          RallyOS Live Scoreboard — Match &ldquo;{gameId}&rdquo; Not Found
        </p>
      </div>
    )
  }

  const serverScore =
    game.serving_team === 'A' ? game.score_a : game.score_b
  const receiverScore =
    game.serving_team === 'A' ? game.score_b : game.score_a
  const callout =
    game.match_type === 'Doubles'
      ? `${serverScore} - ${receiverScore} - ${game.server_number}`
      : `${serverScore} - ${receiverScore}`

  return (
    <div
      ref={boardRef}
      className="flex min-h-dvh flex-col justify-between bg-[#172131] p-3.5 text-[#F1F3F5] select-none sm:p-6 md:p-8 lg:p-10 2xl:p-12"
    >
      {/* Top Broadcast Bar */}
      <header className="flex flex-col gap-3 border-b border-[#3C485B] pb-4 sm:pb-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-start gap-3 sm:items-center sm:gap-4">
          <Logo
            variant="full"
            theme="dark"
            className="h-8 w-auto shrink-0 sm:h-9"
            alt="RallyOS"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
              <span className="rounded-md bg-[#253247] px-2 py-0.5 text-[11px] font-semibold text-[#D7F66B] sm:px-2.5 sm:text-[13px]">
                {game.court_name}
              </span>
              <span className="rounded-md border border-[#3C485B] px-2 py-0.5 text-[11px] font-medium text-[#AEB8C7] sm:px-2.5 sm:text-[12px]">
                {game.code}
              </span>
            </div>
            <p className="mt-0.5 break-words text-[11px] text-[#AEB8C7] sm:text-[12px]">
              {game.tournament_name
                ? `${game.tournament_name}  •  `
                : ''}
              {game.match_type} • {game.match_format} • {game.scoring_type} to{' '}
              {game.points_to_win} {game.win_by_two ? '(Win by 2)' : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 md:gap-4">
          <div className="rounded-xl border border-[#3C485B] bg-[#253247] px-3 py-1.5 text-center sm:px-4 sm:py-2">
            <span className="block text-[9px] font-semibold text-[#AEB8C7] uppercase sm:text-[10px]">
              Game Number
            </span>
            <span className="text-[13px] font-bold text-[#FFFFFF] sm:text-[16px]">
              Game {game.current_game_number}
            </span>
          </div>

          <div className="rounded-xl border border-[#3C485B] bg-[#253247] px-3 py-1.5 text-center sm:px-4 sm:py-2">
            <span className="block text-[9px] font-semibold text-[#AEB8C7] uppercase sm:text-[10px]">
              Callout
            </span>
            <span className="font-mono text-[13px] font-bold text-[#12B9B0] sm:text-[16px]">
              {callout}
            </span>
          </div>

          {/* Real-time WebSocket Status Pill */}
          <div
            title={
              wsConnected
                ? `TV WebSocket active (${latencyMs || '<2'}ms roundtrip)`
                : 'Connecting to real-time broadcast socket...'
            }
            className="hidden items-center gap-1.5 rounded-xl border border-[#3C485B] bg-[#253247] px-3 py-2 text-[11px] font-semibold sm:inline-flex"
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                wsConnected ? 'bg-[#D7F66B] animate-pulse' : 'bg-[#E76B72]'
              }`}
            />
            <span className={wsConnected ? 'text-[#D7F66B]' : 'text-[#AEB8C7]'}>
              {wsConnected
                ? `TV Sync: Live (${latencyMs ? latencyMs + 'ms' : '<2ms'})`
                : 'TV Sync: Connecting...'}
            </span>
          </div>

          {game.status === 'Completed' ? (
            <div className="inline-flex items-center gap-1.5 rounded-xl bg-[#D7F66B] px-3 py-2 text-[12px] font-bold text-[#172131] sm:gap-2 sm:px-4 sm:py-2.5 sm:text-[14px]">
              <Trophy className="h-4 w-4 shrink-0" />
              FINAL
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 rounded-xl bg-[#12B9B0] px-3 py-2 text-[12px] font-bold text-[#FFFFFF] sm:gap-2 sm:px-4 sm:py-2.5 sm:text-[14px]">
              <Radio className="h-4 w-4 shrink-0 animate-pulse" />
              <span>LIVE • {formatElapsedSeconds(elapsed)}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleFullscreen}
            className="rounded-xl border border-[#3C485B] bg-[#253247] p-2 text-[#AEB8C7] hover:text-[#FFFFFF] sm:p-2.5"
            aria-label="Toggle Fullscreen"
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4 sm:h-5 sm:w-5" />
            ) : (
              <Maximize2 className="h-4 w-4 sm:h-5 sm:w-5" />
            )}
          </button>

          {isAuthenticated && (
            <Link
              to={isScorekeeper ? '/scoreboard' : `/games/${game.code}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#3C485B] bg-[#253247] px-3 py-2 text-[12px] font-semibold text-[#F1F3F5] hover:border-[#D7F66B]"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" />
              <span>Exit TV</span>
            </Link>
          )}
        </div>
      </header>

      {/* Main Arena Scoreboard Cards */}
      <main className="my-auto grid grid-cols-1 gap-4 py-4 sm:gap-6 sm:py-6 lg:grid-cols-2">
        {/* TEAM A */}
        <div
          className={`flex min-w-0 flex-col justify-between rounded-2xl border-2 p-5 sm:rounded-3xl sm:p-8 lg:p-10 ${
            game.winner_team === 'A'
              ? 'border-[#D7F66B] bg-[#253247]'
              : game.serving_team === 'A' && game.status !== 'Completed'
                ? 'border-[#12B9B0] bg-[#253247]'
                : 'border-[#3C485B] bg-[#253247]/65'
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3 sm:gap-4">
            <div className="min-w-0 flex-1">
              <span className="text-[11px] font-semibold tracking-wider text-[#AEB8C7] uppercase sm:text-[12px]">
                TEAM A
              </span>
              <h1 className="mt-1 break-words text-2xl font-bold text-[#FFFFFF] sm:text-3xl lg:text-4xl 2xl:text-5xl">
                {game.team_a_name}
              </h1>
              {game.team_a_players &&
                game.team_a_players.length > 0 &&
                game.team_a_players.join(' / ') !== game.team_a_name && (
                  <p className="mt-1.5 break-words text-[12px] font-medium text-[#AEB8C7] sm:text-[14px]">
                    {game.team_a_players.join('   •   ')}
                  </p>
                )}
            </div>

            {game.winner_team === 'A' ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#D7F66B] px-3 py-1.5 text-[12px] font-bold text-[#172131] sm:px-4 sm:py-2 sm:text-[14px]">
                <Trophy className="h-4 w-4" />
                WINNER
              </span>
            ) : (
              game.serving_team === 'A' &&
              game.status !== 'Completed' && (
                <span className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#12B9B0] px-3 py-1.5 text-[12px] font-bold text-[#FFFFFF] sm:px-4 sm:py-2 sm:text-[14px]">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#D7F66B]" />
                  SERVING{' '}
                  {game.match_type === 'Doubles'
                    ? `#${game.server_number}`
                    : ''}
                </span>
              )
            )}
          </div>

          <div className="mt-5 flex items-baseline justify-between gap-3 border-t border-[#3C485B] pt-4 sm:mt-8 sm:pt-6">
            <div>
              {game.match_format !== 'Single Game' && (
                <div>
                  <span className="block text-[10px] text-[#AEB8C7] uppercase sm:text-[11px]">
                    Games Won
                  </span>
                  <span className="text-2xl font-bold text-[#FFFFFF] sm:text-3xl">
                    {game.games_won_a}
                  </span>
                </div>
              )}
            </div>
            <div className="relative flex items-center justify-end">
              {animPointA && (
                <div
                  key={animPointA.id}
                  className="animate-point-slide pointer-events-none absolute -top-8 sm:-top-12 right-2 z-20 flex items-center gap-1 rounded-full bg-[#D7F66B] px-3.5 py-1 font-mono text-sm sm:text-base font-extrabold text-[#172131] shadow-xl shadow-[#D7F66B]/40"
                >
                  +{animPointA.diff}
                </div>
              )}
              <span
                key={`score-a-${game.score_a}`}
                className={`text-[64px] font-bold leading-none tracking-tight tabular-nums text-[#D7F66B] sm:text-[96px] lg:text-[120px] 2xl:text-[148px] ${
                  animPointA ? 'animate-score-punch' : ''
                }`}
              >
                {game.score_a}
              </span>
            </div>
          </div>
        </div>

        {/* TEAM B */}
        <div
          className={`flex min-w-0 flex-col justify-between rounded-2xl border-2 p-5 sm:rounded-3xl sm:p-8 lg:p-10 ${
            game.winner_team === 'B'
              ? 'border-[#D7F66B] bg-[#253247]'
              : game.serving_team === 'B' && game.status !== 'Completed'
                ? 'border-[#12B9B0] bg-[#253247]'
                : 'border-[#3C485B] bg-[#253247]/65'
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3 sm:gap-4">
            <div className="min-w-0 flex-1">
              <span className="text-[11px] font-semibold tracking-wider text-[#AEB8C7] uppercase sm:text-[12px]">
                TEAM B
              </span>
              <h1 className="mt-1 break-words text-2xl font-bold text-[#FFFFFF] sm:text-3xl lg:text-4xl 2xl:text-5xl">
                {game.team_b_name}
              </h1>
              {game.team_b_players &&
                game.team_b_players.length > 0 &&
                game.team_b_players.join(' / ') !== game.team_b_name && (
                  <p className="mt-1.5 break-words text-[12px] font-medium text-[#AEB8C7] sm:text-[14px]">
                    {game.team_b_players.join('   •   ')}
                  </p>
                )}
            </div>

            {game.winner_team === 'B' ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#D7F66B] px-3 py-1.5 text-[12px] font-bold text-[#172131] sm:px-4 sm:py-2 sm:text-[14px]">
                <Trophy className="h-4 w-4" />
                WINNER
              </span>
            ) : (
              game.serving_team === 'B' &&
              game.status !== 'Completed' && (
                <span className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#12B9B0] px-3 py-1.5 text-[12px] font-bold text-[#FFFFFF] sm:px-4 sm:py-2 sm:text-[14px]">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#D7F66B]" />
                  SERVING{' '}
                  {game.match_type === 'Doubles'
                    ? `#${game.server_number}`
                    : ''}
                </span>
              )
            )}
          </div>

          <div className="mt-5 flex items-baseline justify-between gap-3 border-t border-[#3C485B] pt-4 sm:mt-8 sm:pt-6">
            <div>
              {game.match_format !== 'Single Game' && (
                <div>
                  <span className="block text-[10px] text-[#AEB8C7] uppercase sm:text-[11px]">
                    Games Won
                  </span>
                  <span className="text-2xl font-bold text-[#FFFFFF] sm:text-3xl">
                    {game.games_won_b}
                  </span>
                </div>
              )}
            </div>
            <div className="relative flex items-center justify-end">
              {animPointB && (
                <div
                  key={animPointB.id}
                  className="animate-point-slide pointer-events-none absolute -top-8 sm:-top-12 right-2 z-20 flex items-center gap-1 rounded-full bg-[#D7F66B] px-3.5 py-1 font-mono text-sm sm:text-base font-extrabold text-[#172131] shadow-xl shadow-[#D7F66B]/40"
                >
                  +{animPointB.diff}
                </div>
              )}
              <span
                key={`score-b-${game.score_b}`}
                className={`text-[64px] font-bold leading-none tracking-tight tabular-nums text-[#D7F66B] sm:text-[96px] lg:text-[120px] 2xl:text-[148px] ${
                  animPointB ? 'animate-score-punch' : ''
                }`}
              >
                {game.score_b}
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* Bottom Set Scores & Tagline Footer */}
      <footer className="flex flex-wrap items-center justify-between gap-2.5 border-t border-[#3C485B] pt-3 text-[11px] text-[#AEB8C7] sm:gap-4 sm:pt-4 sm:text-[12px]">
        <div className="flex flex-wrap items-center gap-2">
          <span>Set History:</span>
          {game.set_scores && game.set_scores.length > 0 ? (
            game.set_scores.map((s) => (
              <span
                key={s.game}
                className="rounded-md bg-[#253247] px-2.5 py-1 font-semibold text-[#F1F3F5]"
              >
                Game {s.game}: {s.score_a} - {s.score_b}
              </span>
            ))
          ) : (
            <span className="text-[#F1F3F5]">
              Game {game.current_game_number} in progress
            </span>
          )}
        </div>
        <span className="font-semibold text-[#D7F66B]">
          RallyOS — Every Game. Every Court. Every Point.
        </span>
      </footer>
    </div>
  )
}

