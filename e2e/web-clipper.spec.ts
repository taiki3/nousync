import { test, expect } from '@playwright/test'

test.describe('Web Clipper', () => {
  test('Extension static files are accessible', async ({ page }) => {
    await page.goto('/')

    // Check that extension files are served correctly
    const requiredFiles = [
      'manifest.json',
      'popup.html',
      'popup.js',
      'content.js',
      'background.js',
      'options.html',
      'options.js',
      'shared.js',
      'jszip.min.js',
      'supabase.js',
      'icons/icon-16.png',
      'icons/icon-128.png',
    ]

    for (const file of requiredFiles) {
      const response = await page.evaluate(async (filePath) => {
        const res = await fetch(`/extensions/edge-clipper/${filePath}`)
        return { ok: res.ok, status: res.status }
      }, file)
      expect(response.ok, `File ${file} should be accessible`).toBe(true)
    }
  })

  test('Manifest.json is valid JSON with correct structure', async ({ page }) => {
    await page.goto('/')

    const manifest = await page.evaluate(async () => {
      const res = await fetch('/extensions/edge-clipper/manifest.json')
      return res.json()
    })

    // Verify manifest structure
    expect(manifest.manifest_version).toBe(3)
    expect(manifest.name).toBe('Nousync Web Clipper')
    expect(manifest.permissions).toContain('storage')
    expect(manifest.permissions).toContain('activeTab')
    expect(manifest.permissions).toContain('identity')
    expect(manifest.action.default_popup).toBe('popup.html')
    expect(manifest.options_page).toBe('options.html')
  })

  test('shared.js contains placeholder values (to be replaced at download)', async ({ page }) => {
    await page.goto('/')

    const sharedJs = await page.evaluate(async () => {
      const res = await fetch('/extensions/edge-clipper/shared.js')
      return res.text()
    })

    // Static file should have placeholders (they get replaced when ZIP is generated)
    expect(sharedJs).toContain('__SUPABASE_URL__')
    expect(sharedJs).toContain('__SUPABASE_ANON_KEY__')
    expect(sharedJs).toContain('__NOUSYNC_API_BASE__')

    // Should have fallback API base
    expect(sharedJs).toContain('https://nousync.vercel.app/api')
  })

  test('popup.html loads required scripts', async ({ page }) => {
    await page.goto('/')

    const popupHtml = await page.evaluate(async () => {
      const res = await fetch('/extensions/edge-clipper/popup.html')
      return res.text()
    })

    // Verify script references
    expect(popupHtml).toContain('supabase.js')
    expect(popupHtml).toContain('shared.js')
    expect(popupHtml).toContain('popup.js')
    expect(popupHtml).toContain('jszip.min.js')
  })

  test('options.html loads required scripts', async ({ page }) => {
    await page.goto('/')

    const optionsHtml = await page.evaluate(async () => {
      const res = await fetch('/extensions/edge-clipper/options.html')
      return res.text()
    })

    // Verify script references
    expect(optionsHtml).toContain('supabase.js')
    expect(optionsHtml).toContain('shared.js')
    expect(optionsHtml).toContain('options.js')
  })
})
