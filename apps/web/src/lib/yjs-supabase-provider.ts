import { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'

/**
 * バッチ処理付きブロードキャスター
 * 細かい更新をまとめて送信することで通信量を削減
 */
class BatchedBroadcaster {
  private pendingUpdates: Uint8Array[] = []
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private readonly BATCH_INTERVAL = 50 // ms
  private channel: RealtimeChannel | null = null

  setChannel(channel: RealtimeChannel | null) {
    this.channel = channel
  }

  queue(update: Uint8Array) {
    this.pendingUpdates.push(update)

    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), this.BATCH_INTERVAL)
    }
  }

  flush() {
    if (this.pendingUpdates.length === 0 || !this.channel) {
      this.flushTimer = null
      return
    }

    // 複数の更新をマージ
    const merged = Y.mergeUpdates(this.pendingUpdates)
    this.channel.send({
      type: 'broadcast',
      event: 'update',
      payload: { update: Array.from(merged) },
    })

    this.pendingUpdates = []
    this.flushTimer = null
  }

  destroy() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    // flush remaining updates before destroy
    this.flush()
    this.channel = null
  }
}

/**
 * Supabase Realtime を使った Y.js プロバイダー
 * - IndexedDB でローカル優先表示（即座）
 * - Supabase DB で永続化（バックグラウンド同期）
 * - State Vector による差分同期
 * - バッチ処理による通信量削減
 */
export class SupabaseProvider {
  public doc: Y.Doc
  public awareness: any = null  // 将来の拡張用（現在は未使用）
  public persistence: IndexeddbPersistence | null = null
  private supabase: SupabaseClient
  private channel: RealtimeChannel | null = null
  private documentId: string
  private realtimeSynced = false
  private persistenceSynced = false
  private dbSynced = false
  private updateListenerAttached = false
  private broadcaster: BatchedBroadcaster
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private readonly SAVE_DEBOUNCE = 2000 // 2秒後にDBへ保存
  private lastSavedStateVector: Uint8Array | null = null

  constructor(documentId: string, doc: Y.Doc, supabase: SupabaseClient) {
    this.documentId = documentId
    this.doc = doc
    this.supabase = supabase
    this.broadcaster = new BatchedBroadcaster()

    // 1. IndexedDB で永続化（オフライン対応・即座に表示）
    this.persistence = new IndexeddbPersistence(documentId, doc)
    this.persistence.whenSynced.then(() => {
      this.persistenceSynced = true
      // 2. バックグラウンドで DB と同期
      this.syncWithDatabase()
    })

    this.connect()
  }

  /**
   * DB から Y.js 状態を読み込み、ローカルとマージ
   */
  private async syncWithDatabase() {
    try {
      const { data, error } = await this.supabase
        .from('documents')
        .select('yjs_state')
        .eq('id', this.documentId)
        .single()

      if (error) {
        console.warn('Failed to load yjs_state from DB:', error)
        return
      }

      if (data?.yjs_state) {
        // base64 エンコードされた bytea を Uint8Array に変換
        const stateArray = this.base64ToUint8Array(data.yjs_state)
        if (stateArray.length > 0) {
          // CRDT マージ：ローカルと DB の状態を統合
          Y.applyUpdate(this.doc, stateArray, 'db-sync')
          // DB から状態を読み込めた場合のみ lastSavedStateVector を設定
          this.lastSavedStateVector = Y.encodeStateVector(this.doc)
        }
      }

      this.dbSynced = true

      // DB に状態がない場合（新規 or 未保存）、ローカル状態があれば即座に保存
      if (!this.lastSavedStateVector) {
        const localState = Y.encodeStateAsUpdate(this.doc)
        if (localState.length > 2) {  // 空でない場合のみ
          this.saveToDatabase()
        }
      }
    } catch (err) {
      console.error('Error syncing with database:', err)
    }
  }

