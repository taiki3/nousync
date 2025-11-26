import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest'
import * as Y from 'yjs'
import { SupabaseProvider, destroyDocumentPersistence } from './yjs-supabase-provider'
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js'

// IndexeddbPersistence のモック
vi.mock('y-indexeddb', () => {
  class MockIndexeddbPersistence {
    name: string
    doc: any
    whenSynced: Promise<void>
    destroy: ReturnType<typeof vi.fn>
    clearData: ReturnType<typeof vi.fn>

    constructor(name: string, doc: any) {
      this.name = name
      this.doc = doc
      this.whenSynced = Promise.resolve()
      this.destroy = vi.fn().mockResolvedValue(undefined)
      this.clearData = vi.fn().mockResolvedValue(undefined)
    }
  }

  return {
    IndexeddbPersistence: MockIndexeddbPersistence,
  }
})

// テスト用のモック Supabase クライアントを作成
function createMockSupabase() {
  const handlers: Map<string, (payload: any) => void> = new Map()
  let subscribeCallback: ((status: string) => void) | null = null

  const mockChannel: Partial<RealtimeChannel> & {
    __handlers: Map<string, (payload: any) => void>
    __triggerEvent: (event: string, payload: any) => void
    __triggerSubscribe: (status: string) => void
  } = {
    __handlers: handlers,
    __triggerEvent: (event: string, payload: any) => {
      const handler = handlers.get(event)
      if (handler) {
        handler({ payload })
      }
    },
    __triggerSubscribe: (status: string) => {
      if (subscribeCallback) {
        subscribeCallback(status)
      }
    },
    on: vi.fn((type: string, filter: { event: string }, callback: (payload: any) => void) => {
      handlers.set(filter.event, callback)
      return mockChannel as RealtimeChannel
    }),
    subscribe: vi.fn((callback?: (status: string) => void) => {
      subscribeCallback = callback || null
      return mockChannel as RealtimeChannel
    }),
    send: vi.fn().mockResolvedValue('ok'),
  }

  const mockSupabase = {
    channel: vi.fn(() => mockChannel as RealtimeChannel),
    removeChannel: vi.fn(),
  } as unknown as SupabaseClient

  return { mockSupabase, mockChannel }
}

