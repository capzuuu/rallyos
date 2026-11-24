import { Suspense, lazy } from 'react'
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { RallyProvider } from './context/RallyContext'
import { ToastProvider } from './context/ToastContext'
import { useRally } from './hooks/useRally'
import { getDefaultRouteForRole } from './utils/formatters'

const CourtsPage = lazy(() => import('./pages/CourtsPage'))
const GameDetailsPage = lazy(() =>
  import('./pages/GameDetailsPage').then((m) => ({
    default: m.GameDetailsPage,
  }))
)
const GamesPage = lazy(() =>
  import('./pages/GamesPage').then((m) => ({ default: m.GamesPage }))
)
const LoginPage = lazy(() => import('./pages/LoginPage'))
const PublicScoreboardPage = lazy(() =>
  import('./pages/PublicScoreboardPage').then((m) => ({
    default: m.PublicScoreboardPage,
  }))
)
const ScorekeeperHubPage = lazy(() => import('./pages/ScorekeeperHubPage'))
const ScorekeeperPage = lazy(() =>
  import('./pages/ScorekeeperPage').then((m) => ({
    default: m.ScorekeeperPage,
  }))
)
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const SuperAdminPage = lazy(() => import('./pages/SuperAdminPage'))
const TournamentDetailsPage = lazy(() =>
  import('./pages/TournamentDetailsPage')
)
const TournamentsPage = lazy(() => import('./pages/TournamentsPage'))

function PageLoader() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="flex items-center gap-3 rounded-xl border border-[#DCE1E8] bg-[#FFFFFF] px-5 py-3 shadow-sm">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#12B9B0]" />
        <span className="text-[13px] font-semibold text-[#172131]">
          Loading RallyOS view...
        </span>
      </div>
    </div>
  )
}

function RequireAuth({ children }) {
  const { isAuthenticated } = useRally()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  return children || <Outlet />
}

function RequireOperationsRole() {
  const { isAuthenticated, canManageOperations, currentUser } = useRally()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  if (!canManageOperations) {
    return (
      <Navigate
        to={getDefaultRouteForRole(currentUser?.role)}
        replace
      />
    )
  }
  return <Outlet />
}

function RequireScoringRole({ children }) {
  const { isAuthenticated, canScoreMatches, currentUser } = useRally()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  if (!canScoreMatches) {
    return (
      <Navigate
        to={getDefaultRouteForRole(currentUser?.role)}
        replace
      />
    )
  }
  return children || <Outlet />
}

function RequireSuperAdminRole() {
  const { isAuthenticated, isSuperAdmin, currentUser } = useRally()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  if (!isSuperAdmin) {
    return (
      <Navigate
        to={getDefaultRouteForRole(currentUser?.role)}
        replace
      />
    )
  }
  return <Outlet />
}

function RoleDefaultRedirect() {
  const { isAuthenticated, currentUser } = useRally()
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  return <Navigate to={getDefaultRouteForRole(currentUser?.role)} replace />
}

export default function App() {
  return (
    <ToastProvider>
      <RallyProvider>
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Unified Single Login Portal for Super Admin, Administrator, and Scorekeeper */}
              <Route path="/login" element={<LoginPage />} />

              {/* Dedicated Full-Screen Scorekeeper Terminal (Requires Auth: Scorekeeper or Admin) */}
              <Route
                path="/scorekeeper/:gameId"
                element={
                  <RequireScoringRole>
                    <ScorekeeperPage />
                  </RequireScoringRole>
                }
              />

              {/* Dedicated Public Read-Only Live TV/Monitor Scoreboard */}
              <Route
                path="/scoreboard/:gameId"
                element={<PublicScoreboardPage />}
              />

              {/* Main RallyOS Operational Shell (Protected) */}
              <Route
                element={
                  <RequireAuth>
                    <AppShell />
                  </RequireAuth>
                }
              >
                <Route path="/" element={<RoleDefaultRedirect />} />

                {/* Super Admin Console (Administrator Accounts Monitor Only) */}
                <Route element={<RequireSuperAdminRole />}>
                  <Route path="/super-admin" element={<SuperAdminPage />} />
                </Route>

                {/* Scorekeeper & TV Scoreboard Hub (Accessible by Scorekeeper and Administrator) */}
                <Route element={<RequireScoringRole />}>
                  <Route path="/scorekeeper" element={<ScorekeeperHubPage />} />
                  <Route path="/scoreboard" element={<ScorekeeperHubPage />} />
                </Route>

                {/* Operations & Settings (Administrator Only — Scorekeeper Redirected to /scorekeeper) */}
                <Route element={<RequireOperationsRole />}>
                  <Route path="/games" element={<GamesPage />} />
                  <Route path="/games/:gameId" element={<GameDetailsPage />} />
                  <Route path="/tournaments" element={<TournamentsPage />} />
                  <Route
                    path="/tournaments/:tournamentId"
                    element={<TournamentDetailsPage />}
                  />
                  <Route path="/courts" element={<CourtsPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                </Route>
              </Route>

              {/* Fallback */}
              <Route path="*" element={<RoleDefaultRedirect />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </RallyProvider>
    </ToastProvider>
  )
}
