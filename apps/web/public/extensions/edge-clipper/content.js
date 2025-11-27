(function () {
  const MAX_HTML_LENGTH = 500000
  const MAX_TEXT_LENGTH = 120000

  function truncate(value, limit) {
    if (!value || typeof value !== 'string') {
      return ''
    }
    if (value.length <= limit) {
      return value
    }
    return `${value.slice(0, limit)}...`
  }

  function detectPdf(url) {
    if (!url) return false
    try {
      const parsed = new URL(url)
      if (/\.pdf($|\?|#)/i.test(parsed.pathname)) {
        return true
      }
    } catch (_error) {
      // ignore
    }
    const contentType = document.contentType || ''
    return /application\/pdf/i.test(contentType)
  }

  function collectContext() {
    let selection = ''
    try {
      selection = window.getSelection()?.toString() || ''
    } catch (_error) {
      selection = ''
    }

    let html = ''
    try {
      html = document.documentElement?.outerHTML || ''
    } catch (_error) {
      html = ''
    }

    let textPreview = ''
    try {
      textPreview = document.body?.innerText || ''
    } catch (_error) {
      textPreview = ''
    }

    return {
      url: window.location.href,
      title: document.title,
      selection: truncate(selection.trim(), MAX_TEXT_LENGTH),
      html: truncate(html, MAX_HTML_LENGTH),
      textPreview: truncate(textPreview.trim(), MAX_TEXT_LENGTH),
      isPdf: detectPdf(window.location.href),
    }
  }

  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request?.type === 'NOUSYNC_GET_PAGE_CONTEXT') {
      try {
        sendResponse(collectContext())
      } catch (_error) {
        sendResponse({})
      }
      return true
    }
    return undefined
  })
})()
