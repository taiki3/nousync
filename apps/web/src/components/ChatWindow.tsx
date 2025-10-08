import type { AIModel, Document } from '@nousync/shared'
import {
  AlertCircle,
  Bot,
  ChevronDown,
  ChevronUp,
  FileText,
  FlaskConical,
  Loader2,
  RotateCcw,
  Send,
  Sparkles,
  User,
} from 'lucide-react'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { ApiError, chatApi, documentsApi, type Message } from '../services/api'
import { getDocumentTitle } from '../utils/markdown'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Textarea } from './ui/textarea'

interface ChatWindowProps {
  documents: Document[]
}

// メッセージ表示用のメモ化されたコンポーネント
const MessageItem = memo(
  ({ message, contextDocuments }: { message: Message; contextDocuments: Document[] }) => {
    return (
      <div>
        <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
          <div
            className={`flex gap-3 max-w-[80%] ${
              message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
            }`}
          >
            <div
              className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
              }`}
            >
              {message.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
            </div>
            <div
              className={`px-4 py-2 rounded-lg ${
                message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
            </div>
          </div>
        </div>

        {message.role === 'assistant' && contextDocuments.length > 0 && (
          <div className="mt-2 ml-11 flex flex-wrap gap-1">
            {contextDocuments.map((doc) => (
              <Badge
                key={doc.id}
                variant="outline"
                className="text-xs max-w-[150px]"
                title={doc.title}
              >
                <FileText className="h-3 w-3 mr-1 flex-shrink-0" />
                <span className="truncate">{doc.title}</span>
              </Badge>
            ))}
          </div>
        )}
      </div>
    )
  },
)

MessageItem.displayName = 'MessageItem'

