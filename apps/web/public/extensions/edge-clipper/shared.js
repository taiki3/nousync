;(function () {
  const PLACEHOLDER_API_BASE = '__NOUSYNC_API_BASE__'
  const SUPABASE_URL = '__SUPABASE_URL__'
  const SUPABASE_ANON_KEY = '__SUPABASE_ANON_KEY__'
  const FALLBACK_API_BASE = 'https://nousync.vercel.app/api'
  const DEFAULT_DOCLING_BASE = 'https://docling.kong-atlas.agc.jp'
  const MAX_SELECTION_LENGTH = 10000

  let supabaseClient = null
  let authSubscription = null

  function normalizeBaseUrl(url) {
    if (!url || typeof url !== 'string') {
      return ''
    }
    try {
      const candidate = new URL(url, 'https://nousync.vercel.app')
      return candidate.href.replace(/\/$/, '')
    } catch (_error) {
      return url.replace(/\/$/, '')
    }
  }

  function resolveDefaultApiBase() {
    if (PLACEHOLDER_API_BASE && !PLACEHOLDER_API_BASE.includes('__NOUSYNC_API_BASE__')) {
      return normalizeBaseUrl(PLACEHOLDER_API_BASE)
    }
    return FALLBACK_API_BASE
  }

  const DEFAULT_SETTINGS = Object.freeze({
    apiBaseUrl: resolveDefaultApiBase(),
    doclingBaseUrl: DEFAULT_DOCLING_BASE,
    tags: 'web-clipper',
    projectId: '',
    includeSourceUrl: true,
  })

  const storageArea = (chrome.storage && chrome.storage.sync) || chrome.storage.local

  function storageGet(keys) {
    return new Promise((resolve) => {
      try {
        storageArea.get(keys || null, (result) => resolve(result || {}))
      } catch (_error) {
        resolve({})
      }
    })
  }

  function storageSet(values) {
    return new Promise((resolve, reject) => {
      storageArea.set(values, () => {
        const error = chrome.runtime.lastError
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      })
    })
  }

  async function loadSettings() {
    const stored = await storageGet(null)
    return {
      ...DEFAULT_SETTINGS,
      ...stored,
      apiBaseUrl: normalizeBaseUrl(stored.apiBaseUrl || DEFAULT_SETTINGS.apiBaseUrl),
      doclingBaseUrl: normalizeBaseUrl(stored.doclingBaseUrl || DEFAULT_SETTINGS.doclingBaseUrl),
      tags: typeof stored.tags === 'string' ? stored.tags : DEFAULT_SETTINGS.tags,
      projectId: typeof stored.projectId === 'string' ? stored.projectId.trim() : '',
      includeSourceUrl:
        typeof stored.includeSourceUrl === 'boolean'
          ? stored.includeSourceUrl
          : DEFAULT_SETTINGS.includeSourceUrl,
    }
  }

  async function saveSettings(payload) {
    const normalized = {
      ...payload,
      apiBaseUrl: normalizeBaseUrl(payload.apiBaseUrl || DEFAULT_SETTINGS.apiBaseUrl),
      doclingBaseUrl: normalizeBaseUrl(payload.doclingBaseUrl || DEFAULT_SETTINGS.doclingBaseUrl),
      tags: (payload.tags || DEFAULT_SETTINGS.tags).trim(),
      projectId: (payload.projectId || '').trim(),
      includeSourceUrl:
        typeof payload.includeSourceUrl === 'boolean'
          ? payload.includeSourceUrl
          : DEFAULT_SETTINGS.includeSourceUrl,
    }
    await storageSet(normalized)
    return normalized
  }

  function parseTags(input) {
    if (!input || typeof input !== 'string') {
      return []
    }
    const tokens = input
      .split(/[\s,]+/)
      .map((token) => token.trim())
      .filter(Boolean)
    return Array.from(new Set(tokens))
  }

  async function getActiveTab() {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        resolve(tabs && tabs.length ? tabs[0] : undefined)
      })
    })
  }

  async function requestPageContext(tabId) {
    if (!tabId) {
      return {}
    }
    return new Promise((resolve) => {
      try {
        chrome.tabs.sendMessage(
          tabId,
          { type: 'NOUSYNC_GET_PAGE_CONTEXT' },
          (response) => {
            if (chrome.runtime.lastError) {
              resolve({})
              return
            }
            resolve(response || {})
          },
        )
      } catch (_error) {
        resolve({})
      }
    })
  }

  function ensureHttpUrl(url) {
    if (!url) return ''
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.href
      }
      return ''
    } catch (_error) {
      return ''
    }
  }

  function clampText(value, maxLength) {
    if (!value || typeof value !== 'string') {
      return ''
    }
    if (value.length <= maxLength) {
      return value
    }
    return `${value.slice(0, maxLength)}...`
  }

  function scoreMarkdownCandidate(text) {
    if (!text || typeof text !== 'string') {
      return 0
    }
    let score = 0
    if (/^#\s/m.test(text)) score += 1
    if (/[*_]{2}/.test(text)) score += 0.5
    if (/\n\n/.test(text)) score += 0.5
    if (text.length > 5000) score += 0.5
    return score
  }

  async function downloadTextAsset(url, signal) {
    const safeUrl = ensureHttpUrl(url)
    if (!safeUrl) {
      return ''
    }
    const response = await fetch(safeUrl, { signal })
    if (!response.ok) {
      throw new Error(`Doclingダウンロードエラー: ${response.status}`)
    }
    const contentType = response.headers.get('content-type') || ''
    const isZip =
      contentType.includes('application/zip') ||
      contentType.includes('application/octet-stream') ||
      /\.zip($|\?)/i.test(safeUrl)

    if (isZip) {
      if (typeof JSZip === 'undefined') {
        throw new Error('ZIP形式のレスポンスを解凍できません（JSZip未読込）')
      }
      const blob = await response.blob()
      const zip = await JSZip.loadAsync(blob)
      const markdownFile =
        zip.file(/\.md$/i)?.[0] ||
        zip.file(/\.markdown$/i)?.[0] ||
        zip.file(/\.txt$/i)?.[0]
      if (!markdownFile) {
        throw new Error('ZIP内にMarkdownファイルが見つかりません')
      }
      return markdownFile.async('string')
    }

    return response.text()
  }

  async function extractMarkdownFromPayload(payload, signal) {
    if (!payload) {
      return { markdown: '', metadata: {} }
    }

    const metadata = {}
    const textCandidates = []
    const urlCandidates = []
    const visited = new WeakSet()

    function inspect(node, parentKey) {
      if (!node || visited.has(node)) {
        return
      }
      if (typeof node === 'string') {
        if (parentKey && parentKey.includes('markdown')) {
          textCandidates.push({ text: node, confidence: 3 })
        } else if (scoreMarkdownCandidate(node) > 1) {
          textCandidates.push({ text: node, confidence: 1 })
        }
        return
      }
      if (typeof node !== 'object') {
        return
      }
      visited.add(node)

      if (typeof node.title === 'string' && !metadata.title) {
        metadata.title = node.title.trim()
      }

      const descriptor = [
        node.format,
        node.mimeType,
        node.mimetype,
        node.mediaType,
        node.type,
        node.kind,
        node.extension,
      ]
        .filter((part) => typeof part === 'string')
        .join('|')
        .toLowerCase()

      if (typeof node.markdown === 'string') {
        textCandidates.push({ text: node.markdown, confidence: 3, title: node.title })
      }
      if (typeof node.data === 'string' && descriptor.includes('markdown')) {
        textCandidates.push({ text: node.data, confidence: 2, title: node.title })
      }
      if (typeof node.content === 'string' && descriptor.includes('markdown')) {
        textCandidates.push({ text: node.content, confidence: 2, title: node.title })
      }
      if (typeof node.text === 'string' && descriptor.includes('markdown')) {
        textCandidates.push({ text: node.text, confidence: 2, title: node.title })
      }

      if (typeof node.url === 'string') {
        const url = node.url.trim()
        const looksLikeMarkdown =
          descriptor.includes('markdown') ||
          /\.md($|\?)/i.test(url) ||
          /\.markdown($|\?)/i.test(url)
        if (looksLikeMarkdown) {
          urlCandidates.push({ url, confidence: descriptor.includes('markdown') ? 2 : 1 })
        }
      }

      Object.entries(node).forEach(([key, value]) => {
        const lowerKey = key.toLowerCase()
        if (typeof value === 'string' && lowerKey.includes('markdown')) {
          textCandidates.push({ text: value, confidence: 3, title: metadata.title })
        } else if (
          typeof value === 'string' &&
          lowerKey.includes('url') &&
          /\.md($|\?)/i.test(value)
        ) {
          urlCandidates.push({ url: value, confidence: 1.5 })
        } else if (typeof value === 'string' && lowerKey.includes('title') && !metadata.title) {
          metadata.title = value.trim()
        }
        inspect(value, lowerKey)
      })
    }

    inspect(payload, '')

    textCandidates.sort(
      (a, b) => b.confidence * scoreMarkdownCandidate(b.text) - a.confidence * scoreMarkdownCandidate(a.text),
    )
    if (textCandidates.length) {
      const best = textCandidates[0]
      return {
        markdown: best.text,
        metadata,
      }
    }

    urlCandidates.sort((a, b) => b.confidence - a.confidence)
    for (const candidate of urlCandidates) {
      try {
        const text = await downloadTextAsset(candidate.url, signal)
        if (text) {
          return { markdown: text, metadata }
        }
      } catch (_error) {
        // 続行
      }
    }

    return { markdown: '', metadata }
  }

  async function convertWithDocling(pageUrl, settings, signal) {
    const safeUrl = ensureHttpUrl(pageUrl)
    if (!safeUrl) {
      throw new Error('有効なURLが取得できませんでした')
    }
    const base =
      normalizeBaseUrl(settings?.doclingBaseUrl || DEFAULT_SETTINGS.doclingBaseUrl) || DEFAULT_DOCLING_BASE
    const endpoint = `${base.replace(/\/$/, '')}/v1/convert/source`

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sources: [{ kind: 'http', url: safeUrl }],
      }),
      signal,
    })

    if (!response.ok) {
      throw new Error(`Docling APIエラー: ${response.status}`)
    }

    const payload = await response.json()
    const result = await extractMarkdownFromPayload(payload, signal)
    if (!result.markdown) {
      throw new Error('Docling APIから本文を取得できませんでした')
    }
    return result
  }

  function ensureDocumentPayload(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('送信内容が不正です')
    }
    if (!payload.title) {
      throw new Error('タイトルがありません')
    }
    if (!payload.content) {
      throw new Error('本文が空です')
    }
    return payload
  }

  function getSupabaseClient() {
    if (supabaseClient) {
      return supabaseClient
    }
    if (!window.supabase) {
      throw new Error('Supabase SDKが読み込まれていません')
    }
    if (
      !SUPABASE_URL ||
      !SUPABASE_ANON_KEY ||
      SUPABASE_URL.includes('__SUPABASE_URL__') ||
      SUPABASE_ANON_KEY.includes('__SUPABASE_ANON_KEY__')
    ) {
      throw new Error('Supabaseの設定が不足しています。WebClipperModalからZIPを再ダウンロードしてください。')
    }
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
    return supabaseClient
  }

  function parseHashParams(url) {
    const hash = url.includes('#') ? url.split('#', 2)[1] : ''
    return new URLSearchParams(hash)
  }

  function launchOAuth(url) {
    return new Promise((resolve, reject) => {
      if (!chrome.identity || !chrome.identity.launchWebAuthFlow) {
        reject(new Error('ブラウザがOAuthフローに対応していません'))
        return
      }
      chrome.identity.launchWebAuthFlow({ url, interactive: true }, (redirectUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
          return
        }
        if (!redirectUrl) {
          reject(new Error('OAuthリダイレクトURLが取得できませんでした'))
          return
        }
        resolve(redirectUrl)
      })
    })
  }

  async function loginWithSupabase() {
    const supabase = getSupabaseClient()
    const redirectTo = chrome.identity?.getRedirectURL
      ? chrome.identity.getRedirectURL('supabase-auth')
      : window.location.origin

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    })
    if (error || !data?.url) {
      throw new Error(error?.message || 'ログインURLの生成に失敗しました')
    }

    const redirectUrl = await launchOAuth(data.url)
    const params = parseHashParams(redirectUrl)
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    const errorDescription = params.get('error_description')

    if (!accessToken || !refreshToken) {
      throw new Error(errorDescription || 'Supabaseのトークンを取得できませんでした')
    }

    await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
    const { data: userData } = await supabase.auth.getUser()
    return userData?.user || null
  }

  async function logoutFromSupabase() {
    const supabase = getSupabaseClient()
    await supabase.auth.signOut()
  }

  async function getCurrentUser() {
    const supabase = getSupabaseClient()
    const { data } = await supabase.auth.getUser()
    return data?.user || null
  }

  async function getAccessToken() {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.auth.getSession()
    if (error || !data.session) {
      throw new Error('Supabaseにログインしていません')
    }

    let session = data.session
    const expiresAt = session.expires_at ? session.expires_at * 1000 : 0
    if (expiresAt && expiresAt - Date.now() < 60000) {
      const refreshResult = await supabase.auth.refreshSession()
      if (refreshResult.error || !refreshResult.data.session) {
        throw new Error('セッションの更新に失敗しました')
      }
      session = refreshResult.data.session
    }

    return session.access_token
  }

  function onAuthStateChange(callback) {
    const supabase = getSupabaseClient()
    authSubscription?.subscription?.unsubscribe()
    authSubscription = supabase.auth.onAuthStateChange((_event, session) => {
      callback(session)
    })
    return () => {
      authSubscription?.subscription?.unsubscribe()
      authSubscription = null
    }
  }

  async function createDocument(payload, settings, signal) {
    const normalized = ensureDocumentPayload(payload)
    const token = await getAccessToken()

    const apiBase = normalizeBaseUrl(settings?.apiBaseUrl || DEFAULT_SETTINGS.apiBaseUrl)
    if (!apiBase) {
      throw new Error('APIベースURLが設定されていません')
    }

    const url = `${apiBase}/documents`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(normalized),
      signal,
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(
        `Nousync APIエラー: ${response.status}${errorText ? ` - ${clampText(errorText, 200)}` : ''}`,
      )
    }

    const data = await response.json().catch(() => ({}))
    return data?.data || data
  }

  function sanitizeSelection(text) {
    if (!text || typeof text !== 'string') {
      return ''
    }
    const trimmed = text.trim()
    if (trimmed.length <= MAX_SELECTION_LENGTH) {
      return trimmed
    }
    return `${trimmed.slice(0, MAX_SELECTION_LENGTH)}...`
  }

  window.NousyncClipper = {
    defaults: DEFAULT_SETTINGS,
    loadSettings,
    saveSettings,
    parseTags,
    getActiveTab,
    requestPageContext,
    convertWithDocling,
    createDocument,
    normalizeBaseUrl,
    sanitizeSelection,
    auth: {
      login: loginWithSupabase,
      logout: logoutFromSupabase,
      getUser: getCurrentUser,
      getAccessToken,
      onChange: onAuthStateChange,
    },
  }
})()
