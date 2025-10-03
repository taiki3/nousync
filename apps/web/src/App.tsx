import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

export default function App() {
  const [userId, setUserId] = useState<string | null>(null)
  const [health, setHealth] = useState<any>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])

  useEffect(() => {
    const sub = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null)
    })
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user?.id ?? null))
    return () => sub.data.subscription.unsubscribe()
  }, [])

  const signIn = async () => {
    const email = prompt('メールアドレスを入力してください:')
    if (!email) return
    const { error } = await supabase.auth.signInWithOtp({ email })
    if (error) alert(error.message)
    else alert('メールを確認してください')
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const callHealth = async () => {
    const token = (await supabase.auth.getSession()).data.session?.access_token
    const resp = await fetch((import.meta.env.VITE_API_URL || '') + '/api/health', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    setHealth(await resp.json())
  }

  const search = async () => {
    const token = (await supabase.auth.getSession()).data.session?.access_token
    const resp = await fetch(((import.meta.env.VITE_API_URL || '') + '/api/search') + `?q=${encodeURIComponent(query)}` , {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    const body = await resp.json()
    if (body.status === 'success') setResults(body.data)
    else alert(body.error || '検索に失敗しました')
  }

  return (
    <div style={{ fontFamily: 'sans-serif', padding: 24 }}>
      <h1>Nousync (Supabase + Vercel)</h1>
      <div style={{ marginBottom: 16 }}>
        {userId ? (
          <>
            <span>ログイン中: {userId}</span>
            <button onClick={signOut} style={{ marginLeft: 8 }}>ログアウト</button>
          </>
        ) : (
          <button onClick={signIn}>メールでログイン</button>
        )}
      </div>

      <div style={{ marginBottom: 16 }}>
        <button onClick={callHealth}>/api/health</button>
        <pre style={{ background: '#f6f6f6', padding: 8 }}>{health ? JSON.stringify(health, null, 2) : '未取得'}</pre>
      </div>

      <div>
        <h3>全文検索（pg_trgmフォールバック）</h3>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="キーワード" />
        <button onClick={search} style={{ marginLeft: 8 }}>検索</button>
        <ul>
          {results.map((r) => (
            <li key={r.id}>
              <strong>{r.title}</strong>
              <div style={{ color: '#555' }}>{r.snippet}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
