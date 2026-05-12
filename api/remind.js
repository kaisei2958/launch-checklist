export const config = { maxDuration: 30 }

const SUPABASE_URL = 'https://ykfiydyfmtypndzrgiow.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlrZml5ZHlmbXR5cG5kenJnaW93Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1NTQ4NjYsImV4cCI6MjA5NDEzMDg2Nn0.DA8uZn9jE7t3C_ntE58vhOw8_SieKbHXc2Zjwx7RzGw'
const APP_URL = process.env.APP_URL || 'https://launch-checklist-psi.vercel.app'

// 各項目に「いつまでにやるべきか（公開N日前）」を定義
// dueBy: この日数前までに完了推奨
function itemApplies(item, project) {
  if (!item.conditions || item.conditions.length === 0) return true
  const typeMap = { domain: 'domain_type', server: 'server_type', mail: 'mail_type' }
  return item.conditions.some(c => {
    const [field, value] = c.split(':')
    const key = typeMap[field]
    if (!key) return true
    const projVal = project[key]
    if (!projVal) return true  // 未設定なら全て表示
    return projVal === value
  })
}

const ALL_ITEMS = [
  // ドメイン - 新規取得
  { id: 'domain_search',           label: 'ドメイン名の候補選定・空き確認',        dueBy: 42, conditions: ['domain:new'] },
  { id: 'domain_contract',         label: 'ドメインの取得・契約',                  dueBy: 42, conditions: ['domain:new'] },
  // ドメイン - 移管
  { id: 'domain_transfer_unlock',  label: '移管元のドメインロック解除',            dueBy: 42, conditions: ['domain:transfer'] },
  { id: 'domain_auth_code',        label: '認証コード（AuthCode）の取得',           dueBy: 42, conditions: ['domain:transfer'] },
  { id: 'domain_transfer_apply',   label: '移管申請の手続き',                       dueBy: 35, conditions: ['domain:transfer'] },
  { id: 'domain_transfer_confirm', label: '移管完了の確認',                         dueBy: 28, conditions: ['domain:transfer'] },
  // ドメイン - 既存流用
  { id: 'domain_current_dns',      label: '現在のDNS設定・TTLを記録',              dueBy: 28, conditions: ['domain:existing'] },
  { id: 'domain_registrar',        label: 'ドメイン管理会社へのアクセス確認',       dueBy: 28, conditions: ['domain:existing'] },
  // ドメイン - 共通
  { id: 'domain_whois',            label: 'ドメイン認証・所有者情報の確認',         dueBy: 35 },
  // Webサーバー - 自社移設
  { id: 'server_old_backup',       label: '旧サーバーのデータ・DB完全バックアップ', dueBy: 28, conditions: ['server:own'] },
  { id: 'server_php_check',        label: '自社サーバーのPHPバージョン・スペック確認', dueBy: 21, conditions: ['server:own'] },
  { id: 'ssl_plan',                label: 'SSL証明書の設定確認',                    dueBy: 28, conditions: ['server:own'] },
  { id: 'nameserver_record',       label: '現在のネームサーバー設定を記録',          dueBy: 14, conditions: ['server:own'] },
  // Webサーバー - 既存のまま
  { id: 'server_existing_php',     label: '既存サーバーのPHPバージョン確認',        dueBy: 14, conditions: ['server:existing'] },
  // メールサーバー - 新規
  { id: 'email_plan',              label: 'メールアカウントの設計・アドレス決定',   dueBy: 28, conditions: ['mail:new'] },
  { id: 'email_mx_plan',           label: 'MXレコードの設定計画',                   dueBy: 28, conditions: ['mail:new'] },
  { id: 'email_spf_dkim',          label: 'SPF・DKIM設定の計画',                    dueBy: 21, conditions: ['mail:new'] },
  // メールサーバー - 既存継続
  { id: 'email_mx_backup',         label: '現在のMXレコード設定を必ず記録',         dueBy: 14, conditions: ['mail:existing', 'server:own'] },
  { id: 'email_test_before',       label: '切り替え前のメール送受信テスト',         dueBy: 7,  conditions: ['mail:existing', 'server:own'] },
  // 1週間前
  { id: 'dev_freeze',        label: 'コンテンツ・デザインの最終確定',           dueBy: 7 },
  { id: 'plugin_check',      label: 'プラグインの動作確認・更新',               dueBy: 7 },
  { id: 'wp_version',        label: 'WordPressバージョンと本番PHPの互換性確認', dueBy: 7 },
  { id: 'form_dev',          label: 'フォームの送受信テスト（開発環境）',       dueBy: 7 },
  // 3日前
  { id: 'db_export',         label: '開発環境のDBをエクスポート',               dueBy: 3 },
  { id: 'files_upload',      label: 'WordPressファイルを本番サーバーにアップロード', dueBy: 3 },
  { id: 'db_import',         label: '本番DBにインポート・接続設定',             dueBy: 3 },
  { id: 'url_replace',       label: 'DB内のURLを本番URLに置換',                dueBy: 3 },
  { id: 'ssl_install',       label: 'SSL証明書のインストール・有効化',          dueBy: 3 },
  { id: 'noindex_off',       label: '検索エンジンのインデックスを「許可」に変更', dueBy: 3 },
  { id: 'admin_pass',        label: '管理者パスワードを本番用に変更',           dueBy: 3 },
  { id: 'gtm_publish',       label: 'GTM コンテナの公開・バージョン確認',       dueBy: 3 },
  { id: 'ga4_tag',           label: 'GA4 タグの動作確認',                      dueBy: 3 },
  { id: 'ma_tracking',       label: 'MAツールのトラッキングコード設置確認',     dueBy: 3 },
  // 前日
  { id: 'typo_check',        label: '全ページの誤字・脱字チェック',             dueBy: 1 },
  { id: 'link_check',        label: 'リンク切れチェック',                      dueBy: 1 },
  { id: 'sp_check',          label: 'スマートフォン表示確認',                   dueBy: 1 },
  { id: 'design_check',      label: 'デザイン崩れ確認',                        dueBy: 1 },
  { id: 'meta_title',        label: '全ページのtitle・descriptionを確認',       dueBy: 1 },
  { id: 'ogp_check',         label: 'OGP（SNSシェア用）画像・テキストの確認',  dueBy: 1 },
  { id: 'client_confirm',    label: 'クライアントの最終確認・承認を取得',       dueBy: 1 },
  { id: 'launch_schedule',   label: '公開日時・担当者をチームで共有',           dueBy: 1 },
  // 当日
  { id: 'ns_switch',         label: 'ネームサーバーを本番サーバーに切り替え',   dueBy: 0 },
  { id: 'top_access',        label: '本番URLでトップページにアクセス確認',      dueBy: 0 },
  { id: 'form_prod',         label: '全フォームの送受信テスト（本番）',         dueBy: 0 },
  { id: 'ga_verify',         label: 'Google Analytics のリアルタイム計測確認', dueBy: 0 },
  { id: 'client_report',     label: 'クライアントへの公開完了報告',             dueBy: 0 },
]

