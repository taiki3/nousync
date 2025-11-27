import JSZip from 'jszip'
import { Download, Globe } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'

interface WebClipperModalProps {
  open: boolean
  onClose: () => void
}

const extensionFiles = [
  { path: 'manifest.json', binary: false, required: true },
  { path: 'popup.html', binary: false, required: true },
  { path: 'popup.js', binary: false, required: true },
  { path: 'content.js', binary: false, required: true },
  { path: 'background.js', binary: false, required: true },
  { path: 'options.html', binary: false, required: true },
  { path: 'options.js', binary: false, required: true },
  { path: 'shared.js', binary: false, injectEnv: true, required: true },
  { path: 'jszip.min.js', binary: false, required: true },
  { path: 'supabase.js', binary: false, required: true },
  { path: 'README.md', binary: false, required: false },
  { path: 'icons/icon-16.png', binary: true, required: true },
  { path: 'icons/icon-32.png', binary: true, required: false },
  { path: 'icons/icon-128.png', binary: true, required: true },
]

export function WebClipperModal({ open, onClose }: WebClipperModalProps) {
  const [isDownloading, setIsDownloading] = useState(false)

  const baseUrl = useMemo(() => {
    const root = import.meta.env.BASE_URL || '/'
    return `${root}extensions/edge-clipper/`
  }, [])

  const resolvedApiBase = useMemo(() => {
    const apiBase = import.meta.env.VITE_API_URL || '/api'
    try {
      const url = new URL(apiBase, window.location.origin)
      return url.href.replace(/\/$/, '')
    } catch (_error) {
      return `${window.location.origin}${apiBase}`.replace(/\/$/, '')
    }
  }, [])

  const supabaseConfig = useMemo(() => {
    return {
      url: import.meta.env.VITE_SUPABASE_URL as string,
      anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    }
  }, [])

  const handleDownload = async () => {
    setIsDownloading(true)

    try {
      const zip = new JSZip()

      const missingFiles: string[] = []

      for (const file of extensionFiles) {
        const response = await fetch(`${baseUrl}${file.path}`)
        if (!response.ok) {
          if (file.required) {
            missingFiles.push(file.path)
          }
          continue
        }

        if (file.binary) {
          const buffer = await response.arrayBuffer()
          zip.file(file.path, buffer)
        } else {
          let content = await response.text()
          if (file.injectEnv) {
            content = content
              .replace(/__NOUSYNC_API_BASE__/g, resolvedApiBase)
              .replace(/__SUPABASE_URL__/g, supabaseConfig.url || '')
              .replace(/__SUPABASE_ANON_KEY__/g, supabaseConfig.anonKey || '')
          }
          zip.file(file.path, content)
        }
      }

      if (missingFiles.length > 0) {
        throw new Error(`必須ファイルが見つかりません: ${missingFiles.join(', ')}`)
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const url = window.URL.createObjectURL(zipBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'nousync-web-clipper.zip'
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      const message = error instanceof Error ? error.message : '拡張機能のダウンロードに失敗しました。'
      alert(message)
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Nousync Web Clipper
          </DialogTitle>
          <DialogDescription>
            Docling APIをブラウザから直接呼び出し、Supabase認証でNousyncのDocumentsに保存するEdge拡張機能です。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <h3 className="font-medium mb-2">必要な環境</h3>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Microsoft Edge (Chromium)</li>
              <li>• Docling APIへ到達できる社内ネットワーク</li>
            </ul>
          </div>

          <div>
            <h3 className="font-medium mb-2">インストール & ログイン手順</h3>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li>下のボタンからZIPをダウンロードして解凍</li>
              <li>Edgeで <code className="px-1 py-0.5 bg-muted rounded">edge://extensions/</code> を開き、「展開して読み込み」を実行</li>
              <li>拡張の設定ページ（オプション）でDocling/NousyncのURLやタグを入力</li>
              <li>同ページの「ログイン」ボタンからSupabase (GitHub) 認証を完了</li>
              <li>ポップアップで「現在のタブを保存」を押してNousyncへ送信</li>
            </ol>
          </div>

          <div className="pt-2">
            <Button onClick={handleDownload} disabled={isDownloading} className="w-full">
              <Download className="mr-2 h-4 w-4" />
              {isDownloading ? 'ダウンロード中...' : '拡張機能をダウンロード (ZIP)'}
            </Button>
          </div>

          <div className="text-sm text-muted-foreground">
            <p className="font-medium mb-1">補足</p>
            <ul className="space-y-1">
              <li>• ZIP内の <code className="px-1 py-0.5 bg-muted rounded">shared.js</code> には現在のAPIベースURL（{resolvedApiBase}）とSupabase設定を書き込み済みです</li>
              <li>• Docling通信はブラウザ↔イントラAPI間で完結し、Vercel/SupabaseからDoclingへ直接アクセスする必要はありません</li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
