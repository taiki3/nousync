# TDD開発ガイドライン

## 基本原則

TDD（Test-Driven Development）は「テストファースト」で開発を進める手法です。

### 🔄 Red-Green-Refactorサイクル

```
1. 🔴 Red:    失敗するテストを書く
2. 🟢 Green:  最小限の実装でテストを通す
3. 🔵 Refactor: コードを改善する（テストは通ったまま）
```

## 実装手順

### Step 0: 要件定義

```markdown
## 機能名: CollaborativeTextEditor

### 要件
1. Y.jsでCRDTベースの同時編集
2. Supabase Realtimeで同期
3. IndexedDBでオフライン対応
4. ドキュメント切り替え対応
5. 500msのデバウンスでAPI保存

### エッジケース
- ドキュメント高速切り替え
- debounce中のアンマウント
- IndexedDB読み込み中の切り替え
- オフライン編集の重複防止
```

### Step 1: テストケースの洗い出し

要件からテストケースを列挙:

```typescript
// TEST 1: 基本機能
it('should render document content')

// TEST 2: 初期化
it('should initialize Y.Doc on mount')

// TEST 3: クリーンアップ
it('should cleanup Y.Doc on unmount')

// TEST 4: 最適化
it('should NOT reinitialize when document object changes with same ID')

// TEST 5: 切り替え
it('should reinitialize when switching to different document')

// TEST 6: 非同期処理
it('should wait for IndexedDB sync before inserting content')

// TEST 7: エッジケース（重要！）
it('should cancel stale whenSynced callback on document switch')
it('should debounce API calls by 500ms')
it('should flush debounced save on unmount')
it('should sync tags when document.tags changes')
it('should NOT destroy persistence on disconnect')

// TEST 12: 統合テスト
it('should sync edits between two clients')
```

### Step 2: テストファイル作成

```bash
# テストファイルを先に作る
touch apps/web/src/components/ComponentName.test.tsx
```

### Step 3: 1つ目のテストを書く

```typescript
describe('ComponentName', () => {
  it('should render content', () => {
    render(<ComponentName data="test" />)
    expect(screen.getByText('test')).toBeInTheDocument()
  })
})
```

### Step 4: テスト実行（Red）

```bash
pnpm test -- ComponentName.test.tsx

# 結果: ❌ FAIL（コンポーネントがまだ存在しない）
```

### Step 5: 最小限の実装（Green）

```typescript
export default function ComponentName({ data }: Props) {
  return <div>{data}</div>
}
```

```bash
pnpm test -- ComponentName.test.tsx

# 結果: ✅ PASS
```

### Step 6: 次のテストを書く

```typescript
it('should handle click event', () => {
  const onClick = vi.fn()
  render(<ComponentName data="test" onClick={onClick} />)

  fireEvent.click(screen.getByText('test'))

  expect(onClick).toHaveBeenCalled()
})
```

### Step 7: 繰り返す

1つずつテストを追加 → 実装 → 通す → 次へ

## テストの種類

### Unit Tests（単体テスト）

1つの関数/コンポーネントの動作を検証:

```typescript
describe('calculateDelta', () => {
  it('should detect insertion at start', () => {
    const result = calculateDelta('abc', 'Xabc', 0)
    expect(result).toEqual({ start: 0, delete: 0, insert: 'X' })
  })
})
```

### Integration Tests（統合テスト）

複数のコンポーネント/モジュールの連携を検証:

```typescript
it('should sync between two editor instances', async () => {
  const { container: editor1 } = render(<Editor document={doc} />)
  const { container: editor2 } = render(<Editor document={doc} />)

  await userEvent.type(editor1.querySelector('textarea'), 'Hello')

  await waitFor(() => {
    expect(editor2.querySelector('textarea').value).toContain('Hello')
  })
})
```

### Edge Case Tests（エッジケース）

**最重要！** ここで今回のバグを防げた:

```typescript
describe('Edge Cases', () => {
  it('should cancel stale callbacks on rapid document switch', async () => {
    // ドキュメントA選択 → IndexedDB読み込み開始
    // ドキュメントB選択 → Aのコールバックは実行されない
  })

  it('should flush debounced save on unmount', async () => {
    // 入力後200ms → アンマウント → 即座に保存
  })

  it('should not destroy persistence on normal disconnect', () => {
    // disconnect()でpersistence.destroy()が呼ばれない
  })
})
```

