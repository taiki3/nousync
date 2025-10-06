import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Button } from './ui/button'

interface AuthGuardProps {
  children: React.ReactNode
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { authenticated, login } = useAuth()
  const [isInitializing, setIsInitializing] = useState(true)

  useEffect(() => {
    // Give Supabase time to initialize
    const timer = setTimeout(() => {
      setIsInitializing(false)
    }, 1000)

    return () => clearTimeout(timer)
  }, [])

  // Show loading while Supabase is initializing
  if (isInitializing) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
          <p className="mt-4 text-muted-foreground">認証を確認中...</p>
        </div>
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="mb-4 text-2xl font-bold">ログインが必要です</h1>
          <p className="mb-6 text-muted-foreground">
            このアプリケーションを使用するにはログインしてください
          </p>
          <Button onClick={login} size="lg">
            ログイン
          </Button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
