;(function () {
  const statusBar = document.getElementById('statusBar')
  const statusText = document.getElementById('statusText')
  const statusDetail = document.getElementById('statusDetail')
  const clipButton = document.getElementById('clipButton')
  const selectionToggle = document.getElementById('selectionOnly')
  const noteInput = document.getElementById('noteInput')
  const doclingLabel = document.getElementById('doclingEndpoint')
  const apiBaseLabel = document.getElementById('apiBaseLabel')
  const resultEl = document.getElementById('result')
  const openSettingsBtn = document.getElementById('openSettings')
  const authStatus = document.getElementById('authStatus')
  const authButton = document.getElementById('authButton')

  let settings = null
  let busy = false
  let currentUser = null

  function setStatus(message, variant = 'info', detail = '') {
    statusText.textContent = message
    statusDetail.textContent = detail
    statusBar.classList.remove('error', 'success', 'warning')
    if (variant === 'error') {
      statusBar.classList.add('error')
    } else if (variant === 'success') {
      statusBar.classList.add('success')
    } else if (variant === 'warning') {
      statusBar.classList.add('warning')
    }
  }

  function renderResult(content) {
    resultEl.textContent = ''
    if (!content) {
      return
    }
    if (typeof content === 'string') {
      resultEl.textContent = content
      return
    }
    resultEl.appendChild(content)
  }

  function deriveAppUrl(apiBaseUrl) {
    try {
      const apiUrl = new URL(apiBaseUrl)
      return apiUrl.origin
    } catch (_error) {
      return ''
    }
  }

  function formatQuote(text) {
    return text
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n')
  }

  function buildFallbackMarkdown(context, selectionOnly) {
    if (!context) {
      return ''
    }
    const selection = NousyncClipper.sanitizeSelection(context.selection)
    if (selectionOnly && selection) {
      return selection
    }
    if (context.textPreview) {
      return context.textPreview
    }
    return selection
  }

  function composeContent(markdown, context, selectionOnly) {
    const blocks = []
    if (markdown) {
      blocks.push(markdown.trim())
    }
    const note = noteInput.value.trim()
    if (note) {
      blocks.push(formatQuote(note))
    }
    const includeSource = settings?.includeSourceUrl !== false
    if (includeSource && context?.url) {
      blocks.push(`---\n[元のページを開く](${context.url})`)
    }
    if (!selectionOnly && context?.selection) {
      const selection = NousyncClipper.sanitizeSelection(context.selection)
      if (selection) {
        blocks.push('---\n**選択範囲**\n\n' + selection)
      }
    }
    return blocks.filter(Boolean).join('\n\n')
  }

  function updateAuthUI(user) {
    currentUser = user || null
    if (currentUser) {
      authStatus.textContent = currentUser.email || currentUser.user_metadata?.name || 'ログイン済み'
      authButton.textContent = 'ログアウト'
    } else {
      authStatus.textContent = '未ログイン'
      authButton.textContent = 'ログイン'
    }
  }

  async function refreshAuthState() {
    try {
      const user = await NousyncClipper.auth.getUser()
      updateAuthUI(user)
      if (user) {
        setStatus('準備完了', 'success')
      }
    } catch (error) {
      updateAuthUI(null)
      setStatus(error.message || 'Supabaseに接続できません', 'error')
    }
  }

  async function handleAuthButton() {
    authButton.disabled = true
    try {
      if (currentUser) {
        await NousyncClipper.auth.logout()
        updateAuthUI(null)
        setStatus('ログアウトしました', 'info')
      } else {
        setStatus('Supabaseにリダイレクトします...', 'info')
        const user = await NousyncClipper.auth.login()
        updateAuthUI(user)
        setStatus('ログインしました', 'success')
      }
    } catch (error) {
      setStatus(error.message || '認証に失敗しました', 'error')
    } finally {
      authButton.disabled = false
    }
  }

  async function ensureAuthenticated() {
    try {
      await NousyncClipper.auth.getAccessToken()
      return true
    } catch (error) {
      setStatus('Supabaseにログインしてください', 'error', error.message)
      return false
    }
  }

  async function handleClip() {
    if (busy) {
      return
    }

    const authed = await ensureAuthenticated()
    if (!authed) {
      return
    }

    busy = true
    clipButton.disabled = true
    renderResult('')

    try {
      const tab = await NousyncClipper.getActiveTab()
      if (!tab || !tab.id || !tab.url) {
        throw new Error('現在のタブ情報を取得できませんでした')
      }

      const context = await NousyncClipper.requestPageContext(tab.id)
      const pageUrl = context?.url || tab.url
      const useSelectionOnly = Boolean(selectionToggle.checked && context?.selection)

      setStatus(useSelectionOnly ? '選択範囲を送信します' : 'Docling APIで変換中...', 'info')

      let markdown = ''
      let metadata = {}
      if (!useSelectionOnly) {
        try {
          const result = await NousyncClipper.convertWithDocling(pageUrl, settings)
          markdown = result.markdown
          metadata = result.metadata || {}
        } catch (error) {
          console.warn('Docling conversion failed', error)
          setStatus('Docling APIの使用に失敗しました。選択/テキストを使用します。', 'warning')
        }
      }

      if (!markdown) {
        markdown = buildFallbackMarkdown(context, useSelectionOnly)
      }

      if (!markdown) {
        throw new Error('本文を取得できませんでした')
      }

      const payload = {
        title: metadata.title || context?.title || tab.title || 'Webクリップ',
        content: composeContent(markdown, context, useSelectionOnly),
        tags: NousyncClipper.parseTags(settings.tags),
      }
      if (settings.projectId) {
        payload.projectId = settings.projectId
      }

      setStatus('Nousyncへ送信中...', 'info')
      const createdDoc = await NousyncClipper.createDocument(payload, settings)
      setStatus('Nousyncに保存しました', 'success')

      const container = document.createElement('div')
      container.innerHTML = `保存済み: <strong>${payload.title}</strong>`
      if (createdDoc?.id) {
        const idEl = document.createElement('div')
        idEl.style.fontSize = '12px'
        idEl.style.marginTop = '4px'
        idEl.textContent = `ID: ${createdDoc.id}`
        container.appendChild(idEl)
      }
      const appUrl = deriveAppUrl(settings.apiBaseUrl)
      if (appUrl) {
        const openButton = document.createElement('button')
        openButton.textContent = 'Nousyncを開く'
        openButton.className = 'secondary'
        openButton.style.marginLeft = '8px'
        openButton.addEventListener('click', () => {
          chrome.tabs.create({ url: appUrl })
        })
        container.appendChild(openButton)
      }
      renderResult(container)
    } catch (error) {
      console.error(error)
      setStatus(error.message || '保存に失敗しました', 'error')
    } finally {
      busy = false
      clipButton.disabled = false
    }
  }

  async function initialize() {
    try {
      settings = await NousyncClipper.loadSettings()
      setStatus('Supabaseにログインしてください', 'warning')
      doclingLabel.textContent = settings.doclingBaseUrl || '-'
      apiBaseLabel.textContent = settings.apiBaseUrl || '-'
      await refreshAuthState()
      NousyncClipper.auth.onChange(() => {
        refreshAuthState()
      })
    } catch (error) {
      setStatus(error.message || '設定の読み込みに失敗しました', 'error')
      settings = NousyncClipper.defaults
    }
  }

  openSettingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage().catch(() => {})
  })
  clipButton.addEventListener('click', handleClip)
  authButton.addEventListener('click', handleAuthButton)

  initialize()
})()
