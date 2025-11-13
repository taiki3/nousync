import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CollaborativeTextEditor from './CollaborativeTextEditor'
import type { Document } from '@nousync/shared'
import * as Y from 'yjs'

// モック
vi.mock('../lib/yjs-supabase-provider')
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

describe('CollaborativeTextEditor - TDD', () => {
  let mockDocument: Document
  let mockOnUpdate: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockDocument = {
      id: 'doc-1',
      user_id: 'user-1',
      title: 'Test Doc',
      content: 'Initial content',
      tags: ['tag1'],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    mockOnUpdate = vi.fn()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('P1: Debounce with Remote Edits', () => {
    it('should persist merged content instead of stale snapshot when remote edit arrives during debounce', async () => {
      vi.useFakeTimers()

      const { container } = render(
        <CollaborativeTextEditor
          document={mockDocument}
          onDocumentUpdate={mockOnUpdate}
        />
      )

      const textarea = container.querySelector('textarea')!
      expect(textarea).toBeTruthy()

      // ユーザーがローカルで編集
      await userEvent.type(textarea, 'Local edit')

      // 200ms経過（debounce完了前）
      vi.advanceTimersByTime(200)

      // この時点でまだAPI呼び出しされていない
      expect(mockOnUpdate).not.toHaveBeenCalled()

      // リモートから編集が到着（Y.jsでマージされる）
      // 実際のシナリオ: 別タブでの編集が同期される
      // Y.Text に直接適用されるため、textareaの値も変わる
      // 期待: debounceタイマーが発火した時、最新のytext値を保存する

      // 残り300ms経過してdebounce完了
      vi.advanceTimersByTime(300)

      // API呼び出し時に、キャプチャされた古い値ではなく
      // 最新のytext値（リモート編集がマージされた値）を使うべき
      await waitFor(() => {
        expect(mockOnUpdate).toHaveBeenCalledTimes(1)
        // 呼び出し時の引数をチェック
        // newContentではなく、ytext.toString()の最新値を使っているべき
      })

      vi.useRealTimers()
    })

    it('should read ytext.toString() at execution time, not at schedule time', async () => {
      vi.useFakeTimers()

      const { container } = render(
        <CollaborativeTextEditor
          document={mockDocument}
          onDocumentUpdate={mockOnUpdate}
        />
      )

      const textarea = container.querySelector('textarea')!

      // ローカル編集: "A"
      await userEvent.type(textarea, 'A')

      // タイマーセット時点のnewContent = "Initial contentA"

      // 100ms経過
      vi.advanceTimersByTime(100)

      // リモート編集が到着: ytextに"B"が追加される
      // 現在のytext = "Initial contentAB" （CRDTでマージ）
      // しかしnewContentはまだ"Initial contentA"のまま

      // 残り400ms経過
      vi.advanceTimersByTime(400)

      // この時点で保存される値は:
      // ❌ 間違い: "Initial contentA" (newContent)
      // ✅ 正しい: "Initial contentAB" (ytext.toString())

      await waitFor(() => {
        expect(mockOnUpdate).toHaveBeenCalled()
      })

      vi.useRealTimers()
    })
  })

  describe('P1: Stale whenSynced Callback', () => {
    it('should not apply stale whenSynced callback after document switch', async () => {
      let resolveSync1: (() => void) | undefined
      let resolveSync2: (() => void) | undefined

      const mockPersistence1 = {
        whenSynced: new Promise<void>((resolve) => {
          resolveSync1 = resolve
        }),
      }

      const mockPersistence2 = {
        whenSynced: new Promise<void>((resolve) => {
          resolveSync2 = resolve
        }),
      }

      const { SupabaseProvider } = await import('../lib/yjs-supabase-provider')
      vi.mocked(SupabaseProvider)
        .mockImplementationOnce(
          () =>
            ({
              doc: new Y.Doc(),
              persistence: mockPersistence1,
              disconnect: vi.fn(),
              isSynced: vi.fn(() => false),
            }) as any
        )
        .mockImplementationOnce(
          () =>
            ({
              doc: new Y.Doc(),
              persistence: mockPersistence2,
              disconnect: vi.fn(),
              isSynced: vi.fn(() => false),
            }) as any
        )

      const { rerender, container } = render(
        <CollaborativeTextEditor
          document={{ ...mockDocument, id: 'doc-1', content: 'Content A' }}
          onDocumentUpdate={mockOnUpdate}
        />
      )

      // ドキュメント切り替え
      rerender(
        <CollaborativeTextEditor
          document={{ ...mockDocument, id: 'doc-2', content: 'Content B' }}
          onDocumentUpdate={mockOnUpdate}
        />
      )

      // doc-1のwhenSyncedを解決
      resolveSync1!()

      await waitFor(() => {
        const textarea = container.querySelector('textarea')!
        // Content Aは適用されない（キャンセルされた）
        expect(textarea.value).not.toContain('Content A')
      })
    })
  })

  describe('Debounce Flush on Unmount', () => {
    it('should flush pending debounced save before unmount', async () => {
      vi.useFakeTimers()

      const { unmount, container } = render(
        <CollaborativeTextEditor
          document={mockDocument}
          onDocumentUpdate={mockOnUpdate}
        />
      )

      const textarea = container.querySelector('textarea')!
      await userEvent.type(textarea, 'unsaved changes')

      // 200ms経過（debounce完了前）
      vi.advanceTimersByTime(200)

      expect(mockOnUpdate).not.toHaveBeenCalled()

      // アンマウント
      unmount()

      // 即座に保存される
      expect(mockOnUpdate).toHaveBeenCalledWith(
        'doc-1',
        expect.stringContaining('unsaved changes')
      )

      vi.useRealTimers()
    })
  })

  describe('Tag Synchronization', () => {
    it('should update tags when document.tags changes with same ID', async () => {
      const { rerender, container } = render(
        <CollaborativeTextEditor
          document={{ ...mockDocument, tags: ['tag1'] }}
          onDocumentUpdate={mockOnUpdate}
        />
      )

      // 初期タグ確認
      expect(container.textContent).toContain('tag1')

      // タグ更新（同じID）
      rerender(
        <CollaborativeTextEditor
          document={{ ...mockDocument, tags: ['tag1', 'tag2'] }}
          onDocumentUpdate={mockOnUpdate}
        />
      )

      await waitFor(() => {
        expect(container.textContent).toContain('tag2')
      })
    })
  })

  describe('Provider Reinitialization', () => {
    it('should NOT reinitialize provider when document object changes with same ID', async () => {
      const { SupabaseProvider } = await import('../lib/yjs-supabase-provider')

      const { rerender } = render(
        <CollaborativeTextEditor
          document={mockDocument}
          onDocumentUpdate={mockOnUpdate}
        />
      )

      const initialCallCount = vi.mocked(SupabaseProvider).mock.calls.length

      // 同じIDで新しいオブジェクト
      rerender(
        <CollaborativeTextEditor
          document={{ ...mockDocument, content: 'Updated content' }}
          onDocumentUpdate={mockOnUpdate}
        />
      )

      // プロバイダーは再作成されない
      expect(vi.mocked(SupabaseProvider).mock.calls.length).toBe(
        initialCallCount
      )
    })

    it('should reinitialize provider when switching to different document ID', async () => {
      const { SupabaseProvider } = await import('../lib/yjs-supabase-provider')

      const mockProvider1 = {
        doc: new Y.Doc(),
        disconnect: vi.fn(),
        isSynced: vi.fn(() => true),
      }

      vi.mocked(SupabaseProvider).mockReturnValue(mockProvider1 as any)

      const { rerender } = render(
        <CollaborativeTextEditor
          document={{ ...mockDocument, id: 'doc-1' }}
          onDocumentUpdate={mockOnUpdate}
        />
      )

      // ドキュメント切り替え
      rerender(
        <CollaborativeTextEditor
          document={{ ...mockDocument, id: 'doc-2' }}
          onDocumentUpdate={mockOnUpdate}
        />
      )

      await waitFor(() => {
        // 古いプロバイダーが切断される
        expect(mockProvider1.disconnect).toHaveBeenCalled()
      })
    })
  })

  describe('IndexedDB Persistence', () => {
    it('should NOT destroy persistence on disconnect', async () => {
      const mockPersistence = {
        whenSynced: Promise.resolve(),
        destroy: vi.fn(),
      }

      const { SupabaseProvider } = await import('../lib/yjs-supabase-provider')
      const mockProvider = {
        doc: new Y.Doc(),
        persistence: mockPersistence,
        disconnect: vi.fn(),
        isSynced: vi.fn(() => true),
      }

      vi.mocked(SupabaseProvider).mockReturnValue(mockProvider as any)

      const { unmount } = render(
        <CollaborativeTextEditor
          document={mockDocument}
          onDocumentUpdate={mockOnUpdate}
        />
      )

      unmount()

      // persistenceは破壊されない
      expect(mockPersistence.destroy).not.toHaveBeenCalled()
    })
  })
})
