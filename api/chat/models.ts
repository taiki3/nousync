import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getUserIdFromRequest } from '../lib/auth.js'
import { AIProvider } from '../lib/ai-providers.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // 認証チェック
    await getUserIdFromRequest(req)

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      res.status(405).end('Method Not Allowed')
      return
    }

    // AIProviderから利用可能なモデル一覧を取得
    const models = await AIProvider.getAvailableModels()

    // キャッシュを無効化するヘッダーを設定
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Expires', '0')

    res.status(200).json({
      status: 'success',
      data: { models },
    })
  } catch (err: any) {
    const status = err?.statusCode || 500
    res.status(status).json({ status: 'error', error: err?.message || 'Internal error' })
  }
}
