import { useEffect, useState } from 'react'
import { AlertCircle, Eye, EyeOff, Info, Sparkles } from 'lucide-react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import Logo from '../components/ui/Logo'
import { supabase } from '../api/supabase'
import { useRally } from '../hooks/useRally'
import { useToast } from '../hooks/useToast'
import {
  formatRoleLabel,
  getDefaultRouteForRole,
  normalizeRoleKey,
} from '../utils/formatters'

export default function LoginPage() {
  const {
    login,
    register,
    syncGoogleSession,
    isAuthenticated,
    currentUser,
  } = useRally()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const location = useLocation()

  // Mode: 'login' | 'register'
  const [mode, setMode] = useState('login')

  // Common credentials
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // Registration credentials
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')

  // State flags
  const [errorMsg, setErrorMsg] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [providerNotice, setProviderNotice] = useState(null)

  const navigateAfterAuth = (authedUser) => {
    const roleKey = normalizeRoleKey(authedUser.role)
    const roleLabel = formatRoleLabel(authedUser.role)
    const defaultPath = getDefaultRouteForRole(roleKey)

    const requestedFrom = location.state?.from?.pathname
    let destination = defaultPath
    if (requestedFrom && requestedFrom !== '/login') {
      if (roleKey === 'super_admin') {
        if (requestedFrom.startsWith('/super-admin')) {
          destination = requestedFrom
        }
      } else if (roleKey === 'scorekeeper') {
        if (
          requestedFrom.startsWith('/scorekeeper') ||
          requestedFrom.startsWith('/scoreboard')
        ) {
          destination = requestedFrom
        }
      } else if (!requestedFrom.startsWith('/super-admin')) {
        destination = requestedFrom
      }
    }

    showToast({
      type: 'success',
      title: `Signed in as ${authedUser.full_name}`,
      message: roleLabel,
    })
    navigate(destination, { replace: true })
  }

  // Handle OAuth callback listener from Supabase ONLY when arriving from OAuth redirect
  useEffect(() => {
    if (!supabase || isAuthenticated) return
    let isMounted = true

    // Only process Supabase session if this is an active OAuth redirect callback
    const hasOAuthHash =
      window.location.hash.includes('access_token=') ||
      window.location.hash.includes('refresh_token=')
    const hasOAuthQuery = window.location.search.includes('code=')
    const isOAuthRedirect = hasOAuthHash || hasOAuthQuery

    const checkAndSyncSession = async (session) => {
      if (!session?.user?.email || !isMounted) return
      try {
        setGoogleLoading(true)
        const authedUser = await syncGoogleSession(session)
        // Clean URL after consuming OAuth tokens so back/refresh doesn't re-trigger
        try {
          window.history.replaceState(null, '', window.location.pathname)
        } catch {
          // ignore
        }
        if (isMounted) {
          navigateAfterAuth(authedUser)
        }
      } catch (err) {
        if (isMounted) {
          setErrorMsg(err.message || 'Google account sync failed.')
        }
      } finally {
        if (isMounted) setGoogleLoading(false)
      }
    }

    if (isOAuthRedirect) {
      supabase.auth.getSession().then(({ data, error }) => {
        if (!error && data?.session) {
          checkAndSyncSession(data.session)
        }
      })
    }

    // Listen to incoming auth events only when redirected from OAuth
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_IN' && session?.user?.email && isOAuthRedirect) {
          checkAndSyncSession(session)
        }
      }
    )

    return () => {
      isMounted = false
      authListener?.subscription?.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated])

  // Handle redirect if already authenticated
  if (isAuthenticated && currentUser) {
    return <Navigate to={getDefaultRouteForRole(currentUser.role)} replace />
  }

  // Handle manual login or registration form submission
  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMsg('')
    setProviderNotice(null)
    setSubmitting(true)

    try {
      if (mode === 'login') {
        const authedUser = await login(username, password)
        navigateAfterAuth(authedUser)
      } else {
        const authedUser = await register({
          full_name: fullName,
          username,
          email: email || undefined,
          password,
        })
        showToast({
          type: 'success',
          title: `Welcome to RallyOS, ${authedUser.full_name}!`,
          message: 'Your Administrator account is ready.',
        })
        navigateAfterAuth(authedUser)
      }
    } catch (err) {
      setErrorMsg(err.message || 'Authentication failed. Please check your input.')
    } finally {
      setSubmitting(false)
    }
  }

  // Handle Google Sign-In with Supabase Auth
  const handleGoogleSignIn = async () => {
    setErrorMsg('')
    setProviderNotice(null)
    setGoogleLoading(true)

    try {
      if (!supabase) {
        throw new Error('Supabase client is not configured.')
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/login`,
        },
      })

      if (error) {
        // Detect if Google provider is not yet toggled on in Supabase project
        const lowerMsg = (error.message || '').toLowerCase()
        if (
          lowerMsg.includes('not enabled') ||
          lowerMsg.includes('unsupported provider')
        ) {
          setProviderNotice({
            title: 'Google OAuth Setup Required in Supabase',
            message:
              'The Google OAuth provider is not yet enabled in Supabase project qaocdecturwknyrbisse. You can enable it in Supabase Dashboard > Authentication > Providers > Google, or use the Demo Google Account below to test immediately.',
          })
          return
        }
        throw error
      }
    } catch (err) {
      setErrorMsg(err.message || 'Google sign-in could not be started.')
    } finally {
      setGoogleLoading(false)
    }
  }

  // Instant Demo Google Sign-In (provisions/authenticates an administrator)
  const handleDemoGoogleSignIn = async () => {
    setErrorMsg('')
    setProviderNotice(null)
    setGoogleLoading(true)
    try {
      const demoSession = {
        user: {
          id: 'google-oauth-demo-uid',
          email: 'google.admin@rallyos.club',
          user_metadata: {
            full_name: 'Google Admin (Demo)',
          },
        },
        access_token: 'demo-google-oauth-token',
      }
      const authedUser = await syncGoogleSession(demoSession)
      showToast({
        type: 'success',
        title: `Signed in as ${authedUser.full_name}`,
        message: 'Google Administrator Account',
      })
      navigateAfterAuth(authedUser)
    } catch (err) {
      setErrorMsg(err.message || 'Demo Google sign-in failed.')
    } finally {
      setGoogleLoading(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#F5F5F0] px-3 py-6 sm:px-4">
      <div className="w-full max-w-[420px] rounded-xl border border-[#E5E8E3] bg-[#FFFFFF] p-5 shadow-sm sm:p-7">
        {/* Brand Header */}
        <div className="mb-6 flex items-center justify-between">
          <Logo
            variant="full"
            theme="light"
            className="h-8.5 w-auto"
            alt="RallyOS"
          />
          <span className="rounded-full bg-[#172131]/5 px-2.5 py-1 text-[11px] font-semibold text-[#64748B]">
            Pickleball Arena
          </span>
        </div>

        {/* Tab Switcher: Sign In vs Register */}
        <div className="mb-5 flex rounded-lg bg-[#F5F5F0] p-1">
          <button
            type="button"
            onClick={() => {
              setMode('login')
              setErrorMsg('')
              setProviderNotice(null)
            }}
            className={`flex-1 rounded-md py-1.5 text-center text-[12px] font-semibold transition-all ${mode === 'login'
                ? 'bg-[#FFFFFF] text-[#172131] shadow-xs'
                : 'text-[#64748B] hover:text-[#172131]'
              }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register')
              setErrorMsg('')
              setProviderNotice(null)
            }}
            className={`flex-1 rounded-md py-1.5 text-center text-[12px] font-semibold transition-all ${mode === 'register'
                ? 'bg-[#FFFFFF] text-[#172131] shadow-xs'
                : 'text-[#64748B] hover:text-[#172131]'
              }`}
          >
            Create Account
          </button>
        </div>

        <div className="mb-4">
          <h1 className="text-[18px] font-semibold text-[#172131]">
            {mode === 'login' ? 'Welcome back' : 'Create Administrator Account'}
          </h1>
          <p className="mt-1 text-[12px] text-[#64748B]">
            {mode === 'login'
              ? 'Enter your credentials or sign in with Google to continue.'
              : 'Register an administrator account to manage your pickleball facility.'}
          </p>
        </div>

        {/* Google OAuth Button */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={submitting || googleLoading}
            className="flex h-10 w-full cursor-pointer items-center justify-center gap-2.5 rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-4 text-[13px] font-medium text-[#172131] transition-colors hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>
              {googleLoading
                ? 'Connecting with Google...'
                : 'Continue with Google'}
            </span>
          </button>
        </div>

        {/* Informative notice if Google provider needs Supabase dashboard toggle */}
        {providerNotice && (
          <div className="mt-3 rounded-lg border border-[#3B82F6]/30 bg-[#EFF6FF] p-3 text-[12px] text-[#1E40AF]">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#3B82F6]" />
              <div className="space-y-2">
                <p className="font-semibold">{providerNotice.title}</p>
                <p className="leading-relaxed text-[#1E3A8A]">
                  {providerNotice.message}
                </p>
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={handleDemoGoogleSignIn}
                    className="inline-flex items-center gap-1.5 rounded-md bg-[#1E40AF] px-2.5 py-1 text-[11px] font-semibold text-[#FFFFFF] hover:bg-[#1E3A8A]"
                  >
                    <Sparkles className="h-3 w-3" />
                    <span>Try 1-Click Demo Google Account</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Divider */}
        <div className="relative my-4 flex items-center justify-center">
          <div className="w-full border-t border-[#E5E8E3]" />
          <span className="absolute bg-[#FFFFFF] px-2 text-[10px] font-semibold tracking-wider text-[#94A3B8] uppercase">
            or continue with username
          </span>
        </div>

        {/* Error message display */}
        {errorMsg && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-[#E76B72]/40 bg-[#E76B72]/10 px-3 py-2.5 text-[12px] text-[#B91C1C]">
            <AlertCircle className="h-4 w-4 shrink-0 text-[#E76B72]" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Main Credentials Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === 'register' && (
            <div>
              <label
                htmlFor="register-fullname"
                className="mb-1 block text-[12px] font-medium text-[#172131]"
              >
                Full Name
              </label>
              <input
                id="register-fullname"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Jordan Miller"
                className="rally-focus h-10 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-3 text-[13px] text-[#172131] placeholder-[#94A3B8]"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="auth-username"
              className="mb-1 block text-[12px] font-medium text-[#172131]"
            >
              Username {mode === 'login' ? 'or Email' : ''}
            </label>
            <input
              id="auth-username"
              type="text"
              required
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={
                mode === 'login' ? 'Enter username or email' : 'e.g. jordan_m'
              }
              className="rally-focus h-10 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-3 text-[13px] text-[#172131] placeholder-[#94A3B8]"
            />
            {mode === 'register' && (
              <p className="mt-1 text-[11px] text-[#64748B]">
                Letters, numbers, dots, underscores, or hyphens.
              </p>
            )}
          </div>

          {mode === 'register' && (
            <div>
              <label
                htmlFor="register-email"
                className="mb-1 block text-[12px] font-medium text-[#172131]"
              >
                Email Address{' '}
                <span className="text-[11px] font-normal text-[#94A3B8]">
                  (Optional)
                </span>
              </label>
              <input
                id="register-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jordan@example.com"
                className="rally-focus h-10 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] px-3 text-[13px] text-[#172131] placeholder-[#94A3B8]"
              />
            </div>
          )}

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label
                htmlFor="auth-password"
                className="text-[12px] font-medium text-[#172131]"
              >
                Password
              </label>
              {mode === 'register' && (
                <span className="text-[11px] text-[#94A3B8]">
                  Min. 6 characters
                </span>
              )}
            </div>
            <div className="relative">
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete={
                  mode === 'login' ? 'current-password' : 'new-password'
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="rally-focus h-10 w-full rounded-lg border border-[#E5E8E3] bg-[#FFFFFF] pr-9 pl-3 text-[13px] text-[#172131] placeholder-[#94A3B8]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute top-1/2 right-2.5 -translate-y-1/2 text-[#64748B] hover:text-[#172131]"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || googleLoading}
            className="mt-2 h-10 w-full cursor-pointer rounded-lg bg-[#172131] text-[13px] font-semibold text-[#FFFFFF] transition-colors hover:bg-[#253247] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting
              ? mode === 'login'
                ? 'Signing in...'
                : 'Creating Administrator account...'
              : mode === 'login'
                ? 'Sign in'
                : 'Create Administrator Account'}
          </button>
        </form>

        {/* Bottom Toggle switch */}
        <div className="mt-4 text-center">
          {mode === 'login' ? (
            <p className="text-[12px] text-[#64748B]">
              Don&apos;t have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('register')
                  setErrorMsg('')
                  setProviderNotice(null)
                }}
                className="cursor-pointer font-semibold text-[#172131] hover:underline"
              >
                Create Administrator account
              </button>
            </p>
          ) : (
            <p className="text-[12px] text-[#64748B]">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('login')
                  setErrorMsg('')
                  setProviderNotice(null)
                }}
                className="cursor-pointer font-semibold text-[#172131] hover:underline"
              >
                Sign in here
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
