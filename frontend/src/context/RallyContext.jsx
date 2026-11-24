import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import apiClient, {
  clearStoredTokens,
  getStoredTokens,
  registerAuthFailureHandler,
  setStoredTokens,
} from '../api/client'
import { supabase } from '../api/supabase'
import {
  computeEndTime,
  extractErrorMessage,
  formatRoleLabel,
  getRolePermissionsText,
  normalizeRoleKey,
  rangesOverlap,
} from '../utils/formatters'
import { RallyContext } from './contexts'

const AUTH_SESSION_KEY = 'rallyos_auth_session_v2'
const CHANNEL_NAME = 'rallyos_realtime_sync_v2'

// Purge legacy static seed state from localStorage
try {
  localStorage.removeItem('rallyos_pickleball_state_v2')
  localStorage.removeItem('rallyos_pickleball_state_v1')
} catch {
  // ignore
}

const DEFAULT_ADMIN_SUMMARY = {
  total_admins: 0,
  active_admins: 0,
  suspended_admins: 0,
  total_scorekeepers: 0,
  total_courts: 0,
  total_games: 0,
  total_live_games: 0,
}

const DEFAULT_EMPTY_SETTINGS = {
  business: {
    club_name: 'RallyOS Pickleball Club & Arena',
    logo_text: 'RALLYOS',
    contact_email: 'ops@rallyos.club',
    contact_phone: '(512) 555-0194',
    location: '420 Courtline Pkwy, Austin, TX 78701',
  },
  game_defaults: {
    scoring_type: 'Side-Out',
    points_to_win: 11,
    win_by_two: true,
    duration_minutes: 45,
    match_format: 'Single Game',
  },
  tournament_defaults: {
    available_formats: [
      'Single Elimination',
      'Double Elimination',
      'Round Robin',
    ],
    default_registration_days: 14,
    default_max_participants: 8,
    default_match_format: 'Best of 3',
    default_points_to_win: 11,
    default_win_by_two: true,
    auto_advance_winners: true,
  },
  court_defaults: {
    naming_prefix: 'Court',
    default_surface: 'Indoor',
    operating_hours_start: '07:00',
    operating_hours_end: '22:00',
    default_availability: 'Available',
  },
}

function normalizeUserRecord(u) {
  if (!u) return null
  const email = String(u.email || '').trim().toLowerCase()
  const rawUsername = String(
    u.username || (email ? email.split('@')[0] : '') || ''
  )
    .trim()
    .toLowerCase()
  const roleLabel = formatRoleLabel(u.role)
  const roleKey = normalizeRoleKey(u.role)
  return {
    ...u,
    username: rawUsername,
    email: email || (rawUsername ? `${rawUsername}@rallyos.club` : ''),
    role: roleLabel,
    role_key: roleKey,
    permissions: u.permissions || getRolePermissionsText(roleKey),
    is_active: u.is_active !== false,
  }
}

function loadPersistedAuthUser() {
  try {
    const raw = localStorage.getItem(AUTH_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && (parsed.username || parsed.email) && parsed.role) {
      return normalizeUserRecord(parsed)
    }
  } catch {
    // ignore
  }
  return null
}

