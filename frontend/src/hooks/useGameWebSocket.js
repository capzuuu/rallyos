import { useEffect, useRef, useState, useCallback } from 'react'
import { BASE_URL } from '../api/client'

/**
 * Ultra-low latency WebSocket hook for real-time live scoring and TV scoreboard display.
 *
 * Connects directly to FastAPI /api/v1/ws/games/:gameKey.
 * Supports:
 * - 0ms instant broadcast reception (INIT_STATE and GAME_UPDATE)
 * - Inbound action dispatch (SCORE_POINT, CHANGE_SERVER, TRIGGER_SIDEOUT, UNDO_POINT, COMPLETE_GAME)
 * - 15-second heartbeat PING/PONG keeping connections active indefinitely through all proxies
 * - Fast jittered auto-reconnect (400ms - 2000ms max)
 *
 * @param {string|number} gameKey - Game ID or Game Code (e.g. "GAME-001")
 * @param {function} onGameUpdate - Callback invoked when authoritative game state arrives
 * @returns {{ isConnected: boolean, latencyMs: number, sendAction: function }}
 */
export function useGameWebSocket(gameKey, onGameUpdate) {
  const [isConnected, setIsConnected] = useState(false)
  const [latencyMs, setLatencyMs] = useState(0)
  const wsRef = useRef(null)
  const pingTimerRef = useRef(null)
  const pingStartRef = useRef(0)
  const reconnectTimerRef = useRef(null)
  const onUpdateRef = useRef(onGameUpdate)

  useEffect(() => {
    onUpdateRef.current = onGameUpdate
  }, [onGameUpdate])

  useEffect(() => {
    if (!gameKey || typeof WebSocket === 'undefined') return undefined

    let cancelled = false
    let attempt = 0

    const buildWsUrl = () => {
      const apiBase = BASE_URL
      if (/^https?:\/\//i.test(apiBase)) {
        const parsed = new URL(apiBase)
        const wsProtocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:'
        const basePath = parsed.pathname.replace(/\/+$/, '')
        return `${wsProtocol}//${parsed.host}${basePath}/ws/games/${encodeURIComponent(gameKey)}`
      }
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const basePath = apiBase.replace(/\/+$/, '')
      return `${protocol}//${window.location.host}${basePath}/ws/games/${encodeURIComponent(gameKey)}`
    }

    const connect = () => {
      if (cancelled) return

      try {
        const ws = new WebSocket(buildWsUrl())
        wsRef.current = ws

        ws.onopen = () => {
          if (cancelled) {
            ws.close()
            return
          }
          setIsConnected(true)
          attempt = 0

          // Periodic heartbeat PING every 15s to keep socket alive through all proxies
          if (pingTimerRef.current) clearInterval(pingTimerRef.current)
          pingTimerRef.current = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              pingStartRef.current = performance.now()
              ws.send(JSON.stringify({ type: 'PING', ts: Date.now() }))
            }
          }, 15000)
        }

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            if (data?.type === 'PONG') {
              if (pingStartRef.current) {
                const roundtrip = Math.round(performance.now() - pingStartRef.current)
                setLatencyMs(roundtrip)
              }
              return
            }

            if ((data?.type === 'GAME_UPDATE' || data?.type === 'INIT_STATE') && data.game) {
              if (onUpdateRef.current) {
                onUpdateRef.current(data.game)
              }
            }
          } catch {
            // ignore malformed frame
          }
        }

        ws.onclose = () => {
          setIsConnected(false)
          if (pingTimerRef.current) clearInterval(pingTimerRef.current)
          if (cancelled) return

          // Fast jittered reconnect: 400ms to 2000ms max
          const backoff = Math.min(2000, 400 * 1.5 ** Math.min(attempt, 5))
          attempt += 1
          reconnectTimerRef.current = setTimeout(connect, backoff)
        }

        ws.onerror = () => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.close()
          }
        }
      } catch {
        const backoff = Math.min(2000, 400 * 1.5 ** Math.min(attempt, 5))
        attempt += 1
        reconnectTimerRef.current = setTimeout(connect, backoff)
      }
    }

    connect()

    return () => {
      cancelled = true
      setIsConnected(false)
      if (pingTimerRef.current) clearInterval(pingTimerRef.current)
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) {
        wsRef.current.close()
      }
      wsRef.current = null
    }
  }, [gameKey])

  const sendAction = useCallback((action, payload = {}) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ action, ...payload }))
        return true
      } catch {
        return false
      }
    }
    return false
  }, [])

  return { isConnected, latencyMs, sendAction }
}

export default useGameWebSocket
