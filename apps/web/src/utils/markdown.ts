/**
 * Markdownコンテンツから最初の見出し（H1またはH2）を抽出
 * @param content Markdownコンテンツ
 * @returns 抽出されたタイトル、見つからない場合は"No title"
 */
export function extractMarkdownTitle(content: string): string {
  if (!content) return 'No title'

  // 最初の行から数行をチェック（パフォーマンスのため）
  const lines = content.split('\n').slice(0, 10)

  for (const line of lines) {
    const trimmed = line.trim()

    // # または ## で始まる見出しを探す
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