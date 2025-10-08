import { Pool } from 'pg'

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  // Vercel Serverless用の最適化
  max: 1,  // サーバーレス環境では接続数を最小限に
  idleTimeoutMillis: 1000,  // アイドル接続を早めに閉じる
  connectionTimeoutMillis: 3000,  // 接続タイムアウトを短めに
})

export async function withRls<T = any>(
  userId: string,
  fn: (client: any) => Promise<T>,
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // JWT claimsを先に設定してからROLEを変更
    // SET LOCALはプレースホルダーを使えないので、値を直接埋め込む
    // SQLインジェクションを防ぐため、userIdを適切にエスケープ
    const claims = JSON.stringify({ sub: userId, role: 'authenticated' })
    const escapedClaims = claims.replace(/'/g, "''")
    await client.query(`SET LOCAL request.jwt.claims = '${escapedClaims}'`)
    await client.query('SET LOCAL ROLE authenticated')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {}
    throw e
  } finally {
    client.release()
  }
}

// 読み取り専用の軽量版（トランザクション不要）
export async function withRlsRead<T = any>(
  userId: string,
  fn: (client: any) => Promise<T>,
): Promise<T> {
  const client = await pool.connect()
  try {
    // トランザクションなしでSET LOCALを使用
    const claims = JSON.stringify({ sub: userId, role: 'authenticated' })
    const escapedClaims = claims.replace(/'/g, "''")

    // セッション内でのみ有効な設定
    await client.query(`SET SESSION request.jwt.claims = '${escapedClaims}'`)
    await client.query('SET SESSION ROLE authenticated')

    const result = await fn(client)

    // セッションをリセット
    await client.query('RESET ROLE')

    return result
  } finally {
    client.release()
  }
}