## モックとスタブ

### Vitest でのモック

```typescript
// モジュール全体をモック
vi.mock('../lib/yjs-supabase-provider', () => ({
  SupabaseProvider: vi.fn().mockImplementation(() => ({
    doc: {},
    persistence: { whenSynced: Promise.resolve() },
    disconnect: vi.fn(),
    isSynced: vi.fn(() => true)
  }))
}))

// 関数をモック
const mockOnUpdate = vi.fn()

// タイマーをモック
vi.useFakeTimers()
vi.advanceTimersByTime(500)
vi.useRealTimers()
```

## カバレッジ目標

```bash
pnpm test -- --coverage

# 目標:
# - Statements: 80%以上
# - Branches: 75%以上
# - Functions: 80%以上
# - Lines: 80%以上
```

## PR前チェックリスト

```markdown
## 実装完了チェック
- [ ] 全ての要件にテストがある
- [ ] エッジケーステストがある
- [ ] 単体テスト実装（カバレッジ80%以上）
- [ ] 統合テスト実装（主要フロー）
- [ ] 型エラーゼロ（strict mode）
- [ ] 全テスト通過
- [ ] コンソールエラー/警告ゼロ

## ドキュメント
- [ ] コンポーネントのJSDoc
- [ ] 複雑なロジックへのコメント
- [ ] README更新（必要に応じて）

## レビュー前セルフチェック
- [ ] 非同期処理のクリーンアップ確認
- [ ] クロージャキャプチャの確認
- [ ] refの適切な使用
- [ ] メモリリークチェック
```

## 段階的な実装

大きな機能は段階的に:

```bash
# Phase 1: 基本機能（テスト付き）
git commit -m "feat: add basic text editing"

# Phase 2: 同期機能（テスト付き）
git commit -m "feat: add realtime sync"

# Phase 3: オフライン対応（テスト付き）
git commit -m "feat: add offline support with IndexedDB"

# Phase 4: エッジケース対応（テスト付き）
git commit -m "fix: handle document switching edge cases"
```

## よくある間違い

### ❌ 実装を先に書く

```typescript
// 間違い: 先に実装を書いてしまう
export default function Component() {
  // たくさんのコード...
}

// 後からテストを書こうとするが、テストしにくい構造になっている
```

### ✅ テストを先に書く

```typescript
// 正しい: テストを先に書く
it('should do something', () => {
  // このテストを通すにはどういう実装が必要か考える
})

// 実装はテストが求める最小限のコード
export default function Component() {
  // テストを通す最小限のコード
}
```

## テンプレート

### コンポーネントテスト

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ComponentName from './ComponentName'

describe('ComponentName', () => {
  let mockProps: ComponentProps

  beforeEach(() => {
    mockProps = {
      // デフォルトのprops
    }
  })

  describe('Basic Functionality', () => {
    it('should render', () => {
      render(<ComponentName {...mockProps} />)
      expect(screen.getByText('...')).toBeInTheDocument()
    })
  })

  describe('User Interactions', () => {
    it('should handle click', async () => {
      const onClick = vi.fn()
      render(<ComponentName {...mockProps} onClick={onClick} />)

      await userEvent.click(screen.getByRole('button'))

      expect(onClick).toHaveBeenCalled()
    })
  })

  describe('Edge Cases', () => {
    it('should handle rapid state changes', async () => {
      // エッジケースのテスト
    })
  })
})
```

### ユーティリティ関数テスト

```typescript
import { describe, it, expect } from 'vitest'
import { utilityFunction } from './utils'

describe('utilityFunction', () => {
  it('should handle normal input', () => {
    expect(utilityFunction('abc')).toBe('ABC')
  })

  it('should handle empty input', () => {
    expect(utilityFunction('')).toBe('')
  })

  it('should handle null/undefined', () => {
    expect(utilityFunction(null)).toBe('')
    expect(utilityFunction(undefined)).toBe('')
  })
})
```

## 参考資料

- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/react)
- [Test-Driven Development by Kent Beck](https://www.amazon.com/Test-Driven-Development-Kent-Beck/dp/0321146530)

## まとめ

**TDDの最大のメリット:**
- バグを実装前に発見できる
- リファクタリングが安全にできる
- ドキュメントとしても機能する
- レビュー指摘が激減する

**今回のPR #7の場合:**
全ての問題（5回のレビュー指摘）をテストで事前に防げた可能性が高い。
