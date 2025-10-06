import JSZip from 'jszip'
import { Download, Globe } from 'lucide-react'
import { useState } from 'react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'

interface WebClipperModalProps {
  open: boolean
  onClose: () => void
}

export function WebClipperModal({ open, onClose }: WebClipperModalProps) {
  const [isDownloading, setIsDownloading] = useState(false)

  const handleDownload = async () => {
    setIsDownloading(true)

    try {
      // Create a new zip file
      const zip = new JSZip()

      // Fetch all extension files
      const files = [
        'manifest.json',
        'popup.html',
        'popup.js',
        'content.js',
        'background.js',
        'options.html',
        'options.js',
        'README.md',
      ]

      // Get base URL from Vite configuration
      const baseUrl = import.meta.env.BASE_URL || '/'

      // Fetch and add files to zip
      for (const file of files) {
        const url = `${baseUrl}extensions/edge-clipper/${file}`
        const response = await fetch(url)
        if (response.ok) {
          const content = await response.text()
          zip.file(file, content)
        }
      }

      // Add icon file in icons folder
      const iconUrl = `${baseUrl}extensions/edge-clipper/icons/icon.svg`
      const iconResponse = await fetch(iconUrl)
      if (iconResponse.ok) {
        const iconContent = await iconResponse.text()
        zip.file('icons/icon.svg', iconContent)
      }

      // Generate the zip file
      const zipBlob = await zip.generateAsync({ type: 'blob' })

      // Create download link
      const url = window.URL.createObjectURL(zipBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'nousync-web-clipper.zip'
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (_error) {
      alert('拡張機能のダウンロードに失敗しました。')
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Nousync Web Clipper
          </DialogTitle>
          <DialogDescription>
            ブラウザ拡張機能を使用して、Webページの記事をNousyncに保存できます。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <h3 className="font-medium mb-2">主な機能</h3>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Webページの本文を自動抽出</li>
              <li>• Markdown形式で保存</li>
              <li>• ヘッダー、フッター、広告を自動除去</li>
              <li>• ワンクリックでNousyncに保存</li>
            </ul>
          </div>

          <div>
            <h3 className="font-medium mb-2">対応ブラウザ</h3>
            <p className="text-sm text-muted-foreground">Microsoft Edge (Chromium版)</p>
          </div>

          <div className="pt-2">
            <Button onClick={handleDownload} disabled={isDownloading} className="w-full">
              <Download className="mr-2 h-4 w-4" />
              {isDownloading ? 'ダウンロード中...' : '拡張機能をダウンロード (ZIP)'}
            </Button>
          </div>

          <div className="border-t pt-4">
            <h3 className="font-medium mb-2">インストール手順</h3>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li>上のボタンからZIPファイルをダウンロード</li>
              <li>ZIPファイルを任意の場所に解凍</li>
              <li>Microsoft Edgeで拡張機能ページを開く</li>
              <li>開発者モードをオンにする</li>
              <li>「展開して読み込み」から解凍したフォルダを選択</li>
            </ol>
          </div>

          <div className="text-center text-sm text-muted-foreground">
            <p className="mb-2">拡張機能管理ページを開くには：</p>
            <code className="bg-muted px-2 py-1 rounded">edge://extensions/</code>
            <p className="mt-2">をアドレスバーにコピー＆ペーストしてください</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
