import { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'

/**
 * Supabase Realtime を使った Y.js プロバイダー
 * WebSocket の代わりに Supabase の Realtime チャンネルを使用
 */
export class SupabaseProvider {
  public doc: Y.Doc
  public awareness: any = null  // 将来の拡張用（現在は未使用）
  public persistence: IndexeddbPersistence | null = null  // IndexedDB永続化
  private supabase: SupabaseClient
  private channel: RealtimeChannel | null = null
  private documentId: string
  private realtimeSynced = false
  private persistenceSynced = false
  private updateListenerAttached = false  // リスナー重複防止フラグ

  constructor(documentId: string, doc: Y.Doc, supabase: SupabaseClient) {
    this.documentId = documentId
    this.doc = doc
    this.supabase = supabase

    // IndexedDB で永続化（オフライン対応）
    this.persistence = new IndexeddbPersistence(documentId, doc)
    // 同期完了をフラグ化
    this.persistence.whenSynced.then(() => {
      this.persistenceSynced = true
    })

    this.connect()
  }

  private connect() {
    // Supabase Realtime チャンネルに接続
    this.channel = this.supabase.channel(`document:${this.documentId}`, {
      config: {
        // 自分のブロードキャストは受信しない
        broadcast: { self: false },
      },
    })

    // 他のクライアントからの更新を受信
    this.channel.on('broadcast', { event: 'update' }, ({ payload }) => {
      if (payload.update) {
        const update = new Uint8Array(payload.update)
        // originにthisを渡して、再ブロードキャストを防ぐ
        Y.applyUpdate(this.doc, update, this)
      }
    })

    // 同期リクエストを受信（新規接続時）
    this.channel.on('broadcast', { event: 'sync-request' }, ({ payload }) => {
      // 現在の状態を送信
      const state = Y.encodeStateAsUpdate(this.doc)
      this.channel?.send({
        type: 'broadcast',
        event: 'sync-response',
        payload: { update: Array.from(state), clientId: payload.clientId },
      })
    })

    // 同期レスポンスを受信
    this.channel.on('broadcast', { event: 'sync-response' }, ({ payload }) => {
      if (payload.update) {
        const update = new Uint8Array(payload.update)
        // originにthisを渡して、再ブロードキャストを防ぐ
        Y.applyUpdate(this.doc, update, this)
        this.realtimeSynced = true
      }
    })

    // チャンネルに接続
    this.channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        // 接続成功、同期リクエストを送信
        const clientId = Math.random().toString(36).substring(7)
        // 単独接続でも"接続済み"として扱う（UIの分かりやすさを優先）
        this.realtimeSynced = true
        await this.channel?.send({
          type: 'broadcast',
          event: 'sync-request',
          payload: { clientId },
        })

        // オフライン編集対応: 既存のローカル状態をブロードキャスト
        // IndexedDBから復元された編集や、接続前の変更を他のピアに送信
        const localState = Y.encodeStateAsUpdate(this.doc)
        if (localState.length > 0) {
          await this.channel?.send({
            type: 'broadcast',
            event: 'update',
            payload: { update: Array.from(localState) },
          })
        }

        // ソロクライアント対策: SUBSCRIBED時点でリアルタイム接続は成功
        // 他のピアから sync-response が来ればそれで上書きされる
        this.realtimeSynced = true

        // ローカル変更を監視してブロードキャスト（重複防止）
        if (!this.updateListenerAttached) {
          this.doc.on('update', this.handleUpdate)
          this.updateListenerAttached = true
        }
      } else if (status === 'CLOSED' || status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
        // 接続が切れたらフラグをリセット
        this.realtimeSynced = false
      }
    })
  }

  private handleUpdate = (update: Uint8Array, origin: any) => {
    // 自分の変更のみブロードキャスト（他から受信したものは除外）
    if (origin !== this) {
      this.channel?.send({
        type: 'broadcast',
        event: 'update',
        payload: { update: Array.from(update) },
      })
    }
  }

  public disconnect() {
    if (this.channel) {
      this.doc.off('update', this.handleUpdate)
      this.updateListenerAttached = false
      this.supabase.removeChannel(this.channel)
      this.channel = null
    }

    // Note: IndexedDB persistence is NOT destroyed here to preserve offline edits.
    // The persistence layer should remain intact so the next session can resync.
    // Only call persistence.destroy() when the document is permanently deleted.
  }

  public isSynced(): boolean {
    return this.realtimeSynced
  }

  public isRealtimeSynced(): boolean {
    return this.realtimeSynced
  }

  public isPersistenceSynced(): boolean {
    return this.persistenceSynced
  }

  // 永続データ削除（ドキュメント削除時に使用）
  public async destroyPersistence() {
    const anyIdx = IndexeddbPersistence as unknown as {
      clearData?: (name: string) => Promise<void> | void
    }
    if (typeof anyIdx.clearData === 'function') {
      await anyIdx.clearData(this.documentId)
      return
    }
    // フォールバック: 一時Docで初期化して破棄
    try {
      const tempDoc = new Y.Doc()
      const temp = new IndexeddbPersistence(this.documentId, tempDoc)
      // @ts-ignore - 一部実装ではdestroyでデータも削除される
      if (typeof (temp as any).clearData === 'function') {
        await (temp as any).clearData()
      }
      await temp.destroy()
    } catch (error) {
      console.warn('Failed to destroy IndexedDB persistence:', error)
    }
  }
}

// ヘルパー: コンポーネント外から削除したい場合に使用
export async function destroyDocumentPersistence(documentId: string) {
  const anyIdx = IndexeddbPersistence as unknown as {
    clearData?: (name: string) => Promise<void> | void
  }
  if (typeof anyIdx.clearData === 'function') {
    await anyIdx.clearData(documentId)
    return
  }
  try {
    const tempDoc = new Y.Doc()
    const temp = new IndexeddbPersistence(documentId, tempDoc)
    // @ts-ignore
    if (typeof (temp as any).clearData === 'function') {
      await (temp as any).clearData()
    }
    await temp.destroy()
  } catch (_) {
    // no-op
  }
}
