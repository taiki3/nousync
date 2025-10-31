import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getUserIdFromRequest } from '../../../lib/auth.js'
import { withRls } from '../../../lib/db.js'
import { AIProvider } from '../../../lib/ai-providers.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      res.status(405).end('Method Not Allowed')
      return
    }

    const userId = await getUserIdFromRequest(req)
    const conversationId = req.query.conversationId as string

    if (!conversationId) {
      res.status(400).json({ status: 'error', error: 'conversationId is required' })
      return
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
    const {
      topic,
      existingDocuments = [],
      depth = 'medium',
      modelId = 'gemini-2.5-flash'
    } = body

    if (!topic) {
      res.status(400).json({ status: 'error', error: 'Topic is required' })
      return
    }

    // Check conversation exists
    await withRls(userId, async (client) => {
      const { rowCount } = await client.query(
        'SELECT 1 FROM conversations WHERE id = $1',
        [conversationId]
      )

      if (rowCount === 0) {
        throw Object.assign(new Error('Conversation not found'), { statusCode: 404 })
      }
    })

    // Build context from existing documents if provided
    let existingContext = ''
    if (existingDocuments.length > 0) {
      const docs = await withRls(userId, async (client) => {
        const { rows } = await client.query(
          `SELECT title, content FROM documents WHERE id = ANY($1)`,
          [existingDocuments]
        )
        return rows
      })

      if (docs.length > 0) {
        existingContext = '\n\nExisting related documents for context:\n'
        docs.forEach((doc: any) => {
          existingContext += `\n### ${doc.title}\n${doc.content.substring(0, 500)}...\n`
        })
      }
    }

    // Validate model ID
    if (modelId !== 'gemini-2.5-flash' && modelId !== 'gemini-2.5-pro') {
      res.status(400).json({
        status: 'error',
        error: 'Invalid model ID. Must be gemini-2.5-flash or gemini-2.5-pro'
      })
      return
    }

    // Generate research using Gemini with Google Search
    const { content: researchContent, sources } = await AIProvider.createResearchWithGemini(
      topic,
      depth as 'shallow' | 'medium' | 'deep',
      modelId as 'gemini-2.5-flash' | 'gemini-2.5-pro',
      existingContext || undefined
    )

    // Append sources to the research content
    let finalContent = researchContent
    if (sources.length > 0) {
      finalContent += '\n\n## Sources\n\n'
      sources.forEach((source, index) => {
        finalContent += `${index + 1}. [${source.title}](${source.url})\n`
      })
    }

    // Extract title from the research content (first heading or use topic)
    const titleMatch = finalContent.match(/^#\s+(.+)$/m)
    const title = titleMatch ? titleMatch[1] : `Research: ${topic}`

    // Generate a summary (first paragraph or extract from content)
    const summaryMatch = finalContent.match(/(?:##?\s+(?:Executive Summary|Summary|Introduction)[^\n]*\n+)([^\n#]+(?:\n[^\n#]+)*)/i)
    const summary = summaryMatch
      ? summaryMatch[1].trim().substring(0, 500)
      : finalContent.substring(0, 500).trim()

    // Save research as a document
    const documentId = await withRls(userId, async (client) => {
      const { rows } = await client.query(
        `INSERT INTO documents (user_id, title, content, summary, tags)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [userId, title, finalContent, summary, ['research', 'ai-generated', depth]]
      )

      // Link document to conversation
      await client.query(
        `INSERT INTO conversation_documents (conversation_id, document_id)
         VALUES ($1, $2)
         ON CONFLICT (conversation_id, document_id) DO NOTHING`,
        [conversationId, rows[0].id]
      )

      // Update conversation timestamp
      await client.query(
        'UPDATE conversations SET updated_at = NOW() WHERE id = $1',
        [conversationId]
      )

      return rows[0].id
    })

    res.status(200).json({
      status: 'success',
      data: {
        documentId,
        title,
        summary
      }
    })

  } catch (err: any) {
    console.error('Research handler error:', err)
    const status = err?.statusCode || 500
    res.status(status).json({
      status: 'error',
      error: err?.message || 'Failed to generate research',
      details: err?.stack
    })
  }
}
