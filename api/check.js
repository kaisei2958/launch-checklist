export const config = { maxDuration: 30 }

const UA = 'Mozilla/5.0 (compatible; LaunchChecker/1.0)'

function extractMeta(html, name) {
  return (
    html.match(new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']*)["']`, 'i')) ||
    html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${name}["']`, 'i'))
  )?.[1]?.trim() || ''
}

function extractOG(html, prop) {
  return (
    html.match(new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']*)["']`, 'i')) ||
    html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:${prop}["']`, 'i'))
  )?.[1]?.trim() || ''
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')

  let { url } = req.query
  if (!url) return res.status(400).json({ error: 'url パラメータが必要です' })
  if (!url.startsWith('http')) url = 'https://' + url

  const httpsUrl = url.replace(/^http:\/\//, 'https://')
  const httpUrl  = url.replace(/^https?:\/\//, 'http://')
  const results  = {}

  // 1. HTTPS リダイレクト
  try {
    const r = await fetch(httpUrl, { redirect: 'manual', signal: AbortSignal.timeout(6000) })
    const loc = r.headers.get('location') || ''
    const ok  = r.status >= 300 && r.status < 400 && loc.startsWith('https://')
    results.https_redirect = {
      ok,
      detail: ok
        ? `HTTP → HTTPS リダイレクト確認（${r.status}）`
        : r.status >= 300 ? `リダイレクト先が HTTPS でない: ${loc}` : `リダイレクトなし（${r.status}）`
    }
  } catch (e) {
    results.https_redirect = { ok: null, detail: `確認不可: ${e.message}` }
  }

  // 2. メインページ取得
  let html = ''
  try {
    const r = await fetch(httpsUrl, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) })
    html = await r.text()
    results.ssl = { ok: true, detail: `HTTPS アクセス成功（ステータス ${r.status}）` }
  } catch (e) {
    results.ssl = { ok: false, detail: `HTTPS アクセス失敗: ${e.message}` }
    return res.json({ results })
  }

  // 3. noindex
  const robots    = extractMeta(html, 'robots')
  const hasNoindex = /noindex/i.test(robots)
  results.noindex = {
    ok: !hasNoindex,
    detail: hasNoindex
      ? `noindex が設定されています: "${robots}"`
      : robots ? `content="${robots}"（問題なし）` : 'robots meta なし（問題なし）'
  }

  // 4. title
  const title = (html.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1]?.trim() || ''
  results.title = {
    ok: title.length > 0,
    detail: title || '（titleタグが空またはなし）'
  }

  // 5. meta description
  const desc = extractMeta(html, 'description')
  results.description = {
    ok: desc.length > 0,
    detail: desc ? (desc.length > 80 ? desc.slice(0, 80) + '…' : desc) : '（descriptionなし）'
  }

  // 6. OGP
  const ogTitle = extractOG(html, 'title')
  const ogImage = extractOG(html, 'image')
  results.ogp = {
    ok: ogTitle.length > 0 && ogImage.length > 0,
    detail: `og:title ${ogTitle ? '✓' : '✗（なし）'}　og:image ${ogImage ? '✓' : '✗（なし）'}`
  }

  // 7. GA / GTM タグ
  const hasGTM = /GTM-[A-Z0-9]+/i.test(html)
  const hasGA4 = /["']G-[A-Z0-9]+["']/i.test(html) || /gtag\s*\(/.test(html)
  results.analytics = {
    ok: hasGTM || hasGA4,
    detail: [hasGTM && 'GTM 検出', hasGA4 && 'GA4 検出'].filter(Boolean).join('、') || 'GA/GTM タグが見つかりません'
  }

  // 8. フォーム数
  const formCount = (html.match(/<form[\s>]/gi) || []).length
  results.forms = {
    ok: true,
    detail: formCount > 0 ? `${formCount} 件のフォームを検出（動作確認は手動で実施してください）` : 'フォームが見つかりません'
  }

  // 9. 内部リンク切れ（最大15件）
  try {
    const base = new URL(httpsUrl)
    const seen = new Set([base.pathname])
    const toCheck = []
    for (const m of html.matchAll(/href=["']([^"'#][^"']*)["']/g)) {
      if (toCheck.length >= 15) break
      try {
        const abs = new URL(m[1], httpsUrl)
        if (
          abs.hostname === base.hostname &&
          !seen.has(abs.pathname) &&
          !/\.(jpg|jpeg|png|gif|svg|webp|css|js|pdf|zip)$/i.test(abs.pathname)
        ) {
          seen.add(abs.pathname)
          toCheck.push(abs.href.replace(/\?.*$/, '').replace(/#.*$/, ''))
        }
      } catch {}
    }

    const linkRes = await Promise.allSettled(
      toCheck.map(link =>
        fetch(link, {
          method: 'HEAD', redirect: 'follow',
          headers: { 'User-Agent': UA },
          signal: AbortSignal.timeout(5000)
        })
        .then(r => ({ url: link, status: r.status, ok: r.ok }))
        .catch(() => ({ url: link, status: 0, ok: false }))
      )
    )

    const checked = linkRes.map(r => r.status === 'fulfilled' ? r.value : { ok: false, url: '?' })
    const broken  = checked.filter(r => !r.ok)

    results.links = {
      ok: broken.length === 0,
      detail: broken.length === 0
        ? `${checked.length} 件チェック、リンク切れなし`
        : `${broken.length} 件のリンク切れ: ${broken.slice(0, 3).map(b => b.url.replace(httpsUrl, '') || '/').join('、')}${broken.length > 3 ? ' 他' : ''}`,
      broken: broken.map(b => b.url)
    }
  } catch (e) {
    results.links = { ok: null, detail: `リンクチェック失敗: ${e.message}` }
  }

  return res.json({ results })
}
