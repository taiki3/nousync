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
      modelId = 'gpt-4o'
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

    // Determine research depth and create appropriate prompt
    const depthInstructions = {
      shallow: 'Provide a brief overview with key points (around 300-500 words).',
      medium: 'Provide a comprehensive analysis with detailed information (around 800-1200 words).',
      deep: 'Provide an in-depth, thorough research with multiple perspectives, examples, and references (around 1500-2500 words).'
    }

    const instruction = depthInstructions[depth as keyof typeof depthInstructions] || depthInstructions.medium

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

    // Create research prompt
    const researchPrompt = `You are a research assistant. Create a comprehensive research document on the following topic:

Topic: ${topic}

${instruction}

Structure your response as a well-organized document with:
1. Clear title
2. Executive summary
3. Main sections with headings
4. Key findings and insights
5. Conclusion

${existingContext}

Please provide the research in markdown format.`

    // Generate research using AI
    const models = await AIProvider.getAvailableModels()
    const selectedModel = models.find(m => m.modelId === modelId)

    if (!selectedModel) {
      throw new Error(`Model ${modelId} not found`)
    }

    const messages = [
      { role: 'system' as const, content: 'You are an expert research assistant that creates comprehensive, well-structured research documents.' },
      { role: 'user' as const, content: researchPrompt }
    ]

    const researchContent = await AIProvider.createChatCompletion(
      messages,
      selectedModel.modelId,
      selectedModel.provider
    )

    // Extract title from the research content (first heading or use topic)
    const titleMatch = researchContent.match(/^#\s+(.+)$/m)
    const title = titleMatch ? titleMatch[1] : `Research: ${topic}`

    // Generate a summary (first paragraph or extract from content)
    const summaryMatch = researchContent.match(/(?:##?\s+(?:Executive Summary|Summary|Introduction)[^\n]*\n+)([^\n#]+(?:\n[^\n#]+)*)/i)
    const summary = summaryMatch
      ? summaryMatch[1].trim().substring(0, 500)
      : researchContent.substring(0, 500).trim()

    // Save research as a document
    const documentId = await withRls(userId, async (client) => {
      const { rows } = await client.query(
        `INSERT INTO documents (title, content, tags)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [title, researchContent, ['research', 'ai-generated', depth]]
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
