import { Monitor, Moon, Sun } from 'lucide-react'
import { useSettings } from '../contexts/SettingsContext'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'

export function SettingsView() {
  const { settings, updateSettings } = useSettings()

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold mb-2">設定</h1>
          <p className="text-muted-foreground">アプリケーションの外観と動作をカスタマイズします</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>外観</CardTitle>
            <CardDescription>テーマとカラーモードの設定</CardDescription>
          </CardHeader>
          <CardContent>
            <div>
              <h3 className="text-sm font-medium mb-3">テーマ</h3>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant={settings.theme === 'light' ? 'default' : 'outline'}
                  className="w-full"
                  onClick={() => updateSettings({ theme: 'light' })}
                >
                  <Sun className="h-4 w-4 mr-2" />
                  ライト
                </Button>
                <Button
                  variant={settings.theme === 'dark' ? 'default' : 'outline'}
                  className="w-full"
                  onClick={() => updateSettings({ theme: 'dark' })}
                >
                  <Moon className="h-4 w-4 mr-2" />
                  ダーク
                </Button>
                <Button
                  variant={settings.theme === 'system' ? 'default' : 'outline'}
                  className="w-full"
                  onClick={() => updateSettings({ theme: 'system' })}
                >
                  <Monitor className="h-4 w-4 mr-2" />
                  システム
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                システム設定を選択すると、OSの設定に従ってテーマが自動的に切り替わります
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>今後の設定項目</CardTitle>
            <CardDescription>以下の設定項目が追加される予定です</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• フォントサイズとフォントファミリー</li>
              <li>• エディターのテーマとハイライト設定</li>
              <li>• キーボードショートカットのカスタマイズ</li>
              <li>• 言語と地域の設定</li>
              <li>• 通知設定</li>
              <li>• データのエクスポート/インポート</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
