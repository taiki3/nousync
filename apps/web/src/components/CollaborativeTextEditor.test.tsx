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

    expect(await screen.findByLabelText('ローカル: 復元済み')).toBeTruthy()
    expect(await screen.findByLabelText('リアルタイム: 同期済み')).toBeTruthy()
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
    __testUtils.resolveWhenSynced('doc-A')
    await screen.findByLabelText('リアルタイム: 同期済み')

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

describe('CollaborativeTextEditor - Synchronization Edge Cases', () => {
  let __testUtils: any
  let mockOnUpdate: ReturnType<typeof vi.fn>

  beforeAll(async () => {
    const mod = await import('../lib/yjs-supabase-provider')
    __testUtils = (mod as any).__testUtils
  })

  beforeEach(() => {
    __testUtils.clearDeferredMap()
    mockOnUpdate = vi.fn()
  })

  afterEach(() => {
    cleanup()
  })

  it('should disconnect provider when document becomes null', async () => {
    const mockDocument: Document = {
      id: 'doc-disconnect',
      userId: 'user-1',
      title: 'Disconnect Test',
      content: 'Content',
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const { rerender } = render(
      <CollaborativeTextEditor document={mockDocument} onDocumentUpdate={mockOnUpdate} />
    )

    __testUtils.resolveWhenSynced('doc-disconnect')
    await screen.findByLabelText('リアルタイム: 同期済み')

    const mod = await import('../lib/yjs-supabase-provider')
    const inst: any = (mod as any).__getLastInstance()

    // ドキュメントを null に変更
    rerender(
      <CollaborativeTextEditor document={null} onDocumentUpdate={mockOnUpdate} />
    )

    // disconnect が呼ばれることを確認
    expect(inst.disconnect).toHaveBeenCalled()
  })

  it('should handle rapid document switching without data loss', async () => {
    const docs: Document[] = Array.from({ length: 5 }, (_, i) => ({
      id: `rapid-doc-${i}`,
      userId: 'user-1',
      title: `Doc ${i}`,
      content: `Content ${i}`,
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }))

    const { rerender } = render(
      <CollaborativeTextEditor document={docs[0]} onDocumentUpdate={mockOnUpdate} />
    )

    // 高速でドキュメントを切り替え
    for (let i = 1; i < docs.length; i++) {
      rerender(
        <CollaborativeTextEditor document={docs[i]} onDocumentUpdate={mockOnUpdate} />
      )
    }

    // 最終的なドキュメントが表示されていることを確認
    expect(screen.getByText('Doc 4')).toBeTruthy()
  })

  it('should not save when content equals document.content after seed', async () => {
    const mockDocument: Document = {
      id: 'no-duplicate-save',
      userId: 'user-1',
      title: 'No Duplicate',
      content: 'Original content',
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    render(
      <CollaborativeTextEditor document={mockDocument} onDocumentUpdate={mockOnUpdate} />
    )

    // IndexedDB 同期完了（初期シード実行）
    __testUtils.resolveWhenSynced('no-duplicate-save')
    await Promise.resolve()

    // 500ms待ってもonUpdateが呼ばれないことを確認
    await new Promise(resolve => setTimeout(resolve, 600))

    // 初期シードのみで変更がない場合は保存されない
    expect(mockOnUpdate).not.toHaveBeenCalled()
  })

  it('should handle tag updates without affecting content', async () => {
    const mockDocument: Document = {
      id: 'tag-update-test',
      userId: 'user-1',
      title: 'Tag Update Test',
      content: 'Initial content',
      tags: ['initial-tag'],
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const { rerender } = render(
      <CollaborativeTextEditor document={mockDocument} onDocumentUpdate={mockOnUpdate} />
    )

    __testUtils.resolveWhenSynced('tag-update-test')
    await screen.findByLabelText('リアルタイム: 同期済み')

    // 初期タグが表示されている
    expect(screen.getByText('initial-tag')).toBeTruthy()

    // ドキュメントのタグが外部から更新される（同じdocumentId）
    rerender(
      <CollaborativeTextEditor
        document={{ ...mockDocument, tags: ['new-tag', 'another-tag'] }}
        onDocumentUpdate={mockOnUpdate}
      />
    )

    // 新しいタグが反映されている
    expect(screen.getByText('new-tag')).toBeTruthy()
    expect(screen.getByText('another-tag')).toBeTruthy()
    // 古いタグは消えている
    expect(screen.queryByText('initial-tag')).toBeNull()
  })

  it('should preserve cursor position during remote updates', async () => {
    const mockDocument: Document = {
      id: 'cursor-test',
      userId: 'user-1',
      title: 'Cursor Test',
      content: 'Hello World',
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const { container } = render(
      <CollaborativeTextEditor document={mockDocument} onDocumentUpdate={mockOnUpdate} />
    )

    __testUtils.resolveWhenSynced('cursor-test')
    await screen.findByLabelText('リアルタイム: 同期済み')

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement
    expect(textarea).toBeTruthy()

    // テキストエリアにフォーカスしてカーソル位置を設定
    textarea.focus()
    textarea.setSelectionRange(5, 5) // "Hello|" の位置

    // テキストを変更（カーソル位置を保持するか確認）
    fireEvent.change(textarea, { target: { value: 'Hello Beautiful World' } })

    // タイマーで位置が復元されることを確認
    await new Promise(resolve => setTimeout(resolve, 10))
    // 新しいカーソル位置は挿入分だけ進む
    expect(textarea.selectionStart).toBeGreaterThanOrEqual(5)
  })
})

describe('CollaborativeTextEditor - Error Handling', () => {
  let __testUtils: any
  let mockOnUpdate: ReturnType<typeof vi.fn>

  beforeAll(async () => {
    const mod = await import('../lib/yjs-supabase-provider')
    __testUtils = (mod as any).__testUtils
  })

  beforeEach(() => {
    __testUtils.clearDeferredMap()
    mockOnUpdate = vi.fn()
  })

  afterEach(() => {
    cleanup()
  })

  it('should handle delete cancellation gracefully', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const onDelete = vi.fn()

    const mockDocument: Document = {
      id: 'cancel-delete',
      userId: 'user-1',
      title: 'Cancel Delete Test',
      content: 'Content',
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    render(
      <CollaborativeTextEditor
        document={mockDocument}
        onDocumentUpdate={mockOnUpdate}
        onDocumentDelete={onDelete}
      />
    )

    __testUtils.resolveWhenSynced('cancel-delete')
    await screen.findByLabelText('リアルタイム: 同期済み')

    const deleteButton = screen.getByLabelText('delete-document')
    fireEvent.click(deleteButton)

    // キャンセルしたので削除されない
    expect(onDelete).not.toHaveBeenCalled()

    // ドキュメントはまだ表示されている
    expect(screen.getByText('Cancel Delete Test')).toBeTruthy()

    confirmSpy.mockRestore()
  })

  it('should handle empty content document', async () => {
    const mockDocument: Document = {
      id: 'empty-content',
      userId: 'user-1',
      title: '',
      content: '',
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const { container } = render(
      <CollaborativeTextEditor document={mockDocument} onDocumentUpdate={mockOnUpdate} />
    )

    __testUtils.resolveWhenSynced('empty-content')
    await Promise.resolve()

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement
    expect(textarea).toBeTruthy()
    expect(textarea.value).toBe('')
  })
})