  /**
   * DB に Y.js 状態を保存（デバウンス付き）
   */
  private scheduleSaveToDatabase() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
    }

    this.saveTimer = setTimeout(() => {
      this.saveToDatabase()
    }, this.SAVE_DEBOUNCE)
  }

  /**
   * DB に Y.js 状態を保存
   */
  private async saveToDatabase() {
    try {
      // 差分があるかチェック（State Vector で比較）
      const currentStateVector = Y.encodeStateVector(this.doc)
      if (this.lastSavedStateVector) {
        const diff = Y.diffUpdate(
          Y.encodeStateAsUpdate(this.doc),
          this.lastSavedStateVector
        )
        // 差分がなければスキップ
        if (diff.length <= 2) {
          return
        }
      }

      const state = Y.encodeStateAsUpdate(this.doc)
      const base64State = this.uint8ArrayToBase64(state)

      const { error } = await this.supabase
        .from('documents')
        .update({ yjs_state: base64State })
        .eq('id', this.documentId)

      if (error) {
        console.error('Failed to save yjs_state to DB:', error)
      } else {
        this.lastSavedStateVector = currentStateVector
      }
    } catch (err) {
      console.error('Error saving to database:', err)
    }
  }

  private connect() {
    this.channel = this.supabase.channel(`document:${this.documentId}`, {
      config: {
        broadcast: { self: false },
      },
    })

    this.broadcaster.setChannel(this.channel)

    // 他のクライアントからの更新を受信
    this.channel.on('broadcast', { event: 'update' }, ({ payload }) => {
      if (payload.update) {
        const update = new Uint8Array(payload.update)
        Y.applyUpdate(this.doc, update, this)
      }
    })

    // State Vector を使った差分同期リクエストを受信
    this.channel.on('broadcast', { event: 'sync-request' }, ({ payload }) => {
      if (payload.stateVector) {
        // 相手の State Vector との差分のみを計算して送信
        const remoteStateVector = new Uint8Array(payload.stateVector)
        const diff = Y.encodeStateAsUpdate(this.doc, remoteStateVector)
        this.channel?.send({
          type: 'broadcast',
          event: 'sync-response',
          payload: {
            update: Array.from(diff),
            clientId: payload.clientId,
            stateVector: Array.from(Y.encodeStateVector(this.doc)),
          },
        })
      } else {
        // 後方互換: State Vector がない場合は全状態を送信
        const state = Y.encodeStateAsUpdate(this.doc)
        this.channel?.send({
          type: 'broadcast',
          event: 'sync-response',
          payload: { update: Array.from(state), clientId: payload.clientId },
        })
      }
    })

    // 同期レスポンスを受信
    this.channel.on('broadcast', { event: 'sync-response' }, ({ payload }) => {
      if (payload.update) {
        const update = new Uint8Array(payload.update)
        Y.applyUpdate(this.doc, update, this)
        this.realtimeSynced = true
      }
    })

    this.channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        this.realtimeSynced = true

        // State Vector を含めた同期リクエストを送信
        const clientId = Math.random().toString(36).substring(7)
        const stateVector = Y.encodeStateVector(this.doc)
        await this.channel?.send({
          type: 'broadcast',
          event: 'sync-request',
          payload: {
            clientId,
            stateVector: Array.from(stateVector),
          },
        })

        // ローカル状態の差分を送信（State Vector ベース）
        // 他のクライアントがいれば sync-response で受け取った後にマージされる
        const localUpdate = Y.encodeStateAsUpdate(this.doc)
        if (localUpdate.length > 2) {  // 空でない場合のみ
          await this.channel?.send({
            type: 'broadcast',
            event: 'update',
            payload: { update: Array.from(localUpdate) },
          })
        }

        if (!this.updateListenerAttached) {
          this.doc.on('update', this.handleUpdate)
          this.updateListenerAttached = true
        }
      } else if (status === 'CLOSED' || status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
        this.realtimeSynced = false
      }
    })
  }

  private handleUpdate = (update: Uint8Array, origin: any) => {
    // 自分の変更のみブロードキャスト（他から受信したものは除外）
    if (origin !== this && origin !== 'db-sync') {
      // バッチ処理で送信
      this.broadcaster.queue(update)
      // DB への保存をスケジュール
      this.scheduleSaveToDatabase()
    }
  }

  public disconnect() {
    // 保存タイマーがあればキャンセルして即座に保存
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    // 未保存の変更を DB に保存
    this.saveToDatabase()

    // ブロードキャスターを破棄（残りの更新をflush）
    this.broadcaster.destroy()

    if (this.channel) {
      this.doc.off('update', this.handleUpdate)
      this.updateListenerAttached = false
      this.supabase.removeChannel(this.channel)
      this.channel = null
    }
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

  public isDatabaseSynced(): boolean {
    return this.dbSynced
  }

  public async destroyPersistence() {
    const anyIdx = IndexeddbPersistence as unknown as {
      clearData?: (name: string) => Promise<void> | void
    }
    if (typeof anyIdx.clearData === 'function') {
      await anyIdx.clearData(this.documentId)
      return
    }
    try {
      const tempDoc = new Y.Doc()
      const temp = new IndexeddbPersistence(this.documentId, tempDoc)
      if (typeof (temp as any).clearData === 'function') {
        await (temp as any).clearData()
      }
      await temp.destroy()
    } catch (error) {
      console.warn('Failed to destroy IndexedDB persistence:', error)
    }
  }

  // ユーティリティ: Uint8Array <-> Base64 変換
  private uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }

  private base64ToUint8Array(base64: string): Uint8Array {
    try {
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
      }
      return bytes
    } catch {
      return new Uint8Array(0)
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
    if (typeof (temp as any).clearData === 'function') {
      await (temp as any).clearData()
    }
    await temp.destroy()
  } catch (_) {
    // no-op
  }
}
