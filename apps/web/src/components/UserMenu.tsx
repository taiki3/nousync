import { LogOut, Settings, User } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Button } from './ui/button'

interface UserMenuProps {
  onSettingsClick?: () => void
}

export function UserMenu({ onSettingsClick }: UserMenuProps) {
  const { user, logout, authenticated } = useAuth()

  if (!authenticated || !user) {
    return null
  }

  const handleLogout = async () => {
    await logout()
  }

  return (
    <div className="flex items-center gap-2 p-4 border-b">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <User className="h-5 w-5 text-muted-foreground flex-shrink-0" />
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium truncate">{user.name || user.username}</span>
          {user.email && (
            <span className="text-xs text-muted-foreground truncate">{user.email}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={onSettingsClick}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title="設定"
        >
          <Settings className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleLogout}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title="ログアウト"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
