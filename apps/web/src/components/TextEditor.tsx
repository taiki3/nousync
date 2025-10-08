import type { Document } from '@nousync/shared'
import { Edit3, Eye, Plus, Tag, Trash2, X } from 'lucide-react'
import { useEffect, useState, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Textarea } from './ui/textarea'

interface TextEditorProps {
  document: Document | null
  onDocumentUpdate: (id: string, content: string, tags?: string[]) => void
  onDocumentDelete?: (id: string) => void
}

export default function TextEditor({
  document,
  onDocumentUpdate,
  onDocumentDelete,
}: TextEditorProps) {
  const [content, setContent] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState('')
  const [isAddingTag, setIsAddingTag] = useState(false)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (document) {
      setContent(document.content)
      setTags(document.tags || [])
    }
  }, [document])

  // デバウンスされた更新関数
  const debouncedUpdate = useCallback((id: string, newContent: string) => {
    // 既存のタイマーをクリア
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    // 新しいタイマーをセット（500ms後に実行）
    debounceTimerRef.current = setTimeout(() => {
      onDocumentUpdate(id, newContent)
    }, 500)
  }, [onDocumentUpdate])

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value
    setContent(newContent)
    if (document) {
      debouncedUpdate(document.id, newContent)
    }
  }

  const handleAddTag = () => {
    if (newTag.trim() && document) {
      const updatedTags = [...tags, newTag.trim()]
      setTags(updatedTags)
      onDocumentUpdate(document.id, content, updatedTags)
      setNewTag('')
      setIsAddingTag(false)
    }
  }

  const handleRemoveTag = (tagToRemove: string) => {
    if (document) {
      const updatedTags = tags.filter((tag) => tag !== tagToRemove)
      setTags(updatedTags)
      onDocumentUpdate(document.id, content, updatedTags)
    }
  }

  const handleDeleteDocument = () => {
    if (document && onDocumentDelete) {
      if (
        window.confirm(
          `「${document.title}」を削除してもよろしいですか？\nこの操作は取り消せません。`,
        )
      ) {
        onDocumentDelete(document.id)
      }
    }
  }

  const handleTagKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddTag()
    } else if (e.key === 'Escape') {
      setIsAddingTag(false)
      setNewTag('')
    }
  }

  if (!document) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center">
          <Edit3 className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-3 text-muted-foreground">ドキュメントを選択してください</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      <div className="border-b px-4 py-3 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{document.title}</h2>
          {onDocumentDelete && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDeleteDocument}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              title="ドキュメントを削除"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs group">
              <Tag className="mr-1 h-3 w-3" />
              {tag}
              <button
                type="button"
                onClick={() => handleRemoveTag(tag)}
                className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label={`Remove tag ${tag}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {isAddingTag ? (
            <div className="flex items-center gap-1">
              <Input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={handleTagKeyPress}
                onBlur={() => {
                  if (!newTag.trim()) {
                    setIsAddingTag(false)
                  }
                }}
                placeholder="タグを入力..."
                className="h-7 w-32 text-xs"
                autoFocus
              />
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={handleAddTag}
                disabled={!newTag.trim()}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setIsAddingTag(true)}
            >
              <Plus className="h-3 w-3 mr-1" />
              タグを追加
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="edit" className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b px-4 flex-shrink-0">
          <TabsList className="h-9 bg-transparent p-0 border-b-0">
            <TabsTrigger
              value="edit"
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 pb-3 font-medium"
            >
              <Edit3 className="mr-2 h-4 w-4" />
              編集
            </TabsTrigger>
            <TabsTrigger
              value="preview"
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 pb-3 font-medium"
            >
              <Eye className="mr-2 h-4 w-4" />
              プレビュー
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="edit" className="flex-1 mt-0 overflow-hidden">
          <Textarea
            value={content}
            onChange={handleContentChange}
            className="h-full w-full resize-none border-0 rounded-none focus-visible:ring-0 font-mono text-sm p-6 overflow-auto"
            placeholder="マークダウンで入力..."
          />
        </TabsContent>

        <TabsContent value="preview" className="flex-1 mt-0 overflow-auto">
          <div className="prose prose-sm max-w-none p-6 dark:prose-invert">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
