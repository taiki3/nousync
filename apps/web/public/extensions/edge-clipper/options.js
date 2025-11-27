;(function () {
  const form = document.getElementById('settingsForm')
  const apiBaseInput = document.getElementById('apiBaseUrl')
  const doclingBaseInput = document.getElementById('doclingBaseUrl')
  const tagsInput = document.getElementById('tags')
  const projectInput = document.getElementById('projectId')
  const includeSourceInput = document.getElementById('includeSourceUrl')
  const statusEl = document.getElementById('saveStatus')
  const resetButton = document.getElementById('resetButton')
  const loginButton = document.getElementById('loginButton')
  const logoutButton = document.getElementById('logoutButton')
  const authUser = document.getElementById('authUser')

  function setAuthUser(user) {
    if (user) {
      authUser.textContent = user.email || user.user_metadata?.name || 'ログイン済み'
    } else {
      authUser.textContent = '未ログイン'
    }
  }

  async function refreshAuthUser() {
    try {
      const user = await NousyncClipper.auth.getUser()
      setAuthUser(user)
    } catch (error) {
      setAuthUser(null)
      statusEl.textContent = error.message || 'Supabase認証の確認に失敗しました'
    }
  }

  async function load() {
    const settings = await NousyncClipper.loadSettings()
    apiBaseInput.value = settings.apiBaseUrl || ''
    doclingBaseInput.value = settings.doclingBaseUrl || ''
    tagsInput.value = settings.tags || ''
    projectInput.value = settings.projectId || ''
    includeSourceInput.checked = settings.includeSourceUrl !== false
    statusEl.textContent = ''
    await refreshAuthUser()
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    try {
      statusEl.textContent = '保存中...'
      await NousyncClipper.saveSettings({
        apiBaseUrl: apiBaseInput.value,
        doclingBaseUrl: doclingBaseInput.value,
        tags: tagsInput.value,
        projectId: projectInput.value,
        includeSourceUrl: includeSourceInput.checked,
      })
      statusEl.textContent = '保存しました'
    } catch (error) {
      console.error(error)
      statusEl.textContent = error.message || '保存に失敗しました'
    }
  })

  resetButton.addEventListener('click', async () => {
    if (!confirm('設定を初期値に戻しますか？')) {
      return
    }
    await NousyncClipper.saveSettings(NousyncClipper.defaults)
    await load()
    statusEl.textContent = '初期値に戻しました'
  })

  loginButton.addEventListener('click', async () => {
    loginButton.disabled = true
    try {
      await NousyncClipper.auth.login()
      await refreshAuthUser()
    } catch (error) {
      alert(error.message || 'ログインに失敗しました')
    } finally {
      loginButton.disabled = false
    }
  })

  logoutButton.addEventListener('click', async () => {
    logoutButton.disabled = true
    try {
      await NousyncClipper.auth.logout()
      await refreshAuthUser()
    } catch (error) {
      alert(error.message || 'ログアウトに失敗しました')
    } finally {
      logoutButton.disabled = false
    }
  })

  load()
})()