export function RallyProvider({ children }) {
  const [state, setState] = useState({
    courts: [],
    games: [],
    tournaments: [],
    users: [],
    adminAccounts: [],
    adminSummary: DEFAULT_ADMIN_SUMMARY,
    settings: DEFAULT_EMPTY_SETTINGS,
    notifications: [],
  })
  const [currentUser, setCurrentUser] = useState(loadPersistedAuthUser)
  const channelRef = useRef(null)

  const persistCurrentUser = useCallback((userObj) => {
    if (!userObj) {
      setCurrentUser(null)
      try {
        localStorage.removeItem(AUTH_SESSION_KEY)
      } catch {
        // ignore
      }
      return
    }
    const normalized = normalizeUserRecord(userObj)
    setCurrentUser(normalized)
    try {
      localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(normalized))
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    registerAuthFailureHandler(() => {
      clearStoredTokens()
      persistCurrentUser(null)
    })
  }, [persistCurrentUser])

  const broadcastState = useCallback((updater) => {
    setState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      if (channelRef.current) {
        try {
          channelRef.current.postMessage({
            type: 'STATE_SYNC',
            payload: next,
            ts: Date.now(),
          })
        } catch {
          // ignore
        }
      }
      return next
    })
  }, [])

  // Fetch authoritative data from the backend database
  const refreshDatabaseState = useCallback(
    async (userOverride = null) => {
      const activeUser = userOverride || currentUser
      if (!activeUser) {
        broadcastState({
          courts: [],
          games: [],
          tournaments: [],
          users: [],
          adminAccounts: [],
          adminSummary: DEFAULT_ADMIN_SUMMARY,
          settings: DEFAULT_EMPTY_SETTINGS,
          notifications: [],
        })
        return
      }
      try {
        const activeRoleKey = normalizeRoleKey(activeUser.role)
        if (activeRoleKey === 'super_admin') {
          const saRes = await apiClient.get('/super-admin/admins')
          const items = Array.isArray(saRes?.data?.items)
            ? saRes.data.items.map(normalizeUserRecord)
            : []
          const summary = saRes?.data?.summary || DEFAULT_ADMIN_SUMMARY
          broadcastState((prev) => ({
            ...prev,
            courts: [],
            games: [],
            tournaments: [],
            users: [],
            adminAccounts: items,
            adminSummary: summary,
            settings: DEFAULT_EMPTY_SETTINGS,
          }))
          return
        }

        const requests = [
          apiClient.get('/courts'),
          apiClient.get('/games'),
          apiClient.get('/tournaments'),
          apiClient.get('/settings'),
        ]
        const isAdminRole = activeRoleKey === 'admin'
        if (isAdminRole) {
          requests.push(apiClient.get('/users', { params: { page_size: 100 } }))
        }

        const [courtsRes, gamesRes, trnRes, settingsRes, usersRes] =
          await Promise.all(requests)

        broadcastState((prev) => ({
          ...prev,
          courts: Array.isArray(courtsRes?.data) ? courtsRes.data : [],
          games: Array.isArray(gamesRes?.data) ? gamesRes.data : [],
          tournaments: Array.isArray(trnRes?.data) ? trnRes.data : [],
          settings: settingsRes?.data || DEFAULT_EMPTY_SETTINGS,
          users:
            isAdminRole && Array.isArray(usersRes?.data?.items)
              ? usersRes.data.items.map(normalizeUserRecord)
              : [],
          adminAccounts: [],
          adminSummary: DEFAULT_ADMIN_SUMMARY,
        }))
      } catch {
        // Backend unreachable or request failed
      }
    },
    [currentUser, broadcastState]
  )

  // Cross-tab BroadcastChannel for real-time /scoreboard/:gameId
  useEffect(() => {
    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel(CHANNEL_NAME)
      ch.onmessage = (event) => {
        if (event.data?.type === 'STATE_SYNC' && event.data?.payload) {
          setState((prev) => ({
            ...event.data.payload,
            notifications: prev.notifications,
          }))
        }
      }
      channelRef.current = ch
    }

    return () => {
      if (channelRef.current) {
        channelRef.current.close()
        channelRef.current = null
      }
    }
  }, [])

  // Validate stored session & hydrate from database on mount
  useEffect(() => {
    let active = true
    async function initFromDatabase() {
      const { accessToken, refreshToken } = getStoredTokens()
      let verifiedUser = currentUser
      if (accessToken || refreshToken) {
        try {
          const meRes = await apiClient.get('/auth/me')
          if (active && meRes?.data) {
            verifiedUser = normalizeUserRecord(meRes.data)
            persistCurrentUser(verifiedUser)
          }
        } catch {
          if (active) {
            clearStoredTokens()
            persistCurrentUser(null)
            verifiedUser = null
          }
        }
      } else if (verifiedUser) {
        persistCurrentUser(null)
        verifiedUser = null
      }
      if (active) {
        await refreshDatabaseState(verifiedUser)
      }
    }
    initFromDatabase()
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Enrich courts with live current_game & next_scheduled_match in O(G + C)
  const courtsWithSchedule = useMemo(() => {
    const liveByCourt = new Map()
    const upcomingByCourt = new Map()

    for (const g of state.games) {
      if (!g.court_id) continue
      const cId = Number(g.court_id)
      if (g.status === 'Live') {
        if (!liveByCourt.has(cId)) {
          liveByCourt.set(cId, g)
        }
      } else if (g.status === 'Upcoming') {
        const currentNext = upcomingByCourt.get(cId)
        if (!currentNext) {
          upcomingByCourt.set(cId, g)
        } else {
          const gKey = `${g.scheduled_date} ${g.start_time}`
          const curKey = `${currentNext.scheduled_date} ${currentNext.start_time}`
          if (gKey.localeCompare(curKey) < 0) {
            upcomingByCourt.set(cId, g)
          }
        }
      }
    }

    return state.courts.map((court) => {
      const cId = Number(court.id)
      return {
        ...court,
        current_game: liveByCourt.get(cId) || null,
        next_scheduled_match: upcomingByCourt.get(cId) || null,
      }
    })
  }, [state.courts, state.games])

  // Check court conflicts for a given date, start_time, and duration
  const getCourtsAvailability = useCallback(
    (scheduledDate, startTime, durationMinutes = 45, excludeGameId = null) => {
      const endTime = computeEndTime(startTime, durationMinutes)
      return state.courts.map((court) => {
        if (!court.is_enabled || court.status === 'Disabled') {
          return {
            ...court,
            available: false,
            conflictReason: 'Court Disabled',
          }
        }
        if (court.status === 'Maintenance') {
          const sameDate =
            !court.maintenance_date || court.maintenance_date === scheduledDate
          const mStart = court.maintenance_start || '00:00'
          const mEnd = court.maintenance_end || '23:59'
          if (sameDate && rangesOverlap(startTime, endTime, mStart, mEnd)) {
            return {
              ...court,
              available: false,
              conflictReason: `Maintenance (${mStart}–${mEnd})`,
            }
          }
        }
        const conflictingGame = state.games.find((g) => {
          if (excludeGameId && String(g.id) === String(excludeGameId)) return false
          if (excludeGameId && String(g.code) === String(excludeGameId)) return false
          if (Number(g.court_id) !== Number(court.id)) return false
          if (g.scheduled_date !== scheduledDate) return false
          if (g.status !== 'Upcoming' && g.status !== 'Live') return false
          return rangesOverlap(startTime, endTime, g.start_time, g.end_time)
        })

        if (conflictingGame) {
          return {
            ...court,
            available: false,
            conflictReason: `Conflict: ${conflictingGame.code} (${conflictingGame.start_time}–${conflictingGame.end_time})`,
          }
        }

        return {
          ...court,
          available: true,
          conflictReason: 'Available',
        }
      })
    },
    [state.courts, state.games]
  )

  const pushNotification = useCallback((title, message) => {
    setState((prev) => ({
      ...prev,
      notifications: [
        {
          id: `n-${Date.now()}`,
          title,
          message,
          time: 'Just now',
          read: false,
        },
        ...(prev.notifications || []).slice(0, 14),
      ],
    }))
  }, [])

  const markAllNotificationsRead = useCallback(() => {
    setState((prev) => ({
      ...prev,
      notifications: (prev.notifications || []).map((n) => ({
        ...n,
        read: true,
      })),
    }))
  }, [])

  // GAMES ACTIONS (Database-backed)
  const createGame = useCallback(
    async (payload) => {
      try {
        const res = await apiClient.post('/games', payload)
        const savedGame = res.data
        broadcastState((prev) => ({
          ...prev,
          games: [
            savedGame,
            ...prev.games.filter((g) => g.id !== savedGame.id),
          ],
        }))
        return savedGame
      } catch (err) {
        throw new Error(extractErrorMessage(err))
      }
    },
    [broadcastState]
  )

  const updateGame = useCallback(
    async (gameKey, updates) => {
      try {
        const res = await apiClient.patch(`/games/${gameKey}`, updates)
        const savedGame = res.data
        broadcastState((prev) => ({
          ...prev,
          games: prev.games.map((g) =>
            String(g.id) === String(gameKey) ||
              g.code === gameKey ||
              g.id === savedGame.id
              ? savedGame
              : g
          ),
        }))
        return savedGame
      } catch (err) {
        throw new Error(extractErrorMessage(err))
      }
    },
    [broadcastState]
  )

  const startGame = useCallback(
    async (gameKey) => {
      try {
        const res = await apiClient.post(`/games/${gameKey}/start`)
        const savedGame = res.data
        broadcastState((prev) => ({
          ...prev,
          games: prev.games.map((g) =>
            String(g.id) === String(gameKey) ||
              g.code === gameKey ||
              g.id === savedGame.id
              ? savedGame
              : g
          ),
          courts: prev.courts.map((c) =>
            Number(c.id) === Number(savedGame.court_id)
              ? { ...c, status: 'Occupied' }
              : c
          ),
        }))
        return savedGame
      } catch (err) {
        throw new Error(extractErrorMessage(err))
      }
    },
    [broadcastState]
  )

  const syncGameFromRealtime = useCallback(
    (gameData) => {
      if (!gameData || (!gameData.id && !gameData.code)) return
      broadcastState((prev) => {
        const matchFn = (g) =>
          (gameData.id && String(g.id) === String(gameData.id)) ||
          (gameData.code && g.code === gameData.code)
        const exists = prev.games.some(matchFn)
        if (!exists) {
          return {
            ...prev,
            games: [gameData, ...prev.games],
          }
        }
        return {
          ...prev,
          games: prev.games.map((g) => (matchFn(g) ? { ...g, ...gameData } : g)),
        }
      })
    },
    [broadcastState]
  )

  const addPoint = useCallback(
    async (gameKey, team, performHttp = true) => {
      const currentGame = state.games.find(
        (g) => String(g.id) === String(gameKey) || g.code === gameKey
      )

      let optimisticGame = null
      // 0ms Optimistic UI update
      if (currentGame) {
        const optimisticScoreA =
          team === 'A' ? currentGame.score_a + 1 : currentGame.score_a
        const optimisticScoreB =
          team === 'B' ? currentGame.score_b + 1 : currentGame.score_b
        const nextServingTeam =
          currentGame.serving_team !== team ? team : currentGame.serving_team
        const nextServerNumber =
          currentGame.serving_team !== team ? 1 : currentGame.server_number

        optimisticGame = {
          ...currentGame,
          score_a: optimisticScoreA,
          score_b: optimisticScoreB,
          serving_team: nextServingTeam,
          server_number: nextServerNumber,
          status:
            currentGame.status === 'Upcoming' ? 'Live' : currentGame.status,
          score_events: [
            ...(currentGame.score_events || []).slice(-499),
            {
              id: Date.now(),
              type: 'POINT',
              team,
              timestamp: new Date().toISOString(),
              description: `Point awarded to ${
                team === 'A' ? currentGame.team_a_name : currentGame.team_b_name
              } (${optimisticScoreA}-${optimisticScoreB})`,
              score_a: optimisticScoreA,
              score_b: optimisticScoreB,
              serving_team: nextServingTeam,
              server_number: nextServerNumber,
              game_number: currentGame.current_game_number,
              prev: {
                score_a: currentGame.score_a,
                score_b: currentGame.score_b,
                games_won_a: currentGame.games_won_a,
                games_won_b: currentGame.games_won_b,
                current_game_number: currentGame.current_game_number,
                set_scores: [...(currentGame.set_scores || [])],
                serving_team: currentGame.serving_team,
                server_number: currentGame.server_number,
              },
            },
          ],
        }

        broadcastState((prev) => ({
          ...prev,
          games: prev.games.map((g) =>
            String(g.id) === String(gameKey) || g.code === gameKey
              ? optimisticGame
              : g
          ),
        }))
      }

      if (!performHttp) {
        return optimisticGame || currentGame
      }

      try {
        const res = await apiClient.post(`/games/${gameKey}/score`, { team })
        const savedGame = res.data
        broadcastState((prev) => ({
          ...prev,
          games: prev.games.map((g) =>
            String(g.id) === String(gameKey) ||
            g.code === gameKey ||
            g.id === savedGame.id
              ? savedGame
              : g
          ),
        }))
        return savedGame
      } catch (err) {
        if (currentGame) {
          broadcastState((prev) => ({
            ...prev,
            games: prev.games.map((g) =>
              String(g.id) === String(gameKey) || g.code === gameKey
                ? currentGame
                : g
            ),
          }))
        }
        throw new Error(extractErrorMessage(err))
      }
    },
    [state.games, broadcastState]
  )

  const changeServer = useCallback(
    async (gameKey, servingTeam, serverNumber = 1, reason = 'Server Updated', performHttp = true) => {
      const currentGame = state.games.find(
        (g) => String(g.id) === String(gameKey) || g.code === gameKey
      )

      let optimisticGame = null
      // 0ms Optimistic server change
      if (currentGame) {
        optimisticGame = {
          ...currentGame,
          serving_team: servingTeam,
          server_number: serverNumber,
          score_events: [
            ...(currentGame.score_events || []).slice(-499),
            {
              id: Date.now(),
              type: 'SERVER_CHANGE',
              timestamp: new Date().toISOString(),
              description: `${reason}: ${
                servingTeam === 'A' ? currentGame.team_a_name : currentGame.team_b_name
              } Server #${serverNumber}`,
              score_a: currentGame.score_a,
              score_b: currentGame.score_b,
              serving_team: servingTeam,
              server_number: serverNumber,
              game_number: currentGame.current_game_number,
            },
          ],
        }

        broadcastState((prev) => ({
          ...prev,
          games: prev.games.map((g) =>
            String(g.id) === String(gameKey) || g.code === gameKey
              ? optimisticGame
              : g
          ),
        }))
      }

      if (!performHttp) {
        return optimisticGame || currentGame
      }

      try {
        const res = await apiClient.post(`/games/${gameKey}/server`, {
          serving_team: servingTeam,
          server_number: serverNumber,
          reason,
        })
        const savedGame = res.data
        broadcastState((prev) => ({
          ...prev,
          games: prev.games.map((g) =>
            String(g.id) === String(gameKey) ||
            g.code === gameKey ||
            g.id === savedGame.id
              ? savedGame
              : g
          ),
        }))
        return savedGame
      } catch (err) {
        if (currentGame) {
          broadcastState((prev) => ({
            ...prev,
            games: prev.games.map((g) =>
              String(g.id) === String(gameKey) || g.code === gameKey
                ? currentGame
                : g
            ),
          }))
        }
        throw new Error(extractErrorMessage(err))
      }
    },
    [state.games, broadcastState]
  )

  const triggerSideOut = useCallback(
    async (gameKey, performHttp = true) => {
      const target = state.games.find(
        (g) => String(g.id) === String(gameKey) || g.code === gameKey
      )
      if (!target) return
      if (target.match_type === 'Doubles' && target.server_number === 1) {
        await changeServer(gameKey, target.serving_team, 2, 'Second Server', performHttp)
      } else {
        const nextTeam = target.serving_team === 'A' ? 'B' : 'A'
        await changeServer(gameKey, nextTeam, 1, 'Side-Out', performHttp)
      }
    },
    [state.games, changeServer]
  )

  const undoLastEvent = useCallback(
    async (gameKey, performHttp = true) => {
      const currentGame = state.games.find(
        (g) => String(g.id) === String(gameKey) || g.code === gameKey
      )

      let optimisticGame = null
      // 0ms Optimistic undo
      if (currentGame && Array.isArray(currentGame.score_events)) {
        const lastReversible = [...currentGame.score_events]
          .reverse()
          .find((e) => e.prev)

        if (lastReversible?.prev) {
          optimisticGame = {
            ...currentGame,
            ...lastReversible.prev,
            score_events: currentGame.score_events.filter(
              (e) => e.id !== lastReversible.id
            ),
          }

          broadcastState((prev) => ({
            ...prev,
            games: prev.games.map((g) =>
              String(g.id) === String(gameKey) || g.code === gameKey
                ? optimisticGame
                : g
            ),
          }))
        }
      }

      if (!performHttp) {
        return optimisticGame || currentGame
      }

      try {
        const res = await apiClient.post(`/games/${gameKey}/undo`)
        const savedGame = res.data
        broadcastState((prev) => ({
          ...prev,
          games: prev.games.map((g) =>
            String(g.id) === String(gameKey) ||
            g.code === gameKey ||
            g.id === savedGame.id
              ? savedGame
              : g
          ),
        }))
        return savedGame
      } catch (err) {
        if (currentGame) {
          broadcastState((prev) => ({
            ...prev,
            games: prev.games.map((g) =>
              String(g.id) === String(gameKey) || g.code === gameKey
                ? currentGame
                : g
            ),
          }))
        }
        throw new Error(extractErrorMessage(err))
      }
    },
    [state.games, broadcastState]
  )

  const completeGame = useCallback(
    async (gameKey, explicitWinnerTeam = null) => {
      try {
        const res = await apiClient.post(`/games/${gameKey}/complete`, {
          winner_team: explicitWinnerTeam,
        })
        const savedGame = res.data
        broadcastState((prev) => ({
          ...prev,
          games: prev.games.map((g) =>
            String(g.id) === String(gameKey) ||
              g.code === gameKey ||
              g.id === savedGame.id
              ? savedGame
              : g
          ),
        }))
        await refreshDatabaseState()
        return savedGame
      } catch (err) {
        throw new Error(extractErrorMessage(err))
      }
    },
    [broadcastState, refreshDatabaseState]
  )

  // TOURNAMENT ACTIONS (Database-backed)
  const createTournament = useCallback(
    async (payload) => {
      try {
        const res = await apiClient.post('/tournaments', payload)
        const saved = res.data
        broadcastState((prev) => ({
          ...prev,
          tournaments: [
            saved,
            ...prev.tournaments.filter((t) => t.id !== saved.id),
          ],
        }))
        return saved
      } catch (err) {
        throw new Error(extractErrorMessage(err))
      }
    },
    [broadcastState]
  )

  const updateTournament = useCallback(
    async (tournamentKey, updates) => {
      try {
        const res = await apiClient.patch(
          `/tournaments/${tournamentKey}`,
          updates
        )
        const saved = res.data
        broadcastState((prev) => ({
          ...prev,
          tournaments: prev.tournaments.map((t) =>
            String(t.id) === String(tournamentKey) ||
              t.code === tournamentKey ||
              t.id === saved.id
              ? saved
              : t
          ),
        }))
        return saved
      } catch (err) {
        throw new Error(extractErrorMessage(err))
      }
    },
    [broadcastState]
  )

  const addParticipant = useCallback(
    async (tournamentKey, participantPayload) => {
      try {
        const res = await apiClient.post(
          `/tournaments/${tournamentKey}/participants`,
          participantPayload
        )
        const saved = res.data
        broadcastState((prev) => ({
          ...prev,
          tournaments: prev.tournaments.map((t) =>
            String(t.id) === String(tournamentKey) ||
              t.code === tournamentKey ||
              t.id === saved.id
              ? saved
              : t
          ),
        }))
        return saved
      } catch (err) {
        throw new Error(extractErrorMessage(err))
      }
    },
    [broadcastState]
  )

  const updateParticipant = useCallback(
    async (tournamentKey, participantId, updates) => {
      try {
        const res = await apiClient.patch(
          `/tournaments/${tournamentKey}/participants/${participantId}`,
          updates
        )
        const saved = res.data
        broadcastState((prev) => ({
          ...prev,
          tournaments: prev.tournaments.map((t) =>
            String(t.id) === String(tournamentKey) ||
              t.code === tournamentKey ||
              t.id === saved.id
              ? saved
              : t
          ),
        }))
        return saved
      } catch (err) {
        throw new Error(extractErrorMessage(err))
      }
    },
    [broadcastState]
  )

  const removeParticipant = useCallback(
    async (tournamentKey, participantId) => {
      try {
        const res = await apiClient.delete(
          `/tournaments/${tournamentKey}/participants/${participantId}`
        )
        const saved = res.data
        broadcastState((prev) => ({
          ...prev,
          tournaments: prev.tournaments.map((t) =>
            String(t.id) === String(tournamentKey) ||
              t.code === tournamentKey ||
              t.id === saved.id
              ? saved
              : t
          ),
        }))
        return saved
      } catch (err) {
        throw new Error(extractErrorMessage(err))
      }
    },
    [broadcastState]
  )

  const regenerateTournamentBracket = useCallback(
    async (tournamentKey) => {
      try {
        const res = await apiClient.post(
          `/tournaments/${tournamentKey}/generate-bracket`
        )
        const saved = res.data
        broadcastState((prev) => ({
          ...prev,
          tournaments: prev.tournaments.map((t) =>
            String(t.id) === String(tournamentKey) ||
              t.code === tournamentKey ||
              t.id === saved.id
              ? saved
              : t
          ),
        }))
        return saved
      } catch (err) {
        throw new Error(extractErrorMessage(err))
      }
    },
    [broadcastState]
  )

  const updateTournamentMatch = useCallback(
    async (tournamentKey, matchId, updates) => {
      try {
        const res = await apiClient.patch(
          `/tournaments/${tournamentKey}/matches/${matchId}`,
          updates
        )
        const saved = res.data
        broadcastState((prev) => ({
          ...prev,
          tournaments: prev.tournaments.map((t) =>
            String(t.id) === String(tournamentKey) ||
              t.code === tournamentKey ||
              t.id === saved.id
              ? saved
              : t
          ),
        }))
        return saved
      } catch (err) {
        throw new Error(extractErrorMessage(err))
      }
    },
    [broadcastState]
  )

  // COURT ACTIONS (Database-backed)
  const addCourt = useCallback(
    async (payload) => {
      try {
        const res = await apiClient.post('/courts', payload)
        const saved = res.data
        broadcastState((prev) => ({
          ...prev,
          courts: [
            ...prev.courts.filter((c) => c.id !== saved.id),
            saved,
          ].sort((a, b) => a.court_number - b.court_number),
        }))
        return saved
      } catch (err) {
        throw new Error(extractErrorMessage(err))
      }
    },
    [broadcastState]
  )

  const updateCourt = useCallback(
    async (courtId, updates) => {
      try {
        const res = await apiClient.patch(`/courts/${courtId}`, updates)
        const saved = res.data
        broadcastState((prev) => ({
          ...prev,
          courts: prev.courts
            .map((c) => (Number(c.id) === Number(courtId) ? saved : c))
            .sort((a, b) => a.court_number - b.court_number),
        }))
        return saved
      } catch (err) {
        throw new Error(extractErrorMessage(err))
      }
    },
    [broadcastState]
  )

  // SETTINGS & USERS ACTIONS (Database-backed)
  const updateSettings = useCallback(
    async (section, values) => {
      try {
        const res = await apiClient.patch('/settings', { [section]: values })
        const savedSettings = res.data
        broadcastState((prev) => ({
          ...prev,
          settings: savedSettings || {
            ...prev.settings,
            [section]: {
              ...(prev.settings?.[section] || {}),
              ...values,
            },
          },
        }))
        return savedSettings
      } catch (err) {
        throw new Error(extractErrorMessage(err))
      }
    },
    [broadcastState]
  )

  const login = useCallback(
    async (usernameInput, passwordInput) => {
      const normalizedUsername = String(usernameInput || '')
        .trim()
        .toLowerCase()
      const password = String(passwordInput || '')

      if (!normalizedUsername || !password) {
        throw new Error('Please enter both your username and password.')
      }

      try {
        const res = await apiClient.post('/auth/login', {
          username: normalizedUsername,
          password,
        })
        const { access_token, refresh_token, user: apiUser } = res.data
        setStoredTokens(access_token, refresh_token)

        const authedUser = normalizeUserRecord(apiUser)
        persistCurrentUser(authedUser)
        await refreshDatabaseState(authedUser)
        return authedUser
      } catch (apiErr) {
        const detail = apiErr?.response?.data?.detail
        if (typeof detail === 'string' && detail.trim()) {
          throw new Error(detail)
        }
        throw new Error('Invalid username or password.')
      }
    },
    [persistCurrentUser, refreshDatabaseState]
  )

  const logout = useCallback(async () => {
    clearStoredTokens()
    persistCurrentUser(null)
    if (supabase) {
      try {
        await supabase.auth.signOut({ scope: 'local' })
      } catch {
        // ignore
      }
    }
    try {
      localStorage.removeItem(AUTH_SESSION_KEY)
      localStorage.removeItem('rallyos_access_token')
      localStorage.removeItem('rallyos_refresh_token')
    } catch {
      // ignore
    }
    broadcastState({
      courts: [],
      games: [],
      tournaments: [],
      users: [],
      adminAccounts: [],
      adminSummary: DEFAULT_ADMIN_SUMMARY,
      settings: DEFAULT_EMPTY_SETTINGS,
      notifications: [],
    })
  }, [persistCurrentUser, broadcastState])

  const register = useCallback(
    async (registerPayload) => {
      const normalizedUsername = String(registerPayload.username || '')
        .trim()
        .toLowerCase()
      const fullName = String(registerPayload.full_name || '').trim()
      const email = String(registerPayload.email || '').trim().toLowerCase()
      const password = String(registerPayload.password || '')

      if (!fullName || fullName.length < 2) {
        throw new Error('Full name must be at least 2 characters.')
      }
      if (!normalizedUsername || normalizedUsername.length < 2) {
        throw new Error('Username must be at least 2 characters.')
      }
      if (!password || password.length < 6) {
        throw new Error('Password must be at least 6 characters.')
      }

      try {
        const res = await apiClient.post('/auth/register', {
          username: normalizedUsername,
          email: email || undefined,
          full_name: fullName,
          password,
        })
        const { access_token, refresh_token, user: apiUser } = res.data
        setStoredTokens(access_token, refresh_token)

        const authedUser = normalizeUserRecord(apiUser)
        persistCurrentUser(authedUser)
        await refreshDatabaseState(authedUser)
        return authedUser
      } catch (apiErr) {
        const detail = apiErr?.response?.data?.detail
        if (typeof detail === 'string' && detail.trim()) {
          throw new Error(detail)
        }
        throw new Error('Registration failed. Please check your details.')
      }
    },
    [persistCurrentUser, refreshDatabaseState]
  )

  const loginWithGoogle = useCallback(async () => {
    if (!supabase) {
      throw new Error(
        'Supabase client is not configured. Please verify your environment keys.'
      )
    }
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/login`,
      },
    })
    if (error) {
      throw error
    }
    return data
  }, [])

  const syncGoogleSession = useCallback(
    async (googleSession) => {
      const email = googleSession?.user?.email
      if (!email) {
        throw new Error('No email found in Google account session.')
      }
      const fullName =
        googleSession.user?.user_metadata?.full_name ||
        googleSession.user?.user_metadata?.name ||
        email.split('@')[0]
      const supabaseUid = googleSession.user?.id

      try {
        const res = await apiClient.post('/auth/google', {
          email,
          full_name: fullName,
          supabase_uid: supabaseUid,
          id_token: googleSession.access_token || null,
        })
        const { access_token, refresh_token, user: apiUser } = res.data
        setStoredTokens(access_token, refresh_token)

        const authedUser = normalizeUserRecord(apiUser)
        persistCurrentUser(authedUser)
        await refreshDatabaseState(authedUser)
        return authedUser
      } catch (apiErr) {
        const detail = apiErr?.response?.data?.detail
        if (typeof detail === 'string' && detail.trim()) {
          throw new Error(detail)
        }
        throw new Error('Failed to synchronize Google account with RallyOS.')
      }
    },
    [persistCurrentUser, refreshDatabaseState]
  )

  const addUserAccount = useCallback(
    async (userPayload) => {
      if (normalizeRoleKey(currentUser?.role) !== 'admin') {
        throw new Error(
          'Access denied: Only an Administrator can create Scorekeeper accounts.'
        )
      }

      const normalizedUsername = String(userPayload.username || '')
        .trim()
        .toLowerCase()
      const fullName = String(userPayload.full_name || '').trim()
      const password = String(userPayload.password || '')
      const roleKey = normalizeRoleKey(userPayload.role || 'Scorekeeper')
      if (roleKey !== 'scorekeeper') {
        throw new Error(
          'Only a Super Admin can create Administrator accounts.'
        )
      }
      const roleLabel = formatRoleLabel(roleKey)

      if (!fullName || fullName.length < 2) {
        throw new Error('Full name must be at least 2 characters.')
      }
      if (!normalizedUsername || normalizedUsername.length < 2) {
        throw new Error('Username must be at least 2 characters.')
      }
      if (!password || password.length < 6) {
        throw new Error('Password must be at least 6 characters.')
      }

      try {
        const res = await apiClient.post('/users', {
          username: normalizedUsername,
          email: `${normalizedUsername}@rallyos.club`,
          full_name: fullName,
          job_title: userPayload.job_title?.trim() || roleLabel,
          phone: userPayload.phone?.trim() || null,
          password,
          role: roleKey,
          is_active: true,
        })
        const createdUser = normalizeUserRecord(res.data)
        if (normalizeRoleKey(createdUser.role) !== 'admin') {
          broadcastState((prev) => ({
            ...prev,
            users: [...prev.users, createdUser],
          }))
        }
        return createdUser
      } catch (err) {
        if (err?.response?.status === 409) {
          throw new Error('An account with this username already exists.')
        }
        throw new Error(extractErrorMessage(err))
      }
    },
    [currentUser, broadcastState]
  )

  const updateUserAccount = useCallback(
    async (userId, updates) => {
      if (normalizeRoleKey(currentUser?.role) !== 'admin') {
        throw new Error(
          'Access denied: Only an Administrator can modify user accounts.'
        )
      }

      if (Number(userId) === Number(currentUser?.id)) {
        if (updates.is_active === false) {
          throw new Error('You cannot deactivate your own Administrator account.')
        }
        if (updates.role && normalizeRoleKey(updates.role) !== 'admin') {
          throw new Error('You cannot demote your own Administrator role.')
        }
      }

      const apiPayload = {}
      if (updates.full_name !== undefined) apiPayload.full_name = updates.full_name
      if (updates.job_title !== undefined) apiPayload.job_title = updates.job_title
      if (updates.phone !== undefined) apiPayload.phone = updates.phone
      if (updates.password) apiPayload.password = updates.password
      if (updates.role !== undefined) {
        apiPayload.role = normalizeRoleKey(updates.role)
      }
      if (updates.is_active !== undefined) {
        apiPayload.is_active = updates.is_active
      }

      try {
        const res = await apiClient.patch(`/users/${userId}`, apiPayload)
        const updatedUser = normalizeUserRecord(res.data)
        broadcastState((prev) => ({
          ...prev,
          users: prev.users.map((u) =>
            Number(u.id) === Number(userId) ? updatedUser : u
          ),
        }))
        if (Number(userId) === Number(currentUser?.id)) {
          persistCurrentUser(updatedUser)
        }
        return updatedUser
      } catch (err) {
        throw new Error(extractErrorMessage(err))
      }
    },
    [currentUser, broadcastState, persistCurrentUser]
  )

  const deleteUserAccount = useCallback(
    async (userId) => {
      if (normalizeRoleKey(currentUser?.role) !== 'admin') {
        throw new Error(
          'Access denied: Only an Administrator can delete user accounts.'
        )
      }
      if (Number(userId) === Number(currentUser?.id)) {
        throw new Error('You cannot delete your own Administrator account.')
      }

      try {
        await apiClient.delete(`/users/${userId}`)
        broadcastState((prev) => ({
          ...prev,
          users: prev.users.filter((u) => Number(u.id) !== Number(userId)),
        }))
      } catch (err) {
        throw new Error(extractErrorMessage(err))
      }
    },
    [currentUser, broadcastState]
  )

  const refreshAdminAccounts = useCallback(
    async (params = {}) => {
      if (normalizeRoleKey(currentUser?.role) !== 'super_admin') {
        throw new Error(
          'Access denied: Only a Super Admin can monitor Administrator accounts.'
        )
      }
      try {
        const res = await apiClient.get('/super-admin/admins', { params })
        const items = Array.isArray(res?.data?.items)
          ? res.data.items.map(normalizeUserRecord)
          : []
        const summary = res?.data?.summary || DEFAULT_ADMIN_SUMMARY
        if (!params.search && params.is_active === undefined) {
          broadcastState((prev) => ({
            ...prev,
            adminAccounts: items,
            adminSummary: summary,
          }))
        }
        return { items, summary }
      } catch (err) {
        throw new Error(extractErrorMessage(err))
      }
    },
    [currentUser, broadcastState]
  )

  const createAdminAccount = useCallback(
    async (adminPayload) => {
      if (normalizeRoleKey(currentUser?.role) !== 'super_admin') {
        throw new Error(
          'Access denied: Only a Super Admin can create Administrator accounts.'
        )
      }
      const normalizedUsername = String(adminPayload.username || '')
        .trim()
        .toLowerCase()
      const fullName = String(adminPayload.full_name || '').trim()
      const password = String(adminPayload.password || '')

      if (!fullName || fullName.length < 2) {
        throw new Error('Full name must be at least 2 characters.')
      }
      if (!normalizedUsername || normalizedUsername.length < 2) {
        throw new Error('Username must be at least 2 characters.')
      }
      if (!password || password.length < 6) {
        throw new Error('Password must be at least 6 characters.')
      }

      try {
        await apiClient.post('/super-admin/admins', {
          username: normalizedUsername,
          email: `${normalizedUsername}@rallyos.club`,
          full_name: fullName,
          job_title: adminPayload.job_title?.trim() || 'Club Administrator',
          phone: adminPayload.phone?.trim() || null,
          password,
          is_active: true,
        })
        await refreshAdminAccounts()
      } catch (err) {
        if (err?.response?.status === 409) {
          throw new Error('An account with this username already exists.')
        }
        throw new Error(extractErrorMessage(err))
      }
    },
    [currentUser, refreshAdminAccounts]
  )

  const updateAdminAccount = useCallback(
    async (adminId, updates) => {
      if (normalizeRoleKey(currentUser?.role) !== 'super_admin') {
        throw new Error(
          'Access denied: Only a Super Admin can modify Administrator accounts.'
        )
      }
      const apiPayload = {}
      if (updates.full_name !== undefined) apiPayload.full_name = updates.full_name
      if (updates.job_title !== undefined) apiPayload.job_title = updates.job_title
      if (updates.phone !== undefined) apiPayload.phone = updates.phone
      if (updates.password) apiPayload.password = updates.password
      if (updates.is_active !== undefined) apiPayload.is_active = updates.is_active

      try {
        const res = await apiClient.patch(
          `/super-admin/admins/${adminId}`,
          apiPayload
        )
        const updated = normalizeUserRecord(res.data)
        await refreshAdminAccounts()
        return updated
      } catch (err) {
        throw new Error(extractErrorMessage(err))
      }
    },
    [currentUser, refreshAdminAccounts]
  )

  const deleteAdminAccount = useCallback(
    async (adminId) => {
      if (normalizeRoleKey(currentUser?.role) !== 'super_admin') {
        throw new Error(
          'Access denied: Only a Super Admin can delete Administrator accounts.'
        )
      }
      try {
        await apiClient.delete(`/super-admin/admins/${adminId}`)
        await refreshAdminAccounts()
      } catch (err) {
        throw new Error(extractErrorMessage(err))
      }
    },
    [currentUser, refreshAdminAccounts]
  )

  const setActiveOperator = useCallback(
    (userId) => {
      const found = state.users.find((u) => Number(u.id) === Number(userId))
      if (found) {
        persistCurrentUser(found)
      }
    },
    [state.users, persistCurrentUser]
  )

  const activeOperator = currentUser
  const userRole = currentUser ? normalizeRoleKey(currentUser.role) : null
  const isAuthenticated = Boolean(currentUser)
  const isSuperAdmin = userRole === 'super_admin'
  const isAdmin = userRole === 'admin'
  const isScorekeeper = userRole === 'scorekeeper'
  const canManageOperations = isAdmin
  const canManageAccounts = isAdmin
  const canManageAdmins = isSuperAdmin
  const canScoreMatches = isAdmin || isScorekeeper

  const value = useMemo(
    () => ({
      courts: courtsWithSchedule,
      games: state.games,
      tournaments: state.tournaments,
      users: state.users,
      adminAccounts: state.adminAccounts,
      adminSummary: state.adminSummary,
      settings: state.settings,
      notifications: state.notifications || [],
      currentUser,
      activeOperator,
      isAuthenticated,
      userRole,
      isSuperAdmin,
      isAdmin,
      isScorekeeper,
      canManageOperations,
      canManageAccounts,
      canManageAdmins,
      canScoreMatches,
      login,
      logout,
      register,
      loginWithGoogle,
      syncGoogleSession,
      refreshDatabaseState,
      syncGameFromRealtime,
      setActiveOperator,
      pushNotification,
      markAllNotificationsRead,
      getCourtsAvailability,
      createGame,
      updateGame,
      startGame,
      addPoint,
      changeServer,
      triggerSideOut,
      undoLastEvent,
      completeGame,
      createTournament,
      updateTournament,
      addParticipant,
      updateParticipant,
      removeParticipant,
      regenerateTournamentBracket,
      updateTournamentMatch,
      addCourt,
      updateCourt,
      updateSettings,
      addUserAccount,
      updateUserAccount,
      deleteUserAccount,
      refreshAdminAccounts,
      createAdminAccount,
      updateAdminAccount,
      deleteAdminAccount,
    }),
    [
      courtsWithSchedule,
      state.games,
      state.tournaments,
      state.users,
      state.adminAccounts,
      state.adminSummary,
      state.settings,
      state.notifications,
      currentUser,
      activeOperator,
      isAuthenticated,
      userRole,
      isSuperAdmin,
      isAdmin,
      isScorekeeper,
      canManageOperations,
      canManageAccounts,
      canManageAdmins,
      canScoreMatches,
      login,
      logout,
      register,
      loginWithGoogle,
      syncGoogleSession,
      refreshDatabaseState,
      syncGameFromRealtime,
      setActiveOperator,
      pushNotification,
      markAllNotificationsRead,
      getCourtsAvailability,
      createGame,
      updateGame,
      startGame,
      addPoint,
      changeServer,
      triggerSideOut,
      undoLastEvent,
      completeGame,
      createTournament,
      updateTournament,
      addParticipant,
      updateParticipant,
      removeParticipant,
      regenerateTournamentBracket,
      updateTournamentMatch,
      addCourt,
      updateCourt,
      updateSettings,
      addUserAccount,
      updateUserAccount,
      deleteUserAccount,
      refreshAdminAccounts,
      createAdminAccount,
      updateAdminAccount,
      deleteAdminAccount,
    ]
  )

  return <RallyContext.Provider value={value}>{children}</RallyContext.Provider>
}