// 残り日数からフェーズ名を返す
function phaseLabel(days) {
  if (days >= 35) return { icon: '🗓️', label: '1〜2ヶ月前フェーズ', freq: 'weekly' }
  if (days >= 14) return { icon: '📋', label: '仕込みフェーズ',       freq: 'weekly' }
  if (days >= 7)  return { icon: '🔧', label: '移行準備フェーズ',     freq: 'daily'  }
  if (days >= 3)  return { icon: '⚠️', label: '最終確認フェーズ',     freq: 'daily'  }
  if (days >= 1)  return { icon: '🔥', label: '追い込みフェーズ',     freq: 'daily'  }
  if (days === 0) return { icon: '🚀', label: '公開当日',             freq: 'daily'  }
  return null
}

// 今日送信すべきかどうか（weekly は月曜のみ）
function shouldSendToday(days) {
  const phase = phaseLabel(days)
  if (!phase) return false
  if (phase.freq === 'daily') return true
  // weekly → 月曜（JST）
  const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return jstNow.getUTCDay() === 1
}

// JST での日付文字列
function jstDate(offsetDays = 0) {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000)
  d.setUTCDate(d.getUTCDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

async function sbFetch(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  })
  if (!r.ok) throw new Error(`Supabase ${r.status}`)
  return r.json()
}