export default function ChatWindow({ documents }: ChatWindowProps) {
  const { authenticated, handleAuthError, apiClientReady } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [conversationId, setConversationId] = useState<number | null>(null)
  const [useDocumentContext, setUseDocumentContext] = useState(false)
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([])
  const [isDocumentSelectionOpen, setIsDocumentSelectionOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showResearchDialog, setShowResearchDialog] = useState(false)
  const [researchTopic, setResearchTopic] = useState('')
  const [researchDepth, setResearchDepth] = useState<'shallow' | 'medium' | 'deep'>('medium')
  const [isGenerating, setIsGenerating] = useState(false)
  const [availableModels, setAvailableModels] = useState<AIModel[]>([])
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [researchModel, setResearchModel] = useState<string>('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  })

  const handleClearChat = async () => {
    // 確認ダイアログを表示
    if (messages.length > 0 && !confirm('会話履歴をクリアしますか？この操作は取り消せません。')) {
      return
    }

    // メッセージをクリア
    setMessages([])
    // 会話IDをリセット（新しい会話を開始）
    setConversationId(null)
    // エラーをクリア
    setError(null)

    try {
      await chatApi.clearHistory()
    } catch (_error) {
      // Ignore error
    }
  }

  const fetchAvailableModels = useCallback(async () => {
    try {
      // APIからモデル一覧を取得
      const models = await chatApi.getModels()
      setAvailableModels(models)

      // デフォルトモデルを設定（バックエンドから返ってきた最初のモデル）
      if (models.length > 0 && !selectedModel) {
        setSelectedModel(models[0].modelId)
      }

      // Research用のデフォルトモデルを設定（Geminiモデルのみ）
      const geminiModels = models.filter((m) => m.modelId.startsWith('gemini-'))
      if (geminiModels.length > 0 && !researchModel) {
        setResearchModel(geminiModels[0].modelId)
      }
    } catch (_error) {
      setError('モデル一覧を取得できませんでした。')
      setAvailableModels([])
    }
  }, [selectedModel, researchModel])

  // 利用可能なモデルを取得
  useEffect(() => {
    if (authenticated && apiClientReady) {
      fetchAvailableModels()
    }
  }, [authenticated, apiClientReady, fetchAvailableModels])

  // Helper function to handle API errors
  const handleApiError = (error: unknown) => {
    if (error instanceof ApiError) {
      if (error.isAuthError) {
        handleAuthError({ status: 401 })
      } else {
        setError(error.message || 'APIエラーが発生しました')
      }
    } else {
      setError('サーバーへの接続に失敗しました')
    }
  }

  const createConversation = async (): Promise<number | null> => {
    if (!authenticated) {
      setError('認証が必要です')
      return null
    }

    try {
      const id = await chatApi.createConversation('New Conversation')
      setConversationId(id)
      return id
    } catch (error) {
      if (
        error instanceof Error &&
        'response' in error &&
        (error as unknown & { response?: { status?: number } }).response?.status === 401
      ) {
        handleAuthError({ status: 401 })
      } else {
        setError((error as Error).message || 'Failed to create conversation')
      }
      return null
    }
  }

  const handleSend = async () => {
    if (!input.trim()) return

    if (!authenticated) {
      setError('認証が必要です')
      return
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: Date.now(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsLoading(true)
    setError(null)

    // コンテキストドキュメントを取得（選択されたドキュメント）
    let contextDocuments: Document[] = []
    if (useDocumentContext && selectedDocumentIds.length > 0) {
      contextDocuments = documents.filter(doc => selectedDocumentIds.includes(doc.id))
    }

    try {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      }

      // ストリーミング対応
      const abortController = new AbortController()

      // Create conversation if needed
      let currentConversationId = conversationId
      if (!currentConversationId) {
        currentConversationId = await createConversation()
        if (!currentConversationId) {
          setIsLoading(false)
          return
        }
      }

      const enableStreaming = true // ストリーミングの有効/無効を制御
      let isStreamingStarted = false

      const response = await chatApi.sendMessage(
        {
          conversationId: currentConversationId,
          messages: messages.concat(userMessage).map((m) => ({
            role: m.role,
            content: m.content,
          })),
          contextDocuments,
          stream: enableStreaming,
          model: selectedModel || undefined,
        },
        enableStreaming ? (chunk: string) => {
          // ストリーミングコールバック
          isStreamingStarted = true
          setMessages((prev) => {
            const newMessages = [...prev]
            const lastMessage = newMessages[newMessages.length - 1]
            if (lastMessage && lastMessage.role === 'assistant') {
              // 既存のアシスタントメッセージに追加
              lastMessage.content += chunk
            } else {
              // 新しいアシスタントメッセージを作成
              newMessages.push({
                ...assistantMessage,
                content: chunk
              })
            }
            return newMessages
          })
        } : undefined,
        abortController.signal
      )

      // ストリーミングが使われなかった場合のみメッセージを追加
      if (!isStreamingStarted) {
        assistantMessage.content = response.content
        setMessages((prev) => [...prev, assistantMessage])
      }

      // 最終的なメッセージを更新
      if (contextDocuments.length > 0) {
        assistantMessage.contextDocuments = contextDocuments
      }
    } catch (error) {
      handleApiError(error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleGenerateResearch = async () => {
    if (!researchTopic.trim()) return

    if (!authenticated) {
      setError('認証が必要です')
      return
    }

    setIsGenerating(true)
    setError(null)

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 300000) // 5分

      // Create conversation if needed
      let currentConversationId = conversationId
      if (!currentConversationId) {
        currentConversationId = await createConversation()
        if (!currentConversationId) {
          setIsGenerating(false)
          return
        }
      }

      const result = await chatApi.research(
        {
          conversationId: currentConversationId,
          topic: researchTopic,
          existingDocuments: documents.map((d) => d.id),
          depth: researchDepth,
          modelId: researchModel,
        },
        controller.signal,
      )

      clearTimeout(timeoutId)

      // 成功メッセージを表示
      const successMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: result.summary,
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, successMessage])
      setShowResearchDialog(false)
      setResearchTopic('')

      // ドキュメントリストを更新するイベントを発行
      window.dispatchEvent(new CustomEvent('documentCreated'))
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setError('リサーチ生成がタイムアウトしました。トピックを簡潔にして再試行してください。')
      } else {
        handleApiError(error)
      }
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">AIチャット</h2>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearChat}
              disabled={messages.length === 0}
              title="会話履歴をクリア"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowResearchDialog(true)}>
              <FlaskConical className="h-4 w-4 mr-2" />
              Research
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-between mt-1">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {documents.length}個のドキュメント
            </Badge>
          </div>
          {availableModels.length > 0 ? (
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger className="w-[200px] h-7 text-xs">
                <SelectValue placeholder="モデルを選択" />
              </SelectTrigger>
              <SelectContent>
                {availableModels.map((model) => (
                  <SelectItem key={model.modelId} value={model.modelId}>
                    {model.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-xs text-muted-foreground">モデル一覧を取得できません</span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pr-2">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <Bot className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">質問を入力してください</p>
            <p className="text-xs text-muted-foreground mt-1">
              ドキュメントの内容に基づいて回答します
            </p>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          {messages.map((message) => {
            const contextDocs = message.contextDocuments || []

            return <MessageItem key={message.id} message={message} contextDocuments={contextDocs} />
          })}

          {isLoading && (
            <div className="flex justify-start">
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="px-4 py-2 rounded-lg bg-muted">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            </div>
          )}
        </div>

        <div ref={messagesEndRef} />
      </div>

      <div className="border-t p-4 flex-shrink-0">
        {/* ドキュメントコンテキストオプション */}
        {documents.length > 0 && (
          <div className="mb-4 space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="use-document-context"
                checked={useDocumentContext}
                onChange={(e) => {
                  setUseDocumentContext(e.target.checked)
                  if (e.target.checked) {
                    setIsDocumentSelectionOpen(true)
                  }
                }}
                className="rounded"
              />
              <label htmlFor="use-document-context" className="text-sm font-medium">
                ドキュメントの全文をコンテキストとして使用
              </label>
            </div>

            {useDocumentContext && (
              <div className="ml-6 space-y-2">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setIsDocumentSelectionOpen(!isDocumentSelectionOpen)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {isDocumentSelectionOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    <span>参照するドキュメントを選択 ({selectedDocumentIds.length}/{documents.length})</span>
                  </button>

                  <button
                    onClick={() => {
                      if (selectedDocumentIds.length === documents.length) {
                        setSelectedDocumentIds([])
                      } else {
                        setSelectedDocumentIds(documents.map(d => d.id))
                      }
                    }}
                    className="text-xs text-primary hover:text-primary/80 transition-colors"
                  >
                    {selectedDocumentIds.length === documents.length ? 'すべて解除' : 'すべて選択'}
                  </button>
                </div>

                {isDocumentSelectionOpen && (
                  <div className="max-h-32 overflow-y-auto space-y-1 border rounded p-2 animate-in slide-in-from-top-1">
                    {documents.map((doc) => (
                      <label key={doc.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 p-1 rounded">
                        <input
                          type="checkbox"
                          checked={selectedDocumentIds.includes(doc.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedDocumentIds(prev => [...prev, doc.id])
                            } else {
                              setSelectedDocumentIds(prev => prev.filter(id => id !== doc.id))
                            }
                          }}
                          className="rounded"
                        />
                        <span className="truncate">{getDocumentTitle(doc)}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="メッセージを入力..."
            className="min-h-[60px] resize-none"
            rows={2}
            disabled={isLoading}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isLoading || availableModels.length === 0}
            size="icon"
            className="h-[60px] w-[60px]"
            data-testid="send-message-button"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Research Dialog */}
      {showResearchDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">Deep Web Research</h3>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              指定したトピックについてWeb検索を行い、複数の情報源から総合的な研究ドキュメントを生成します。
              {messages.length > 0 && ' 会話の文脈も考慮されます。'}
            </p>

            <div className="space-y-4">
              <div>
                <div className="text-sm font-medium mb-1">研究トピック</div>
                <Textarea
                  value={researchTopic}
                  onChange={(e) => setResearchTopic(e.target.value)}
                  placeholder="例: 最新のAI技術動向、React 19の新機能"
                  className="min-h-[80px]"
                />
              </div>

              <div>
                <div className="text-sm font-medium mb-1">研究の深さ</div>
                <div className="flex gap-2">
                  {(['shallow', 'medium', 'deep'] as const).map((depth) => (
                    <Button
                      key={depth}
                      variant={researchDepth === depth ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setResearchDepth(depth)}
                    >
                      {depth === 'shallow' ? '簡潔' : depth === 'medium' ? '標準' : '詳細'}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-sm font-medium mb-1">AIモデル (Geminiのみ対応)</div>
                {availableModels.filter((model) => model.modelId.startsWith('gemini-')).length >
                0 ? (
                  <Select value={researchModel} onValueChange={setResearchModel}>
                    <SelectTrigger>
                      <SelectValue placeholder="モデルを選択" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableModels
                        .filter((model) => model.modelId.startsWith('gemini-'))
                        .map((model) => (
                          <SelectItem key={model.modelId} value={model.modelId}>
                            {model.displayName}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm text-muted-foreground p-2 border rounded">
                    Geminiモデルが利用できません
                  </p>
                )}
              </div>
            </div>

            {error && (
              <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <div className="flex gap-2 mt-6">
              <Button
                variant="outline"
                onClick={() => {
                  setShowResearchDialog(false)
                  setResearchTopic('')
                  setError(null)
                }}
                disabled={isGenerating}
              >
                キャンセル
              </Button>
              <Button
                onClick={handleGenerateResearch}
                disabled={!researchTopic.trim() || isGenerating || availableModels.length === 0}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    生成中...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    生成
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
