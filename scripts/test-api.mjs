#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { resolve } from 'path'
import { ProxyAgent, setGlobalDispatcher } from 'undici'

// Load .env.local
dotenv.config({ path: resolve(process.cwd(), '.env.local') })

// Set global proxy dispatcher for undici (which Node.js fetch uses)
const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY
if (proxyUrl) {
  const dispatcher = new ProxyAgent(proxyUrl)
  setGlobalDispatcher(dispatcher)
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env.local')
  process.exit(1)
}

console.log('🔧 Proxy settings:')
console.log('  HTTP_PROXY:', process.env.HTTP_PROXY || '(none)')
console.log('  HTTPS_PROXY:', process.env.HTTPS_PROXY || '(none)')
console.log()

const supabase = createClient(supabaseUrl, supabaseKey)

async function testSupabase() {
  console.log('🧪 Testing Supabase connection...')
  console.log('URL:', supabaseUrl)
  console.log()

  // Test 1: Get tables info
  console.log('📊 Test 1: Check tables')
  try {
    const { data, error } = await supabase
      .from('documents')
      .select('count', { count: 'exact', head: true })

    if (error) {
      console.log('  ⚠️  Error:', error.message)
      console.log('  Details:', JSON.stringify(error, null, 2))
    } else {
      console.log('  ✓ Documents table exists')
      console.log('  Count:', data?.length || 0)
    }
  } catch (err) {
    console.error('  ❌ Error:', err.message)
    console.error('  Stack:', err.stack)
    if (err.cause) {
      console.error('  Cause:', err.cause)
    }
  }
  console.log()

  // Test 2: Check projects table
  console.log('📊 Test 2: Check projects table')
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('count', { count: 'exact', head: true })

    if (error) {
      console.log('  ⚠️  Error:', error.message)
    } else {
      console.log('  ✓ Projects table exists')
    }
  } catch (err) {
    console.error('  ❌ Error:', err.message)
  }
  console.log()

  // Test 3: Auth test (should fail without login)
  console.log('🔐 Test 3: Auth state')
  const { data: { session } } = await supabase.auth.getSession()
  if (session) {
    console.log('  ✓ Logged in as:', session.user.email)
    console.log('  User ID:', session.user.id)
  } else {
    console.log('  ⚠️  Not logged in (expected)')
  }
}

testSupabase().catch(err => {
  console.error('💥 Fatal error:', err)
  process.exit(1)
})
