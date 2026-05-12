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

  // 8. フォーム検出 + 構造分析
  const formTags   = (html.match(/<form[\s\n\r>]/gi) || []).length
  const hasCF7     = /wpcf7-form|contact-form-7/i.test(html)
  const hasGravity = /gform_wrapper|gravityform/i.test(html)
  const hasWPForms = /wpforms-form/i.test(html)
  const hasHubspot = /hbspt\.forms|hs-form-iframe/i.test(html)
  const hasOther   = /typeform|jotform|formstack/i.test(html)

  const detected = [
    formTags > 0 && `HTMLフォーム ${formTags} 件`,
    hasCF7     && 'Contact Form 7',
    hasGravity && 'Gravity Forms',
    hasWPForms && 'WPForms',
    hasHubspot && 'HubSpot フォーム',
    hasOther   && '外部フォーム埋め込み',
  ].filter(Boolean)

  // 構造分析（最初のフォーム）
  const firstForm = html.match(/<form[^>]*>([\s\S]*?)<\/form>/i)?.[0] || ''
  const hasEmailField   = /<input[^>]+type=["']email["']/i.test(firstForm)
  const requiredCount   = (firstForm.match(/\brequired\b/gi) || []).length
  const hasNonce        = /_wpnonce|nonce/i.test(firstForm)
  const hasRecaptcha    = /g-recaptcha|recaptcha/i.test(html)
  const structureDetail = detected.length > 0
    ? [
        `検出: ${detected.join('、')}`,
        hasEmailField ? 'メール欄あり' : 'メール欄なし',
        `必須項目 ${requiredCount} 件`,
        hasNonce ? 'nonce保護あり' : 'nonce未確認',
        hasRecaptcha ? 'reCAPTCHA検出' : '',
      ].filter(Boolean).join(' ／ ')
    : 'フォームが見つかりません（JS動的生成の場合は手動確認が必要です）'

  results.forms = {
    ok: detected.length > 0 ? true : null,
    detail: structureDetail
  }

  // 9b. フォーム動作テスト（CF7のみ: 無効メールでバリデーション応答を確認）
  if (hasCF7) {
    const cf7Id = (
      html.match(/class=["'][^"']*wpcf7[^"']*["'][^>]*data-id=["'](\d+)["']/i) ||
      html.match(/data-id=["'](\d+)["'][^>]*class=["'][^"']*wpcf7/i) ||
      html.match(/<input[^>]+name=["']_wpcf7["'][^>]+value=["'](\d+)["']/i)
    )?.[1]

    const cf7Nonce = (
      html.match(/"nonce"\s*:\s*"([a-f0-9]+)"/i) ||
      html.match(/wpcf7_nonce["'\s:]+["']([a-f0-9]+)["']/i)
    )?.[1]

    if (cf7Id) {
      try {
        const endpoint = httpsUrl.replace(/\/$/, '') +
          `/wp-json/contact-form-7/v1/contact-forms/${cf7Id}/feedback`
        const body = new FormData()
        body.append('_wpcf7', cf7Id)
        body.append('_wpcf7_version', '5.0')
        body.append('_wpcf7_locale', 'ja')
        body.append('_wpcf7_unit_tag', `wpcf7-f${cf7Id}-p1-o1`)
        body.append('_wpcf7_container_post', '0')
        if (cf7Nonce) body.append('_wpnonce', cf7Nonce)
        body.append('your-name', 'テスト確認')
        body.append('your-email', 'invalid@@test')   // 無効メール → バリデーションエラー狙い
        body.append('your-message', 'テスト')

        const r = await fetch(endpoint, {
          method: 'POST', body,
          headers: { 'User-Agent': UA, 'Referer': httpsUrl },
          signal: AbortSignal.timeout(8000)
        })
        const data = await r.json().catch(() => ({}))

        if (data.status === 'validation_failed') {
          results.form_behavior = {
            ok: true,
            detail: 'CF7 バリデーション動作を確認（無効メールで検証、実際のメールは未送信）'
          }
        } else if (data.status === 'mail_sent') {
          results.form_behavior = {
            ok: true,
            detail: 'CF7 フォーム送信処理が正常に動作しています'
          }
        } else if (data.status === 'spam') {
          results.form_behavior = {
            ok: null,
            detail: `CF7 スパム判定により処理されました（reCAPTCHA / Akismet が有効）`
          }
        } else {
          results.form_behavior = {
            ok: null,
            detail: `CF7 REST API 応答: ${data.status || `HTTP ${r.status}`}${cf7Nonce ? '' : '（nonce 取得不可のためテスト精度低め）'}`
          }
        }
      } catch (e) {
        results.form_behavior = {
          ok: null,
          detail: `CF7 動作テスト失敗: ${e.message}`
        }
      }
    } else {
      results.form_behavior = {
        ok: null,
        detail: 'CF7 を検出しましたがフォームIDが取得できませんでした（手動確認推奨）'
      }
    }
  } else if (hasGravity || hasWPForms) {
    results.form_behavior = {
      ok: null,
      detail: `${hasGravity ? 'Gravity Forms' : 'WPForms'} は自動送信テスト非対応のため手動確認が必要です`
    }
  } else if (hasHubspot || hasOther) {
    results.form_behavior = {
      ok: null,
      detail: '外部フォーム（HubSpot / Typeform 等）は自動テスト非対応のため手動確認が必要です'
    }
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
