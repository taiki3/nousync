# y-supabase 移行計画

## 概要

現在のカスタム `SupabaseProvider` を [y-supabase](https://github.com/AlexDunmow/y-supabase) パッケージに移行する。

## 現状と移行先の比較

| 項目 | 現在の実装 | y-supabase |
|------|-----------|------------|
| リアルタイム同期 | Supabase Broadcast | Supabase Realtime |
| サーバー永続化 | `onDocumentUpdate` コールバック経由 | Supabase テーブルに直接保存 |
| ローカル永続化 | `y-indexeddb` | なし（要併用） |
| Awareness | 未実装 | 対応 |
| 再同期 | sync-request/response 独自プロトコル | `resyncInterval` で定期同期 |

## 注意事項

> ⚠️ y-supabase は開発初期段階。本番利用は非推奨とされている。
> Weekly downloads: ~94、最終更新から1年以上経過。

### 代替案の検討

- **現状維持**: カスタム実装を継続改善
- **@kamick/supabaseprovider**: 別の Supabase provider（同様に本番非推奨）
- **y-websocket + 自前サーバー**: より安定したアプローチだが運用コスト増

---

## 移行タスク

### Phase 1: 準備（完了済み）

- [x] 現在の実装のテスト拡充
  - [x] `SupabaseProvider` ユニットテスト
  - [x] `calculateDelta` テスト
  - [x] 同期エッジケーステスト

### Phase 2: スキーマ変更

- [ ] Supabase テーブルに `document` カラム追加
  ```sql
  ALTER TABLE documents ADD COLUMN yjs_state BYTEA;
  ```
- [ ] Row Level Security (RLS) ポリシー更新
- [ ] マイグレーションスクリプト作成

### Phase 3: 実装

- [ ] y-supabase インストール
  ```bash
  pnpm --filter @nousync/web add y-supabase
  ```

- [ ] Provider 差し替え
  ```typescript
  // Before
  const provider = new SupabaseProvider(documentId, doc, supabase)

  // After
  import { SupabaseProvider } from 'y-supabase'
  const provider = new SupabaseProvider(doc, supabase, {
    channel: documentId,
    id: documentId,
    tableName: 'documents',
    columnName: 'yjs_state',
    resyncInterval: 5000,
  })
  ```

- [ ] IndexedDB 永続化の併用
  ```typescript
  // y-supabase はローカル永続化を持たないので併用
  import { IndexeddbPersistence } from 'y-indexeddb'
  const persistence = new IndexeddbPersistence(documentId, doc)
  ```

- [ ] `onDocumentUpdate` コールバックの廃止または調整
  - y-supabase が直接 DB に保存するため不要になる可能性
  - タグなどの非 CRDT データの保存方法を検討

### Phase 4: 機能追加

- [ ] Awareness 実装（カーソル位置、ユーザー名表示）
  ```typescript
  provider.awareness.setLocalStateField('user', {
    name: user.name,
    color: userColor,
  })
  ```

- [ ] 接続状態 UI の改善
  - `connect`, `disconnect`, `error` イベントの活用

### Phase 5: テスト・検証

- [ ] 既存テストの更新（Provider モックの差し替え）
- [ ] 手動テスト
  - [ ] 複数タブでの同時編集
  - [ ] オフライン → オンライン復帰
  - [ ] 大量テキストの同期性能
  - [ ] 既存ドキュメントの互換性

### Phase 6: 既存データ移行

- [ ] 既存ドキュメントの `content` → `yjs_state` 変換スクリプト
- [ ] 移行中のダウンタイム計画
- [ ] ロールバック手順

---

## API 差分メモ

### イベント

| y-supabase イベント | 用途 |
|---------------------|------|
| `message` | リアルタイム更新受信 |
| `awareness` | ユーザー状態変更 |
| `save` | ローカル変更保存後 |
| `status` | 接続状態変更 |
| `connect` | 接続確立 |
| `error` | エラー発生 |

### オプション

```typescript
interface SupabaseProviderOptions {
  channel: string      // Realtime チャンネル名
  id?: string          // ドキュメント識別子（デフォルト: "id"）
  tableName: string    // Supabase テーブル名
  columnName: string   // Y.Doc 保存カラム名
  resyncInterval?: number | false  // 再同期間隔（デフォルト: 5000ms）
}
```

---

## リスクと対策

| リスク | 対策 |
|--------|------|
| パッケージのメンテナンス停止 | Fork して自前管理、または現状維持 |
| API 破壊的変更 | バージョン固定、テストで検知 |
| 性能問題 | `resyncInterval` 調整、必要に応じて Supabase Realtime 設定見直し |
| オフライン時のデータロス | y-indexeddb 併用で対応 |

---

## 参考リンク

- [y-supabase GitHub](https://github.com/AlexDunmow/y-supabase)
- [Yjs Community: Supabase for yjs](https://discuss.yjs.dev/t/supabase-for-yjs/1480)
- [Supabase Realtime Docs](https://supabase.com/docs/guides/realtime)
