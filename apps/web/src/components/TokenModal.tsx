import { Copy, Key } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'

interface TokenModalProps {
  open: boolean
  onClose: () => void
}

export function TokenModal({ open, onClose }: TokenModalProps) {
  const { token } = useAuth()

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            拡張機能用認証トークン
          </DialogTitle>
          <DialogDescription>
            このトークンをWeb Clipper拡張機能の設定画面にコピーしてください
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-muted p-3 rounded-lg">
            <textarea
              readOnly
              value={token || 'トークンが見つかりません'}
              className="w-full text-xs font-mono bg-transparent border-0 resize-none focus:outline-none"
              rows={4}
              onClick={(e) => e.currentTarget.select()}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              閉じる
            </Button>
            <Button disabled={true} title="手動でテキストを選択してコピーしてください">
              <Copy className="mr-2 h-4 w-4" />
              トークンをコピー（無効）
            </Button>
          </div>

          <div className="text-sm text-muted-foreground space-y-2">
            <p className="font-medium">使用手順：</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>上のテキストエリアをクリックして全選択</li>
              <li>Ctrl+C（またはCmd+C）でコピー</li>
              <li>拡張機能の設定画面に戻る</li>
              <li>「認証トークン」欄に貼り付け</li>
              <li>「トークンを保存」をクリック</li>
            </ol>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
