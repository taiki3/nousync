#!/usr/bin/env node
import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
})

async function checkDatabase() {
  try {
    // Database info
    const info = await pool.query('SELECT current_database(), current_user, version()')
    console.log('✅ Database connection successful!')
    console.log('Database:', info.rows[0].current_database)
    console.log('User:', info.rows[0].current_user)
    console.log('Version:', info.rows[0].version.split(' ').slice(0, 2).join(' '))
    console.log()

    // Check tables
    const tables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('projects', 'documents', 'embeddings', 'conversations', 'messages')
      ORDER BY table_name
    `)

    console.log('📊 Tables:')
    if (tables.rows.length === 0) {
      console.log('  ⚠️  No tables found. Please run migrations.')
    } else {
      tables.rows.forEach(row => {
        console.log(`  ✓ ${row.table_name}`)
      })
    }
    console.log()

    // Check extensions
    const extensions = await pool.query(`
      SELECT extname FROM pg_extension
      WHERE extname IN ('pgcrypto', 'vector', 'pg_trgm', 'pgroonga')
      ORDER BY extname
    `)

    console.log('🔌 Extensions:')
    extensions.rows.forEach(row => {
      console.log(`  ✓ ${row.extname}`)
    })

  } catch (err) {
    console.error('❌ Error:', err.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

checkDatabase()
