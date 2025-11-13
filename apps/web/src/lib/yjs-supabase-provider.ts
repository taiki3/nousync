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
  private synced = false

  constructor(documentId: string, doc: Y.Doc, supabase: SupabaseClient) {
    this.documentId = documentId
    this.doc = doc
    this.supabase = supabase

    // IndexedDB で永続化（オフライン対応）
    this.persistence = new IndexeddbPersistence(documentId, doc)

    this.connect()
  }

  private connect() {
    // Supabase Realtime チャンネルに接続
    this.channel = this.supabase.channel(`document:${this.documentId}`, {
      config: {
        broadcast: { self: true },
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
        this.synced = true
      }
    })

    // チャンネルに接続
    this.channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        // 接続成功、同期リクエストを送信
        const clientId = Math.random().toString(36).substring(7)
        await this.channel?.send({
          type: 'broadcast',
          event: 'sync-request',
          payload: { clientId },
        })

        // ローカル変更を監視してブロードキャスト
        this.doc.on('update', this.handleUpdate)
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
      this.supabase.removeChannel(this.channel)
      this.channel = null
    }

    // Note: IndexedDB persistence is NOT destroyed here to preserve offline edits.
    // The persistence layer should remain intact so the next session can resync.
    // Only call persistence.destroy() when the document is permanently deleted.
  }

  public isSynced(): boolean {
    return this.synced
  }
}