async function postSlack(webhook, blocks, fallback) {
  await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: fallback, blocks }),
  })
}

export default async function handler(req, res) {
  const webhook = process.env.SLACK_WEBHOOK_URL
  if (!webhook) return res.status(500).json({ error: 'SLACK_WEBHOOK_URL が設定されていません' })

  const force = req.query.force === 'true'
  const today = jstDate()
  const sent = []

  // 公開日が設定されている全案件を取得
  const projects = await sbFetch('/projects?launch_date=not.is.null&select=id,name,url,owner,launch_date,domain_type,server_type,mail_type')

  for (const project of projects) {
    const daysUntil = Math.round(
      (new Date(project.launch_date) - new Date(today)) / (1000 * 60 * 60 * 24)
    )

    // 送信対象外（6週超 or 公開済み）
    if (daysUntil > 42 || daysUntil < 0) continue
    if (!force && !shouldSendToday(daysUntil)) continue

    // 完了済み項目を取得
    const checks = await sbFetch(
      `/checks?project_id=eq.${project.id}&checked=eq.true&select=item_id`
    )
    const done = new Set(checks.map(c => c.item_id))

    // プロジェクト種別に応じて適用項目を絞り込み
    const applicable = ALL_ITEMS.filter(i => itemApplies(i, project))

    // 対応が遅れている項目（dueBy > daysUntil かつ未完了）
    const overdue = applicable.filter(i => !done.has(i.id) && i.dueBy > daysUntil)

    // 今のフェーズのネクストアクション（dueBy <= daysUntil、直近のもの上位5件）
    const nextActions = applicable
      .filter(i => !done.has(i.id) && i.dueBy <= daysUntil)
      .sort((a, b) => b.dueBy - a.dueBy)  // 期限が近い順
      .slice(0, 5)

    const phase = phaseLabel(daysUntil)
    const [, m, d] = project.launch_date.split('-')
    const dateLabel = daysUntil === 0
      ? `本日（${+m}月${+d}日）公開！`
      : `公開まで ${daysUntil} 日（${+m}月${+d}日）`

    const blocks = [
      {
        type: 'header',
        text: { type: 'plain_text', text: `${phase.icon} ${project.name}`, emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*日程*\n${dateLabel}` },
          { type: 'mrkdwn', text: `*フェーズ*\n${phase.label}` },
        ],
      },
    ]

    if (overdue.length > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🔴 *対応が遅れている項目（${overdue.length}件）:*\n${overdue.slice(0, 4).map(i => `・${i.label}`).join('\n')}${overdue.length > 4 ? '\n…他' : ''}`,
        },
      })
    }

    if (nextActions.length > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🎯 *ネクストアクション:*\n${nextActions.map(i => `・${i.label}`).join('\n')}`,
        },
      })
    } else if (overdue.length === 0) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: '✅ *現フェーズの項目はすべて完了！次のフェーズに進みましょう*' },
      })
    }

    blocks.push(
      {
        type: 'actions',
        elements: [{
          type: 'button',
          text: { type: 'plain_text', text: 'チェックリストを開く', emoji: true },
          url: APP_URL,
          style: 'primary',
        }],
      },
      { type: 'divider' }
    )

    await postSlack(webhook, blocks, `${phase.icon} ${project.name} ネクストアクション — ${dateLabel}`)
    sent.push({ project: project.name, daysUntil, overdue: overdue.length, next: nextActions.length })
  }

  // DNS 監視中の案件をまとめてチェック（日次フォールバック）
  try {
    const appUrl = APP_URL
    await fetch(`${appUrl}/api/dns-check`, { signal: AbortSignal.timeout(25000) })
  } catch (_) {}

  return res.json({ sent: sent.length, results: sent })
}
