import { Pool } from 'pg'

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
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
