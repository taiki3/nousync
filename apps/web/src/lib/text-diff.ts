/**
 * テキストの差分を計算するユーティリティ
 * Y.js の操作に変換するために使用
 */

export interface TextDelta {
  start: number
  delete: number
  insert: string
}

/**
 * 2つのテキスト間の差分を計算
 * Y.Text の insert/delete 操作に変換するための差分を返す
 */
export function calculateDelta(oldText: string, newText: string): TextDelta {
  let start = 0
  let deleteCount = 0
  let insertText = ''

  // 前方から一致する部分を見つける
  while (start < oldText.length && start < newText.length && oldText[start] === newText[start]) {
    start++
  }

  // 後方から一致する部分を見つける
  let oldEnd = oldText.length
  let newEnd = newText.length
  while (
    oldEnd > start &&
    newEnd > start &&
    oldText[oldEnd - 1] === newText[newEnd - 1]
  ) {
    oldEnd--
    newEnd--
  }

  deleteCount = oldEnd - start
  insertText = newText.substring(start, newEnd)

  return { start, delete: deleteCount, insert: insertText }
}
