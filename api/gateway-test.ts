import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const GATEWAY_URL = process.env.CLOUDFLARE_GATEWAY_URL
  const GATEWAY_TOKEN = process.env.CLOUDFLARE_GATEWAY_TOKEN
  const USE_GATEWAY = !!(GATEWAY_URL && GATEWAY_TOKEN)

  const status: any = {
    gateway: {
      enabled: USE_GATEWAY,
      url: GATEWAY_URL ? `${GATEWAY_URL.split('/').slice(0, -2).join('/')}/***` : null
    },
    providers: {
      openai: !!process.env.OPENAI_API_KEY,
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      gemini: !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY)
    }
  }

  // Test Gateway connectivity if enabled
  if (USE_GATEWAY && req.query.test === 'true') {
    try {
      // Test OpenAI through gateway
      if (process.env.OPENAI_API_KEY) {
        const response = await fetch(`${GATEWAY_URL}/openai/models`, {
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'cf-aig-authorization': `Bearer ${GATEWAY_TOKEN}`
          }
        })
        status.tests = status.tests || {}
        status.tests.openai = response.ok ? 'OK' : `Error: ${response.status}`
      }
    } catch (error: any) {
      status.tests = status.tests || {}
      status.tests.error = error.message
    }
  }

  res.status(200).json(status)
}