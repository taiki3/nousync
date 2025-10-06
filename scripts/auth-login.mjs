#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { resolve } from 'path'
import { ProxyAgent, setGlobalDispatcher } from 'undici'

// Load .env.local
dotenv.config({ path: resolve(process.cwd(), '.env.local') })

// Set global proxy dispatcher
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

console.log('🔐 Checking authentication status...\n')

const { data } = await supabase.auth.getSession()

if (data.session) {
  console.log('✅ Already authenticated')
  console.log('   User:', data.session.user.email)
  console.log('   Expires:', new Date(data.session.expires_at * 1000).toLocaleString())
  console.log('\n💡 Access Token:', data.session.access_token.substring(0, 50) + '...')
} else {
  console.log('⚠️  Not authenticated')
  console.log('\n📝 To authenticate:')
  console.log('   1. Open https://nousync.vercel.app in your browser')
  console.log('   2. Login with Google')
  console.log('   3. Open browser console and run:')
  console.log('      supabase.auth.getSession().then(d => console.log(d.data.session.access_token))')
  console.log('   4. Copy the token and set it as SUPABASE_ACCESS_TOKEN in .env.local')
}