describe('SupabaseProvider', () => {
  let ydoc: Y.Doc
  let mockSupabase: SupabaseClient
  let mockChannel: ReturnType<typeof createMockSupabase>['mockChannel']

  beforeEach(() => {
    vi.clearAllMocks()
    ydoc = new Y.Doc()
    const mocks = createMockSupabase()
    mockSupabase = mocks.mockSupabase
    mockChannel = mocks.mockChannel
  })

  afterEach(() => {
    ydoc.destroy()
  })

  describe('初期化', () => {
    it('should create provider with document and connect to channel', () => {
      const provider = new SupabaseProvider('test-doc', ydoc, mockSupabase)

      expect(mockSupabase.channel).toHaveBeenCalledWith('document:test-doc', {
        config: { broadcast: { self: false } },
      })
      expect(provider.doc).toBe(ydoc)
      expect(provider.persistence).toBeTruthy()
    })

    it('should set up broadcast event handlers', () => {
      new SupabaseProvider('test-doc', ydoc, mockSupabase)

      expect(mockChannel.on).toHaveBeenCalledWith(
        'broadcast',
        { event: 'update' },
        expect.any(Function)
      )
      expect(mockChannel.on).toHaveBeenCalledWith(
        'broadcast',
        { event: 'sync-request' },
        expect.any(Function)
      )
      expect(mockChannel.on).toHaveBeenCalledWith(
        'broadcast',
        { event: 'sync-response' },
        expect.any(Function)
      )
    })

    it('should subscribe to channel', () => {
      new SupabaseProvider('test-doc', ydoc, mockSupabase)

      expect(mockChannel.subscribe).toHaveBeenCalled()
    })
  })

  describe('同期状態', () => {
    it('should report synced after SUBSCRIBED', async () => {
      const provider = new SupabaseProvider('test-doc', ydoc, mockSupabase)

      // 初期状態は未同期
      expect(provider.isRealtimeSynced()).toBe(false)

      // SUBSCRIBED をトリガー
      mockChannel.__triggerSubscribe('SUBSCRIBED')
      await Promise.resolve() // マイクロタスクを待つ

      expect(provider.isRealtimeSynced()).toBe(true)
      expect(provider.isSynced()).toBe(true)
    })

    it('should reset sync status on CLOSED', async () => {
      const provider = new SupabaseProvider('test-doc', ydoc, mockSupabase)

      mockChannel.__triggerSubscribe('SUBSCRIBED')
      await Promise.resolve()
      expect(provider.isRealtimeSynced()).toBe(true)

      mockChannel.__triggerSubscribe('CLOSED')
      expect(provider.isRealtimeSynced()).toBe(false)
    })

    it('should reset sync status on TIMED_OUT', async () => {
      const provider = new SupabaseProvider('test-doc', ydoc, mockSupabase)

      mockChannel.__triggerSubscribe('SUBSCRIBED')
      await Promise.resolve()

      mockChannel.__triggerSubscribe('TIMED_OUT')
      expect(provider.isRealtimeSynced()).toBe(false)
    })

    it('should reset sync status on CHANNEL_ERROR', async () => {
      const provider = new SupabaseProvider('test-doc', ydoc, mockSupabase)

      mockChannel.__triggerSubscribe('SUBSCRIBED')
      await Promise.resolve()

      mockChannel.__triggerSubscribe('CHANNEL_ERROR')
      expect(provider.isRealtimeSynced()).toBe(false)
    })
  })

  describe('ブロードキャスト送信', () => {
    it('should send sync-request on SUBSCRIBED', async () => {
      new SupabaseProvider('test-doc', ydoc, mockSupabase)

      mockChannel.__triggerSubscribe('SUBSCRIBED')
      await Promise.resolve()

      expect(mockChannel.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'broadcast',
          event: 'sync-request',
          payload: expect.objectContaining({ clientId: expect.any(String) }),
        })
      )
    })

    it('should broadcast local state on SUBSCRIBED', async () => {
      // 事前にドキュメントにコンテンツを追加
      const ytext = ydoc.getText('content')
      ytext.insert(0, 'Hello World')

      new SupabaseProvider('test-doc', ydoc, mockSupabase)

      mockChannel.__triggerSubscribe('SUBSCRIBED')
      await Promise.resolve()

      // ローカル状態のブロードキャスト
      expect(mockChannel.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'broadcast',
          event: 'update',
          payload: expect.objectContaining({ update: expect.any(Array) }),
        })
      )
    })

    it('should broadcast updates from local Y.Doc changes', async () => {
      const provider = new SupabaseProvider('test-doc', ydoc, mockSupabase)

      mockChannel.__triggerSubscribe('SUBSCRIBED')
      // リスナー設定完了を待つ
      await new Promise(resolve => setTimeout(resolve, 0))

      // 初期のsend呼び出しをクリア
      ;(mockChannel.send as Mock).mockClear()

      // ローカルで変更を加える
      const ytext = ydoc.getText('content')
      ytext.insert(0, 'New content')

      // Y.jsのupdate イベントは同期的に発火するが、sendはasyncなので少し待つ
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(mockChannel.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'broadcast',
          event: 'update',
          payload: expect.objectContaining({ update: expect.any(Array) }),
        })
      )
    })
  })

  describe('ブロードキャスト受信', () => {
    it('should apply remote update to Y.Doc', async () => {
      const provider = new SupabaseProvider('test-doc', ydoc, mockSupabase)

      mockChannel.__triggerSubscribe('SUBSCRIBED')
      await Promise.resolve()

      // リモートドキュメントで変更を作成
      const remoteDoc = new Y.Doc()
      const remoteText = remoteDoc.getText('content')
      remoteText.insert(0, 'Remote content')
      const update = Y.encodeStateAsUpdate(remoteDoc)

      // リモート更新を受信
      mockChannel.__triggerEvent('update', { update: Array.from(update) })

      // ローカルドキュメントに反映されていることを確認
      const localText = ydoc.getText('content')
      expect(localText.toString()).toBe('Remote content')

      remoteDoc.destroy()
    })

    it('should not re-broadcast received updates', async () => {
      new SupabaseProvider('test-doc', ydoc, mockSupabase)

      mockChannel.__triggerSubscribe('SUBSCRIBED')
      await Promise.resolve()

      ;(mockChannel.send as Mock).mockClear()

      // リモート更新を受信
      const remoteDoc = new Y.Doc()
      const remoteText = remoteDoc.getText('content')
      remoteText.insert(0, 'Remote content')
      const update = Y.encodeStateAsUpdate(remoteDoc)

      mockChannel.__triggerEvent('update', { update: Array.from(update) })

      // 再ブロードキャストされていないことを確認
      expect(mockChannel.send).not.toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'update',
        })
      )

      remoteDoc.destroy()
    })

    it('should respond to sync-request with current state', async () => {
      // 事前にドキュメントにコンテンツを追加
      const ytext = ydoc.getText('content')
      ytext.insert(0, 'Existing content')

      new SupabaseProvider('test-doc', ydoc, mockSupabase)

      mockChannel.__triggerSubscribe('SUBSCRIBED')
      await Promise.resolve()

      ;(mockChannel.send as Mock).mockClear()

      // sync-request を受信
      mockChannel.__triggerEvent('sync-request', { clientId: 'remote-client' })

      // sync-response で現在の状態を送信
      expect(mockChannel.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'broadcast',
          event: 'sync-response',
          payload: expect.objectContaining({
            update: expect.any(Array),
            clientId: 'remote-client',
          }),
        })
      )
    })

    it('should apply sync-response and mark as synced', async () => {
      const provider = new SupabaseProvider('test-doc', ydoc, mockSupabase)

      mockChannel.__triggerSubscribe('SUBSCRIBED')
      await Promise.resolve()

      // リモートドキュメントの状態を作成
      const remoteDoc = new Y.Doc()
      const remoteText = remoteDoc.getText('content')
      remoteText.insert(0, 'Synced content')
      const update = Y.encodeStateAsUpdate(remoteDoc)

      // sync-response を受信
      mockChannel.__triggerEvent('sync-response', { update: Array.from(update) })

      // ドキュメントに反映
      const localText = ydoc.getText('content')
      expect(localText.toString()).toBe('Synced content')
      expect(provider.isRealtimeSynced()).toBe(true)

      remoteDoc.destroy()
    })
  })

  describe('disconnect', () => {
    it('should remove channel and clean up listeners on disconnect', async () => {
      const provider = new SupabaseProvider('test-doc', ydoc, mockSupabase)

      mockChannel.__triggerSubscribe('SUBSCRIBED')
      await Promise.resolve()

      provider.disconnect()

      expect(mockSupabase.removeChannel).toHaveBeenCalled()
    })

    it('should not broadcast updates after disconnect', async () => {
      const provider = new SupabaseProvider('test-doc', ydoc, mockSupabase)

      mockChannel.__triggerSubscribe('SUBSCRIBED')
      await Promise.resolve()

      provider.disconnect()

      ;(mockChannel.send as Mock).mockClear()

      // 切断後にローカル変更
      const ytext = ydoc.getText('content')
      ytext.insert(0, 'After disconnect')

      // ブロードキャストされないことを確認
      expect(mockChannel.send).not.toHaveBeenCalled()
    })
  })

  describe('IndexedDB 永続化', () => {
    it('should track persistence sync status', async () => {
      const provider = new SupabaseProvider('test-doc', ydoc, mockSupabase)

      // whenSynced は即座に resolve されるモック
      await provider.persistence?.whenSynced

      expect(provider.isPersistenceSynced()).toBe(true)
    })
  })

  describe('CRDT マージ', () => {
    it('should correctly merge concurrent edits from multiple sources', async () => {
      const provider = new SupabaseProvider('test-doc', ydoc, mockSupabase)

      mockChannel.__triggerSubscribe('SUBSCRIBED')
      await Promise.resolve()

      // ローカルで編集
      const localText = ydoc.getText('content')
      localText.insert(0, 'Local: ')

      // 同時にリモートから編集が来る
      const remoteDoc = new Y.Doc()
      const remoteText = remoteDoc.getText('content')
      remoteText.insert(0, 'Remote: ')
      const update = Y.encodeStateAsUpdate(remoteDoc)

      mockChannel.__triggerEvent('update', { update: Array.from(update) })

      // 両方の編集がマージされていることを確認
      const finalContent = localText.toString()
      expect(finalContent).toContain('Local:')
      expect(finalContent).toContain('Remote:')

      remoteDoc.destroy()
    })

    it('should handle insertions at same position (convergence)', async () => {
      new SupabaseProvider('test-doc', ydoc, mockSupabase)

      mockChannel.__triggerSubscribe('SUBSCRIBED')
      await Promise.resolve()

      const localText = ydoc.getText('content')

      // 複数のリモートドキュメントから同じ位置に挿入
      const remote1 = new Y.Doc()
      const text1 = remote1.getText('content')
      text1.insert(0, 'A')

      const remote2 = new Y.Doc()
      const text2 = remote2.getText('content')
      text2.insert(0, 'B')

      mockChannel.__triggerEvent('update', {
        update: Array.from(Y.encodeStateAsUpdate(remote1)),
      })
      mockChannel.__triggerEvent('update', {
        update: Array.from(Y.encodeStateAsUpdate(remote2)),
      })

      // 両方の挿入が存在する（順序は決定論的）
      const content = localText.toString()
      expect(content).toHaveLength(2)
      expect(content).toContain('A')
      expect(content).toContain('B')

      remote1.destroy()
      remote2.destroy()
    })
  })
})

describe('destroyDocumentPersistence', () => {
  it('should attempt to destroy persistence for a document', async () => {
    // 関数が例外を投げないことを確認
    await expect(destroyDocumentPersistence('test-doc-id')).resolves.not.toThrow()
  })
})
