import type { Document } from '@nousync/shared'
import { FileText, Globe, Plus, Tag } from 'lucide-react'
import { useState } from 'react'
import { useApiCall } from '../hooks'
import { documentsApi } from '../services/api'
import { UserMenu } from './UserMenu'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { WebClipperModal } from './WebClipperModal'

interface FileExplorerProps {
  documents: Document[] | undefined
  selectedDocument: Document | null
  onDocumentSelect: (doc: Document) => void
  onDocumentCreate: (doc: Document) => void
  showTokenModalOnAuth?: boolean
  newDocumentIds?: Set<string>
  onSettingsClick?: () => void
  onTokenClick?: () => void
}

export default function FileExplorer({
  documents,
  selectedDocument,
  onDocumentSelect,
  onDocumentCreate,
  showTokenModalOnAuth = false,
  newDocumentIds = new Set(),
  onSettingsClick,
  onTokenClick,
}: FileExplorerProps) {
  const [showWebClipperModal, setShowWebClipperModal] = useState(false)
  const { execute: executeApi } = useApiCall({ showErrorAlert: false })

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const document = await executeApi(() => documentsApi.upload(file))
    if (document) {
      onDocumentCreate(document as Document)
    }
  }

  const createNewDocument = async () => {
    const newDoc = {
      title: '新しいドキュメント',
      content: '# 新しいドキュメント\n\nここに内容を入力してください。',
      summary: '新しいドキュメントが作成されました。',
      tags: ['新規'],
    }

    const document = await executeApi(() => documentsApi.create(newDoc))
    if (document) {
      onDocumentCreate(document as Document)
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <UserMenu
        showTokenModalOnAuth={showTokenModalOnAuth}
        onSettingsClick={onSettingsClick}
        onTokenClick={onTokenClick}
      />
      <div className="p-4 border-b flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">ドキュメント</h2>
          <div className="flex gap-2">
            <Button onClick={createNewDocument} size="icon" variant="ghost" title="新規作成">
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              onClick={() => setShowWebClipperModal(true)}
              size="icon"
              variant="ghost"
              title="Webクリッパー"
            >
              <Globe className="h-4 w-4" />
            </Button>
            <label>
              <Button size="icon" variant="ghost" asChild>
                <span>
                  <FileText className="h-4 w-4" />
                  <input
                    type="file"
                    accept=".txt,.md,.markdown,.pdf,.json,.csv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </span>
              </Button>
            </label>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{(documents || []).length}個のドキュメント</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {newDocumentIds.size > 0 && (
          <div className="mx-4 mt-2 p-2 bg-primary/10 text-primary text-sm text-center rounded-md animate-pulse">
            {newDocumentIds.size}件の新しいドキュメントが追加されました
          </div>
        )}
        <div className="space-y-3 p-4 pr-2">
          {(documents || []).map((doc) => (
            <Card
              key={doc.id}
              onClick={() => onDocumentSelect(doc)}
              className={`cursor-pointer transition-all hover:shadow-md relative overflow-hidden ${
                selectedDocument?.id === doc.id
                  ? 'bg-primary/5 border-primary'
                  : 'hover:bg-accent/50'
              } ${
                newDocumentIds.has(doc.id) ? 'animate-pulse bg-primary/10 border-primary/50' : ''
              }`}
            >
              <CardHeader className="pb-3">
                <CardTitle className="text-base truncate pr-2" title={doc.title}>
                  {doc.title}
                </CardTitle>
                <CardDescription className="line-clamp-2" title={doc.summary || undefined}>
                  {doc.summary}
                </CardDescription>
              </CardHeader>
              {doc.tags && doc.tags.length > 0 && (
                <CardContent className="pt-0">
                  <div className="flex flex-wrap gap-1">
                    {doc.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        <Tag className="mr-1 h-3 w-3" />
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>

        {(!documents || documents.length === 0) && (
          <div className="text-center py-8">
            <FileText className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">ドキュメントがありません</p>
            <p className="text-xs text-muted-foreground mt-1">
              新規作成またはファイルをアップロードしてください
            </p>
          </div>
        )}
      </div>

      <WebClipperModal open={showWebClipperModal} onClose={() => setShowWebClipperModal(false)} />
    </div>
  )
}
