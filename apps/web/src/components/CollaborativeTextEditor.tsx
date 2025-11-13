import type { Document } from '@nousync/shared'
import { Edit3, Eye, Plus, Tag, Trash2, X } from 'lucide-react'
import { useEffect, useState, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import * as Y from 'yjs'
import { SupabaseProvider } from '../lib/yjs-supabase-provider'
import { useAuth } from '../contexts/AuthContext'
import { getDocumentTitle } from '../utils/markdown'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Textarea } from './ui/textarea'

interface CollaborativeTextEditorProps {
  document: Document | null
  onDocumentUpdate: (id: string, content: string, tags?: string[]) => void
  onDocumentDelete?: (id: string) => void
}

export default function CollaborativeTextEditor({
  document,
  onDocumentUpdate,
  onDocumentDelete,
}: CollaborativeTextEditorProps) {
  const { supabase } = useAuth()
  const [content, setContent] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState('')
  const [isAddingTag, setIsAddingTag] = useState(false)
  const [isSynced, setIsSynced] = useState(false)

  // Y.js
  const ydocRef = useRef<Y.Doc | null>(null)
  const providerRef = useRef<SupabaseProvider | null>(null)
  const ytextRef = useRef<Y.Text | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isLocalChangeRef = useRef(false)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const currentDocumentIdRef = useRef<string | undefined>(undefined)

  // ドキュメントIDのみを依存配列に使用（documentオブジェクト全体だと毎回再初期化される）
  const documentId = document?.id

  // 現在のdocumentIdをrefで追跡（whenSyncedコールバックでの検証用）
  currentDocumentIdRef.current = documentId

  // ドキュメントが変更されたら Y.js を初期化
  useEffect(() => {
    if (!document || !supabase || !documentId) {
      // クリーンアップ
      if (providerRef.current) {
        providerRef.current.disconnect()
        providerRef.current = null
      }
      if (ydocRef.current) {
        ydocRef.current.destroy()
        ydocRef.current = null
      }
      return
    }

    // Y.js ドキュメントを作成
    const ydoc = new Y.Doc()
    ydocRef.current = ydoc

    // Y.Text を取得
    const ytext = ydoc.getText('content')
    ytextRef.current = ytext

    // Supabase プロバイダーとIndexedDB永続化を接続
    const provider = new SupabaseProvider(document.id, ydoc, supabase)
    providerRef.current = provider

    // IndexedDBの読み込みを待ってから初期コンテンツを設定
    // オフライン編集がある場合は重複を防ぐ
    provider.persistence?.whenSynced.then(() => {
      // ドキュメントが切り替わっていないか確認（古いコールバックの実行を防ぐ）
      // refの現在値と比較することで、最新のdocumentIdと照合
      if (currentDocumentIdRef.current !== documentId) return

      // IndexedDBにデータがない場合のみサーバーのコンテンツを設定
      if (ytext.length === 0 && document.content) {
        ytext.insert(0, document.content)
      }
      setContent(ytext.toString())
      setTags(document.tags || [])
    })

    // IndexedDB同期前でも表示はする
    setContent(ytext.toString())
    setTags(document.tags || [])

    // Y.Text の変更を監視してテキストエリアを更新
    const handleYTextChange = () => {
      const newContent = ytext.toString()

      if (!isLocalChangeRef.current) {
        // リモートからの変更: UIのみ更新
        setContent(newContent)
      } else {
        // ローカルの変更: UIを更新してバックエンドにも保存（デバウンス）
        setContent(newContent)

        // デバウンス処理でAPI呼び出しを削減
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current)
        }
        debounceTimerRef.current = setTimeout(() => {
          // タイマー実行時に最新のytext値を読み取る
          // リモート編集がマージされた後の値を保存するため
          onDocumentUpdate(document.id, ytext.toString())
        }, 500)
      }

      isLocalChangeRef.current = false
    }

    ytext.observe(handleYTextChange)

    // 同期状態を監視
    const checkSync = setInterval(() => {
      setIsSynced(provider.isSynced())
    }, 1000)

    // クリーンアップ
    return () => {
      clearInterval(checkSync)
      // Flush pending debounced save before cleanup
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
        // Save final changes immediately to prevent data loss
        onDocumentUpdate(document.id, ytext.toString())
      }
      ytext.unobserve(handleYTextChange)
      provider.disconnect()
      ydoc.destroy()
    }
    // documentIdのみに依存（documentオブジェクト全体だと毎回再初期化される）
  }, [documentId, supabase])

  // タグの同期: 同じドキュメントでもタグが更新された場合に反映
  useEffect(() => {
    if (document?.tags) {
      setTags(document.tags)
    }
  }, [document?.tags])

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value
    const ytext = ytextRef.current

    if (!ytext || !textareaRef.current) return

    // カーソル位置を保持
    const cursorPos = textareaRef.current.selectionStart
    const cursorEnd = textareaRef.current.selectionEnd

    // Y.Text を更新（ローカル変更フラグを立てる）
    isLocalChangeRef.current = true

    // 差分を計算して Y.Text に適用
    const oldContent = ytext.toString()
    const delta = calculateDelta(oldContent, newContent, cursorPos)

    if (delta.delete > 0) {
      ytext.delete(delta.start, delta.delete)
    }
    if (delta.insert) {
      ytext.insert(delta.start, delta.insert)
    }

    setContent(newContent)

    // カーソル位置を復元
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.setSelectionRange(cursorPos, cursorEnd)
      }
    }, 0)
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

  const handleDelete = () => {
    if (document && onDocumentDelete) {
      if (confirm('このドキュメントを削除しますか？')) {
        onDocumentDelete(document.id)
      }
    }
  }

  if (!document) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        ドキュメントを選択してください
      </div>
    )
  }

  const title = getDocumentTitle({ title: document.title, content })

  return (
    <div className="flex flex-col h-full">
      {/* ヘッダー */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          {!isSynced && (
            <span className="text-xs text-amber-600">同期中...</span>
          )}
          {isSynced && (
            <span className="text-xs text-green-600">同期済み</span>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={handleDelete}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* タグ */}
      <div className="flex flex-wrap gap-2 p-4 border-b">
        {tags.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1">
            <Tag className="h-3 w-3" />
            {tag}
            <button
              onClick={() => handleRemoveTag(tag)}
              className="ml-1 hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        {isAddingTag ? (
          <div className="flex gap-2">
            <Input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
              placeholder="タグを入力"
              className="w-32 h-7"
              autoFocus
            />
            <Button size="sm" onClick={handleAddTag}>
              追加
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setIsAddingTag(false)}>
              キャンセル
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsAddingTag(true)}
            className="h-7"
          >
            <Plus className="h-3 w-3 mr-1" />
            タグを追加
          </Button>
        )}
      </div>

      {/* エディタ */}
      <Tabs defaultValue="edit" className="flex-1 flex flex-col">
        <TabsList className="mx-4 mt-4">
          <TabsTrigger value="edit" className="gap-2">
            <Edit3 className="h-4 w-4" />
            編集
          </TabsTrigger>
          <TabsTrigger value="preview" className="gap-2">
            <Eye className="h-4 w-4" />
            プレビュー
          </TabsTrigger>
        </TabsList>

        <TabsContent value="edit" className="flex-1 m-0">
          <Textarea
            ref={textareaRef}
            value={content}
            onChange={handleContentChange}
            className="w-full h-full resize-none border-0 focus-visible:ring-0"
            placeholder="ここに入力..."
          />
        </TabsContent>

        <TabsContent value="preview" className="flex-1 m-0 p-4 overflow-auto">
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// 差分計算ヘルパー関数
function calculateDelta(
  oldText: string,
  newText: string,
  cursorPos: number
): { start: number; delete: number; insert: string } {
  // 簡易的な差分計算
  // カーソル位置を基準に変更を検出

  let start = 0
  let deleteCount = 0
  let insertText = ''

  // 前方から一致する部分を見つける
  while (start < oldText.length && start < newText.length && oldText[start] === newText[start]) {
    start++
  }

  // 後方から一致する部分を見つける
  let oldEnd = oldText.length
  let newEnd = newText.length
  while (
    oldEnd > start &&
    newEnd > start &&
    oldText[oldEnd - 1] === newText[newEnd - 1]
  ) {
    oldEnd--
    newEnd--
  }

  deleteCount = oldEnd - start
  insertText = newText.substring(start, newEnd)

  return { start, delete: deleteCount, insert: insertText }
}
