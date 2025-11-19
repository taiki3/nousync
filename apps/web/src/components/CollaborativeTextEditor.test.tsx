import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CollaborativeTextEditor from './CollaborativeTextEditor'
import type { Document } from '@nousync/shared'

// SupabaseProviderのモック
vi.mock('../lib/yjs-supabase-provider', () => {
  class Deferred<T = void> {
    promise: Promise<T>
    resolve!: (value: T) => void
    constructor() {
      this.promise = new Promise<T>((res) => (this.resolve = res))
    }
  }

  // documentId ごとに Deferred を管理してテストの独立性を保つ
  const deferredMap = new Map<string, Deferred<void>>()
  const instances: any[] = []

  return {
    __esModule: true,
    SupabaseProvider: class MockSupabaseProvider {
      doc: any
      documentId: string
      disconnect = vi.fn()
      // シンプルな2段階同期状態
      _realtimeSynced = true
      _persistenceSynced = false
      destroyPersistence = vi.fn(async () => {})
      persistence: { whenSynced: Promise<void> }

      constructor(documentId: string, doc: any, supabase: any) {
        this.doc = doc
        this.documentId = documentId
        instances.push(this)

        // documentId ごとに Deferred を作成
        if (!deferredMap.has(documentId)) {
          deferredMap.set(documentId, new Deferred<void>())
        }
        const deferred = deferredMap.get(documentId)!

        this.persistence = {
          whenSynced: deferred.promise.then(() => {
            ;(this as any)._persistenceSynced = true
          }),
        }
      }
      isSynced = vi.fn(() => this._realtimeSynced)
      isRealtimeSynced = vi.fn(() => this._realtimeSynced)
      isPersistenceSynced = vi.fn(() => this._persistenceSynced)
    },
    // テスト用: whenSyncedを制御
    __testUtils: {
      resolveWhenSynced: (documentId?: string) => {
        if (documentId) {
          deferredMap.get(documentId)?.resolve()
        } else {
          // 後方互換性: documentId 未指定の場合は全て解決
          deferredMap.forEach((deferred) => deferred.resolve())
        }
      },
      clearDeferredMap: () => deferredMap.clear(),
    },
    __getLastInstance: () => instances[instances.length - 1],
  }
})

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    supabase: {
      channel: vi.fn(() => ({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn(),
        send: vi.fn(),
      })),
      removeChannel: vi.fn(),
    },
  }),
}))

