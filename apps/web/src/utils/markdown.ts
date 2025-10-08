/**
 * Markdownコンテンツから最初の見出し（H1またはH2）を抽出
 * ATX形式（# Title）とSetext形式（Title\n====）の両方に対応
 * @param content Markdownコンテンツ
 * @returns 抽出されたタイトル、見つからない場合は"No title"
 */
export function extractMarkdownTitle(content: string): string {
  if (!content) return 'No title'

  const lines = content.split('\n')
  const linesToCheck = Math.min(lines.length, 15) // Setext形式のため少し多めに

  for (let i = 0; i < linesToCheck; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // 空行はスキップ
    if (!trimmed) continue

    // 次の行を取得（Setext形式のチェック用）
    const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : ''

    // Setext形式のH1見出し（次の行が ====）
    if (nextLine && /^=+$/.test(nextLine) && nextLine.length >= 3) {
      return trimmed
    }

    // Setext形式のH2見出し（次の行が ----）
    if (nextLine && /^-+$/.test(nextLine) && nextLine.length >= 3) {
      return trimmed
    }

    // ATX形式：# または ## で始まる見出しを探す
    if (trimmed.startsWith('#')) {
      // ###以降は無視（H3以降は対象外）
      if (trimmed.startsWith('###')) continue

      // # または ## を削除してタイトルを取得
      const title = trimmed.replace(/^##?\s*/, '').trim()
      if (title) return title
    }
  }

  return 'No title'
}

/**
 * ドキュメントのタイトルを取得（DBのtitleフィールドまたはMarkdownから）
 * @param document ドキュメント
 * @returns 表示用タイトル
 */
export function getDocumentTitle(document: { title: string; content: string }): string {
  // DBに保存されているタイトルが「新しいドキュメント」でない場合はそれを使用
  if (document.title && document.title !== '新しいドキュメント') {
    return document.title
  }

  // それ以外の場合はコンテンツから抽出
  return extractMarkdownTitle(document.content)
}