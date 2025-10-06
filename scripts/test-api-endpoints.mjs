#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { resolve } from 'path'
import { ProxyAgent, setGlobalDispatcher } from 'undici'

// Load .env.local
dotenv.config({ path: resolve(process.cwd(), '.env.local') })

// Set global proxy dispatcher for undici
const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY
if (proxyUrl) {
  const dispatcher = new ProxyAgent(proxyUrl)
  setGlobalDispatcher(dispatcher)
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// API base URL (use Vercel deployment or local)
const API_BASE = process.env.API_BASE_URL || 'https://nousync.vercel.app/api'

async function getAuthToken() {
  const { data } = await supabase.auth.getSession()
  if (!data.session) {
    console.log('⚠️  Not authenticated. Please login first.')
    console.log('   Run: node scripts/auth-login.mjs')
    process.exit(1)
  }
  return data.session.access_token
}

async function testAPI(endpoint, options = {}) {
  const token = await getAuthToken()
  const url = `${API_BASE}${endpoint}`

  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  const contentType = response.headers.get('content-type')
  let data
  if (contentType && contentType.includes('application/json')) {
    data = await response.json()
  } else {
    data = await response.text()
  }

  return { status: response.status, data }
}

async function main() {
  console.log('🧪 Testing API Endpoints...\n')

  try {
    // Test 1: Health check
    console.log('📊 Test 1: Health Check')
    const health = await testAPI('/health')
    console.log('  Status:', health.status)
    console.log('  Response:', health.data)
    console.log()

    // Test 2: Projects - ensure default
    console.log('📊 Test 2: Ensure Default Project')
    const defaultProject = await testAPI('/projects?action=ensureDefault')
    console.log('  Status:', defaultProject.status)
    console.log('  Response:', JSON.stringify(defaultProject.data, null, 2))
    console.log()

    // Test 3: Projects - list all
    console.log('📊 Test 3: List Projects')
    const projects = await testAPI('/projects')
    console.log('  Status:', projects.status)
    console.log('  Count:', projects.data?.data?.length || 0)
    console.log()

    // Test 4: Documents - list all
    console.log('📊 Test 4: List Documents')
    const documents = await testAPI('/documents')
    console.log('  Status:', documents.status)
    console.log('  Count:', documents.data?.data?.length || 0)
    console.log()

    // Test 5: Documents - create
    console.log('📊 Test 5: Create Document')
    const newDoc = await testAPI('/documents', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Test Document',
        content: 'This is a test document created by the API test script.',
        tags: ['test', 'api'],
      }),
    })
    console.log('  Status:', newDoc.status)
    console.log('  Document ID:', newDoc.data?.data?.id)
    console.log()

    const docId = newDoc.data?.data?.id

    if (docId && process.env.OPENAI_API_KEY) {
      // Test 6: Embeddings - create
      console.log('📊 Test 6: Create Embeddings')
      const embeddings = await testAPI('/embeddings', {
        method: 'POST',
        body: JSON.stringify({ documentId: docId }),
      })
      console.log('  Status:', embeddings.status)
      console.log('  Response:', embeddings.data)
      console.log()

      // Test 7: RAG Search
      console.log('📊 Test 7: RAG Search')
      const ragSearch = await testAPI('/rag-search?q=test')
      console.log('  Status:', ragSearch.status)
      console.log('  Results:', ragSearch.data?.data?.length || 0)
      if (ragSearch.data?.data?.[0]) {
        console.log('  Top result:', ragSearch.data.data[0].title)
        console.log('  Similarity:', ragSearch.data.data[0].similarity)
      }
      console.log()

      // Test 8: Chat (with RAG)
      console.log('📊 Test 8: Chat with RAG')
      const chat = await testAPI('/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: [
            { role: 'user', content: 'What is the test document about?' },
          ],
          useRag: true,
        }),
      })
      console.log('  Status:', chat.status)
      console.log('  Response:', chat.data?.data?.message?.content?.substring(0, 100) + '...')
      console.log()

      // Test 9: Delete document
      console.log('📊 Test 9: Delete Document')
      const deleteDoc = await testAPI(`/documents?id=${docId}`, {
        method: 'DELETE',
      })
      console.log('  Status:', deleteDoc.status)
      console.log()
    } else {
      console.log('⚠️  Skipping embedding/RAG/chat tests (no OPENAI_API_KEY or document creation failed)\n')
    }

    console.log('✅ All tests completed')
  } catch (err) {
    console.error('❌ Error:', err.message)
    if (err.stack) console.error(err.stack)
    process.exit(1)
  }
}

main()