describe('CollaborativeTextEditor - Basic Functionality', () => {
  let mockDocument: Document
  let mockOnUpdate: ReturnType<typeof vi.fn>
  let __testUtils: any

  beforeAll(async () => {
    const mod = await import('../lib/yjs-supabase-provider')
    __testUtils = (mod as any).__testUtils
  })

  beforeEach(() => {
    // テスト間の独立性を保つため、各テスト前にdeferredMapをクリア
    __testUtils.clearDeferredMap()

    mockDocument = {
      id: 'doc-1',
      userId: 'user-1',
      title: 'Test Doc',
      content: '# Test Doc\n\nInitial content',
      tags: ['tag1'],
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    mockOnUpdate = vi.fn()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('should render without document', () => {
    render(
      <CollaborativeTextEditor
        document={null}
        onDocumentUpdate={mockOnUpdate}
      />
    )

    expect(screen.getByText('ドキュメントを選択してください')).toBeTruthy()
  })

  it('should render with document', async () => {
    render(
      <CollaborativeTextEditor
        document={mockDocument}
        onDocumentUpdate={mockOnUpdate}
      />
    )

    // ドキュメントタイトルが表示される
    expect(screen.getByText('Test Doc')).toBeTruthy()

    // タグが表示される
    expect(screen.getByText('tag1')).toBeTruthy()
  })

  it('should render textarea in edit mode', async () => {
    const { container } = render(
      <CollaborativeTextEditor
        document={mockDocument}
        onDocumentUpdate={mockOnUpdate}
      />
    )

    const textarea = container.querySelector('textarea')
    expect(textarea).toBeTruthy()
  })
})

describe('CollaborativeTextEditor - Advanced Behavior', () => {
  let __testUtils: any
  beforeAll(async () => {
    const mod = await import('../lib/yjs-supabase-provider')
    __testUtils = (mod as any).__testUtils
  })

  let mockDocumentA: Document
  let mockDocumentB: Document
  let mockOnUpdate: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // テスト間の独立性を保つため、各テスト前にdeferredMapをクリア
    __testUtils.clearDeferredMap()

    mockOnUpdate = vi.fn()
    mockDocumentA = {
      id: 'doc-A',
      userId: 'user-1',
      title: 'Doc A',
      content: '# Doc A\n\nA content',
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    mockDocumentB = {
      id: 'doc-B',
      userId: 'user-1',
      title: 'Doc B',
      content: '# Doc B\n\nB content',
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  })

  afterEach(() => {
    cleanup()
  })

  it('does not call onDocumentUpdate on initial seed without user edits', async () => {
    render(<CollaborativeTextEditor document={mockDocumentA} onDocumentUpdate={mockOnUpdate} />)

    // IndexedDB 同期完了（初期シード実行）
    __testUtils.resolveWhenSynced('doc-A')
    await Promise.resolve()

    // ユーザー入力がない場合はバックエンド保存が走らない
    expect(mockOnUpdate).not.toHaveBeenCalled()
  })

  it('flushes debounced save on unmount', async () => {
    const { unmount, container } = render(
      <CollaborativeTextEditor document={mockDocumentA} onDocumentUpdate={mockOnUpdate} />,
    )

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement
    expect(textarea).toBeTruthy()

    // 入力してデバウンスをセット
    fireEvent.change(textarea!, { target: { value: 'Hello world' } })

    // アンマウント（500ms前）
    unmount()

    // クリーンアップで即保存されること
    expect(mockOnUpdate).toHaveBeenCalledWith('doc-A', 'Hello world')
  })

  it('cancels stale whenSynced callback on document switch', async () => {
    // Aを表示（whenSyncedは未解決）
    const utils = render(
      <CollaborativeTextEditor document={mockDocumentA} onDocumentUpdate={mockOnUpdate} />,
    )

    // すぐにBへ切替
    utils.rerender(
      <CollaborativeTextEditor document={mockDocumentB} onDocumentUpdate={mockOnUpdate} />,
    )

    // ここでAのwhenSyncedを解決させる
    __testUtils.resolveWhenSynced()
    await Promise.resolve()

    // 表示はBのタイトルのまま（Aのstaleコールバックは無視）
    expect(screen.getByText('Doc B')).toBeTruthy()
  })

  it('syncs tags when document.tags changes', async () => {
    const { rerender } = render(
      <CollaborativeTextEditor document={mockDocumentA} onDocumentUpdate={mockOnUpdate} />,
    )

    expect(screen.queryByText('newTag')).toBeNull()

    rerender(
      <CollaborativeTextEditor
        document={{ ...mockDocumentA, tags: ['newTag'] }}
        onDocumentUpdate={mockOnUpdate}
      />,
    )

    expect(screen.getByText('newTag')).toBeTruthy()
  })

  it('shows two-tier sync status after persistence and realtime', async () => {
    render(<CollaborativeTextEditor document={mockDocumentA} onDocumentUpdate={mockOnUpdate} />)

    // whenSynced を解決してローカル復元済み表示
    __testUtils.resolveWhenSynced()

    // ラベルの存在を確認（非同期更新を待つ）
    expect(await screen.findByText('ローカル: 復元済み')).toBeTruthy()
    expect(await screen.findByText('リアルタイム: 同期済み')).toBeTruthy()
  })

  it('calls provider.destroyPersistence on delete', async () => {
    // confirmを強制的にOK
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const onDelete = vi.fn()

    // Providerモックのインスタンスメソッドを監視するため、一旦レンダリング
    render(
      <CollaborativeTextEditor
        document={mockDocumentA}
        onDocumentUpdate={mockOnUpdate}
        onDocumentDelete={onDelete}
      />,
    )

    // Provider初期化完了の目安（ラベル表示）
    await screen.findByText('リアルタイム: 同期済み')

    // 削除ボタンをクリック
    const deleteButton = screen.getByLabelText('delete-document')
    fireEvent.click(deleteButton)

    // TDD: ProviderのdestroyPersistenceが呼ばれることを期待（まずRED）
    const mod = await import('../lib/yjs-supabase-provider')
    const inst: any = (mod as any).__getLastInstance()
    expect(inst.destroyPersistence).toHaveBeenCalled()
    expect(onDelete).toHaveBeenCalledWith('doc-A')
    confirmSpy.mockRestore()
  })
})
