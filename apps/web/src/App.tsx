import type { Document } from '@nousync/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AuthGuard } from './components/AuthGuard'
import ChatWindow from './components/ChatWindow'
import CollaborativeTextEditor from './components/CollaborativeTextEditor'
import FileExplorer from './components/FileExplorer'
import { ResizableLayout } from './components/ResizableLayout'
import { SettingsView } from './components/SettingsView'
import { useAuth } from './contexts/AuthContext'
import { SettingsProvider } from './contexts/SettingsContext'
import { useLocalStorage } from './hooks'
import { ApiError, documentsApi } from './services/api'
import { destroyDocumentPersistence } from './lib/yjs-supabase-provider'

function App() {
  const { authenticated, token, apiClientReady } = useAuth()
  const [documents, setDocuments] = useState<Document[]>([])
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null)
  const [loading, setLoading] = useState(true)
  const [showTokenModalOnAuth, setShowTokenModalOnAuth] = useLocalStorage(
    'nousync-show-token-modal',
    false,
  )
  const [newDocumentIds, setNewDocumentIds] = useState<Set<string>>(new Set())
  const [showSettings, setShowSettings] = useState(false)
  const lastFetchTimeRef = useRef<number>(Date.now())
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Check URL parameters on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)

    // Check URL parameter first
    if (params.get('showToken') === 'true') {
      setShowTokenModalOnAuth(true)
      // Save to localStorage for after auth redirect
      localStorage.setItem('nousync-show-token-modal', 'true')
      // Remove the parameter from URL without reloading
      const url = new URL(window.location.href)
      url.searchParams.delete('showToken')
      window.history.replaceState({}, '', url)
    } else {
      // Check localStorage (for after auth redirect)
      const savedShowToken = localStorage.getItem('nousync-show-token-modal')
      if (savedShowToken === 'true') {
        setShowTokenModalOnAuth(true)
        // Clear the flag
        localStorage.removeItem('nousync-show-token-modal')
      }
    }
  }, [setShowTokenModalOnAuth])

  const fetchDocuments = useCallback(
    async (checkForNew = false) => {
      if (!apiClientReady) {
        return
      }

      try {
        const documentsArray = await documentsApi.getAll()

        // Check for new documents if this is not the initial load
        if (checkForNew) {
          setDocuments((prevDocs) => {
            if (prevDocs.length > 0) {
              const existingIds = new Set(prevDocs.map((doc: Document) => doc.id))
              const newDocs = documentsArray.filter((doc: Document) => !existingIds.has(doc.id))

              if (newDocs.length > 0) {
                // Add new document IDs to highlight them
                const newIds = new Set<string>(newDocs.map((doc: Document) => doc.id))
                setNewDocumentIds(newIds)

                // Clear the highlight after 5 seconds
                setTimeout(() => {
                  setNewDocumentIds(new Set())
                }, 5000)
              }
            }
            return documentsArray
          })
        } else {
          setDocuments(documentsArray)
        }

        lastFetchTimeRef.current = Date.now()
      } catch (_error) {
      } finally {
        setLoading(false)
      }
    },
    [apiClientReady],
  )

  // Initial load effect
  useEffect(() => {
    if (authenticated && token && apiClientReady) {
      fetchDocuments()
    } else if (!authenticated) {
      setLoading(false)
    }
  }, [authenticated, token, apiClientReady, fetchDocuments])

  useEffect(() => {
    // カスタムイベントをリッスンしてドキュメントリストを更新
    const handleDocumentCreated = () => {
      if (authenticated && token && apiClientReady) {
        fetchDocuments(true)
      }
    }

    window.addEventListener('documentCreated', handleDocumentCreated)
    return () => {
      window.removeEventListener('documentCreated', handleDocumentCreated)
    }
  }, [authenticated, token, apiClientReady, fetchDocuments])

  // Polling mechanism for auto-refresh
  useEffect(() => {
    if (!authenticated || !token || !apiClientReady) return

    // Set up polling interval (30 seconds)
    const startPolling = () => {
      pollingIntervalRef.current = setInterval(() => {
        // Only poll if the tab is visible
        if (!document.hidden) {
          fetchDocuments(true)
        }
      }, 30000) // 30 seconds
    }

    startPolling()

    // Clean up on unmount or auth change
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
      }
    }
  }, [authenticated, token, apiClientReady, fetchDocuments])

  // Refresh on window focus
  useEffect(() => {
    if (!authenticated || !token || !apiClientReady) return

    const handleFocus = () => {
      // Only fetch if it's been more than 5 seconds since last fetch
      const timeSinceLastFetch = Date.now() - lastFetchTimeRef.current
      if (timeSinceLastFetch > 5000) {
        fetchDocuments(true)
      }
    }

    window.addEventListener('focus', handleFocus)

    // Also listen for visibility change
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        const timeSinceLastFetch = Date.now() - lastFetchTimeRef.current
        if (timeSinceLastFetch > 5000) {
          fetchDocuments(true)
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [authenticated, token, apiClientReady, fetchDocuments])

  const handleDocumentSelect = (doc: Document) => {
    setSelectedDocument(doc)
    setShowSettings(false)
  }

  const handleDocumentUpdate = async (id: string, content: string, tags?: string[]) => {
    // ローカルステートを即座に更新（UI応答性向上）
    const updateData = tags !== undefined ? { content, tags } : { content }
    setDocuments((docs) => docs.map((doc) => (doc.id === id ? { ...doc, ...updateData } : doc)))
    if (selectedDocument?.id === id) {
      setSelectedDocument((prev) => (prev ? { ...prev, ...updateData } : null))
    }

    // DBに保存
    try {
      const updatedDoc = await documentsApi.update(id, updateData)

      // サーバーから返されたドキュメント（タイトルが更新されている可能性がある）で更新
      setDocuments((docs) => docs.map((doc) => (doc.id === id ? updatedDoc : doc)))
      if (selectedDocument?.id === id) {
        setSelectedDocument(updatedDoc)
      }
    } catch (error) {
      if (error instanceof ApiError) {
      } else {
      }
    }
  }

  const handleDocumentCreate = (doc: Document | { data: Document }) => {
    // FileExplorerで既にAPIを呼び出しているので、ここではステートの更新のみ
    // docがdata propertyを持っている場合（API responseの場合）、dataを取り出す
    const newDoc = 'data' in doc ? doc.data : doc
    // tagsが確実に配列になるようにする
    const safeDoc = {
      ...newDoc,
      tags: newDoc.tags || [],
    }
    setDocuments((docs) => [...docs, safeDoc])
    setSelectedDocument(safeDoc)
  }

  const handleDocumentDelete = async (id: string) => {
    try {
      await documentsApi.delete(id)
      // ローカルIndexedDBに残ったオフラインデータを削除
      await destroyDocumentPersistence(id)

      // ローカルステートから削除
      setDocuments((docs) => docs.filter((doc) => doc.id !== id))

      // 削除されたドキュメントが選択されていた場合は選択を解除
      if (selectedDocument?.id === id) {
        setSelectedDocument(null)
      }
    } catch (error) {
      if (error instanceof ApiError) {
        alert('ドキュメントの削除に失敗しました')
      } else {
        alert('ドキュメントの削除中にエラーが発生しました')
      }
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
          <p className="mt-4 text-muted-foreground">読み込み中...</p>
        </div>
      </div>
    )
  }

  return (
    <SettingsProvider>
      <AuthGuard>
        <ResizableLayout
          leftPanel={
            <FileExplorer
              documents={documents}
              selectedDocument={selectedDocument}
              onDocumentSelect={handleDocumentSelect}
              onDocumentCreate={handleDocumentCreate}
              showTokenModalOnAuth={showTokenModalOnAuth}
              newDocumentIds={newDocumentIds}
              onSettingsClick={() => setShowSettings(true)}
            />
          }
          centerPanel={
            showSettings ? (
              <SettingsView />
            ) : (
              <CollaborativeTextEditor
                document={selectedDocument}
                onDocumentUpdate={handleDocumentUpdate}
                onDocumentDelete={handleDocumentDelete}
              />
            )
          }
          rightPanel={<ChatWindow documents={documents} />}
        />
      </AuthGuard>
    </SettingsProvider>
  )
}

export default App
