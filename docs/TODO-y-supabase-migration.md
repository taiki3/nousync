# Realtime 通信量削減計画

## 現状の問題点

現在の `SupabaseProvider` 実装では以下の通信量問題がある：

### 1. 初期同期時の爆発的通信
```
Client A (既存) ─────────────────────────────────────────
Client B (既存) ─────────────────────────────────────────
Client C (新規) ──┬─ sync-request ──────────────────────→
                 │
                 ├─ sync-response (全状態) ←── Client A
                 ├─ sync-response (全状態) ←── Client B
                 └─ update (ローカル状態全体) ─────────→
```
- 新規接続で **全クライアントが全状態を送信**
- N人接続中 → N回の全状態送信

### 2. 差分なしの全状態送信
- `Y.encodeStateAsUpdate(doc)` は全状態をエンコード
- State Vector を使った差分同期をしていない

### 3. 更新の即時ブロードキャスト
- キー入力ごとに即座にブロードキャスト
- デバウンスなし

---

## 改善方針

### Phase 1: State Vector による差分同期

Y.js の State Vector を使って必要な差分のみを送信する。

```typescript
// Before: 全状態を送信
const state = Y.encodeStateAsUpdate(this.doc)

// After: 相手の State Vector との差分のみ
const stateVector = Y.encodeStateVector(this.doc)
// sync-request で stateVector を送信

// 受信側: 差分のみを計算して返す
const diff = Y.encodeStateAsUpdate(this.doc, receivedStateVector)
```

**期待効果**: 初期同期の通信量を大幅削減（特に大きなドキュメント）

### Phase 2: サーバーサイド永続化（単一ソース化）

P2P の sync-request/response を廃止し、サーバー（Supabase DB）を単一ソースにする。

```
┌─────────────────────────────────────────────────────────┐
│                    Supabase DB                          │
│              documents.yjs_state (bytea)                │
└─────────────────────────────────────────────────────────┘
        ↑ save                              ↓ load
        │                                   │
   ┌────┴────┐                         ┌────┴────┐
   │Client A │ ←── Realtime update ──→ │Client B │
   └─────────┘                         └─────────┘
```

**メリット**:
- 新規接続時に DB から1回読み込むだけ
- 他クライアントは差分更新のみ送信
- オフライン復帰時も DB と同期

**実装**:
```sql
-- マイグレーション
ALTER TABLE documents ADD COLUMN yjs_state BYTEA;
```

```typescript
// 初期同期: DB から読み込み
const { data } = await supabase
  .from('documents')
  .select('yjs_state')
  .eq('id', documentId)
  .single()

if (data?.yjs_state) {
  Y.applyUpdate(doc, new Uint8Array(data.yjs_state))
}

// 定期保存 or 変更時保存
const state = Y.encodeStateAsUpdate(doc)
await supabase
  .from('documents')
  .update({ yjs_state: state })
  .eq('id', documentId)
```

### Phase 3: 更新のバッチ処理

細かい更新をまとめて送信。

```typescript
class BatchedBroadcaster {
  private pendingUpdates: Uint8Array[] = []
  private flushTimer: NodeJS.Timeout | null = null
  private readonly BATCH_INTERVAL = 50 // ms

  queue(update: Uint8Array) {
    this.pendingUpdates.push(update)

    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), this.BATCH_INTERVAL)
    }
  }

  private flush() {
    if (this.pendingUpdates.length === 0) return

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
}
```

**期待効果**: 高速タイピング時の通信回数を削減

### Phase 4: 圧縮（オプション）

大きな更新データを圧縮。

```typescript
import { compress, decompress } from 'fflate'

// 送信時
const compressed = compress(update)
if (compressed.length < update.length) {
  payload = { update: Array.from(compressed), compressed: true }
} else {
  payload = { update: Array.from(update) }
}

// 受信時
const data = payload.compressed
  ? decompress(new Uint8Array(payload.update))
  : new Uint8Array(payload.update)
```

---

## タスク一覧

### Phase 1: State Vector 差分同期
- [ ] sync-request に State Vector を含める
- [ ] sync-response で差分のみ返す
- [ ] 接続時のローカル状態送信も差分化
- [ ] テスト更新

### Phase 2: サーバーサイド永続化
- [ ] `documents` テーブルに `yjs_state` カラム追加
- [ ] 初期同期を DB 経由に変更
- [ ] 定期保存 or 変更時保存の実装
- [ ] sync-request/response の廃止（Realtime は差分更新のみ）
- [ ] 既存データのマイグレーション

### Phase 3: バッチ処理
- [ ] `BatchedBroadcaster` クラス実装
- [ ] バッチ間隔の調整（50ms がよいか検証）
- [ ] unmount 時の flush 処理

### Phase 4: 圧縮（優先度低）
- [ ] fflate 導入
- [ ] 圧縮/非圧縮の閾値決定
- [ ] 後方互換性の考慮

---

## 優先順位

1. **Phase 2（サーバーサイド永続化）** - 最も効果が大きい
2. **Phase 1（State Vector）** - Phase 2 と組み合わせて効果的
3. **Phase 3（バッチ処理）** - 追加の最適化
4. **Phase 4（圧縮）** - 必要に応じて

---

## 参考

- [Y.js Docs: Document Updates](https://docs.yjs.dev/api/document-updates)
- [Y.js Docs: State Vector](https://docs.yjs.dev/api/document-updates#state-vector)
- [Supabase Realtime Quotas](https://supabase.com/docs/guides/realtime/quotas)
