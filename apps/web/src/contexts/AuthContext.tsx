import { type Session, type SupabaseClient, type User } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { createApiClient } from '../services/api/client'

interface AuthContextType {
  authenticated: boolean
  user: {
    id?: string
    username?: string
    email?: string
    name?: string
  } | null
  login: () => void
  logout: () => void
  token?: string
  checkAndRefreshToken: () => Promise<boolean>
  handleAuthError: (error: { status: number }) => void
  apiClientReady: boolean
  supabase: SupabaseClient
}

const AuthContext = createContext<AuthContextType>({
  authenticated: false,
  user: null,
  login: () => {},
  logout: () => {},
  checkAndRefreshToken: async () => false,
  handleAuthError: () => {},
  apiClientReady: false,
  supabase,
})

export { AuthContext }

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: React.ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [authenticated, setAuthenticated] = useState(false)
  const [user, setUser] = useState<AuthContextType['user']>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [apiClientReady, setApiClientReady] = useState(false)

  // Convert Supabase User to our user format
  const convertUser = (supabaseUser: User | null): AuthContextType['user'] => {
    if (!supabaseUser) return null
    return {
      id: supabaseUser.id,
      username: supabaseUser.email?.split('@')[0],
      email: supabaseUser.email,
      name: supabaseUser.user_metadata?.name || supabaseUser.email?.split('@')[0],
    }
  }

  // Initialize auth state
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setAuthenticated(!!session)
      setUser(convertUser(session?.user || null))
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setAuthenticated(!!session)
      setUser(convertUser(session?.user || null))
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const login = async () => {
    // 現在のURLをそのまま使用（プレビューデプロイメントでも動作）
    const currentUrl = window.location.href.split('#')[0] // ハッシュを除去
    const redirectUrl = currentUrl.endsWith('/') ? currentUrl : currentUrl + '/'

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: redirectUrl,
      },
    })
    if (error) {
      alert(`ログインエラー: ${error.message}`)
    }
  }

  const logout = async () => {
    await supabase.auth.signOut()
    setSession(null)
    setAuthenticated(false)
    setUser(null)
  }

  const checkAndRefreshToken = useCallback(async (): Promise<boolean> => {
    try {
      const { data, error } = await supabase.auth.getSession()

      if (error || !data.session) {
        return false
      }

      // Supabase automatically refreshes the token if needed
      setSession(data.session)
      return true
    } catch (_error) {
      return false
    }
  }, [])

  const handleAuthError = useCallback(
    (error: { status: number }) => {
      if (error.status === 401) {
        setAuthenticated(false)
        setUser(null)
        setSession(null)
      }
    },
    [],
  )

  // Get token function for API client (synchronous version)
  const getToken = useCallback((): string | undefined => {
    // Supabaseはセッションをキャッシュしているので、同期的にアクセス可能
    // ただし、最新のセッション状態を使用
    return session?.access_token
  }, [session?.access_token])

  // Initialize API client when authentication state changes
  useEffect(() => {
    if (authenticated && session?.access_token) {
      createApiClient({
        checkAndRefreshToken,
        getToken,
        handleAuthError,
      })
      setApiClientReady(true)
    } else {
      setApiClientReady(false)
    }
  }, [authenticated, session?.access_token, checkAndRefreshToken, handleAuthError, getToken])

  return (
    <AuthContext.Provider
      value={{
        authenticated,
        user,
        login,
        logout,
        token: session?.access_token,
        checkAndRefreshToken,
        handleAuthError,
        apiClientReady,
        supabase,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
