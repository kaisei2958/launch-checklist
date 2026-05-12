export const config = { maxDuration: 30 }

const SUPABASE_URL = 'https://ykfiydyfmtypndzrgiow.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlrZml5ZHlmbXR5cG5kenJnaW93Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1NTQ4NjYsImV4cCI6MjA5NDEzMDg2Nn0.DA8uZn9jE7t3C_ntE58vhOw8_SieKbHXc2Zjwx7RzGw'
const APP_URL = 'https://launch-checklist-psi.vercel.app'

// 通知タイミングと対象項目の定義
const PHASES = [
  {
    days: 7,
    label: '1週間前',
    emoji: '📋',
    message: 'サーバー・ドメインの準備と開発環境の最終確認を始めましょう',
    items: [
      { id: 'server_contract', label: '本番サーバーの契約・プラン確認' },
      { id: 'domain_contract', label: 'ドメインの取得・契約確認' },
      { id: 'nameserver_record', label: '現在のネームサーバー設定を記録' },
      { id: 'ssl_plan',         label: 'SSL証明書の発行方法を確認' },
      { id: 'form_dev',         label: 'フォームの送受信テスト（開発環境）' },
      { id: 'dev_freeze',       label: 'コンテンツ・デザインの最終確定' },
    ],
  },
  {
    days: 3,
    label: '3日前',
    emoji: '🔧',
    message: '本番環境への移行・タグ設定を進めましょう',
    items: [
      { id: 'db_export',    label: '開発環境のDBをエクスポート' },
      { id: 'db_import',    label: '本番DBにインポート・接続設定' },
      { id: 'url_replace',  label: 'DB内のURLを本番URLに置換' },
      { id: 'ssl_install',  label: 'SSL証明書のインストール・有効化' },
      { id: 'noindex_off',  label: '検索エンジンのインデックスを「許可」に変更' },
      { id: 'admin_pass',   label: '管理者パスワードを本番用に変更' },
      { id: 'gtm_publish',  label: 'GTM コンテナの公開・バージョン確認' },
      { id: 'ga4_tag',      label: 'GA4 タグの動作確認' },
      { id: 'ma_tracking',  label: 'MAツールのトラッキングコード設置確認' },
      { id: 'client_confirm', label: 'クライアントの最終確認・承認を取得' },
    ],
  },
  {
    days: 1,
    label: '前日',
    emoji: '⚠️',
    message: '公開前日です。最終確認を完了させましょう',
    items: [
      { id: 'typo_check',      label: '全ページの誤字・脱字チェック' },
      { id: 'link_check',      label: 'リンク切れチェック' },
      { id: 'sp_check',        label: 'スマートフォン表示確認' },
      { id: 'design_check',    label: 'デザイン崩れ確認' },
      { id: 'meta_title',      label: '全ページのtitle・descriptionを確認' },
      { id: 'ogp_check',       label: 'OGP（SNSシェア用）画像・テキストの確認' },
      { id: 'client_confirm',  label: 'クライアントの最終確認・承認を取得' },
      { id: 'launch_schedule', label: '公開日時・担当者をチームで共有' },
    ],
  },
  {
    days: 0,
    label: '公開当日',
    emoji: '🚀',
    message: '公開当日です！チェックリストを確認しながら進めましょう',
    items: [
      { id: 'ns_switch',      label: 'ネームサーバーを本番サーバーに切り替え' },
      { id: 'top_access',     label: '本番URLでトップページにアクセス確認' },
      { id: 'ssl_verify',     label: 'SSL証明書の有効確認' },
      { id: 'form_prod',      label: '全フォームの送受信テスト（本番）' },
      { id: 'ga_verify',      label: 'Google Analytics のリアルタイム計測確認' },
      { id: 'client_report',  label: 'クライアントへの公開完了報告' },
    ],
  },
]

// JST で今日から n 日後の日付文字列を返す
function jstDate(offsetDays = 0) {
  const d = new Date()
  d.setUTCHours(d.getUTCHours() + 9) // UTC → JST
  d.setUTCDate(d.getUTCDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

async function sbFetch(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  })
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${path}`)
  return r.json()
}

async function postSlack(webhook, blocks, fallback) {
  const r = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: fallback, blocks }),
  })
  if (!r.ok) throw new Error(`Slack ${r.status}`)
}

export default async function handler(req, res) {
  const webhook = process.env.SLACK_WEBHOOK_URL
  if (!webhook) return res.status(500).json({ error: 'SLACK_WEBHOOK_URL が設定されていません' })

  const results = []

  for (const phase of PHASES) {
    const targetDate = jstDate(phase.days)
    const projects = await sbFetch(
      `/projects?launch_date=eq.${targetDate}&select=id,name,url,owner`
    )

    for (const project of projects) {
      // 完了済み項目を取得
      const checks = await sbFetch(
        `/checks?project_id=eq.${project.id}&checked=eq.true&select=item_id`
      )
      const done = new Set(checks.map(c => c.item_id))

      // 未完了項目（最大6件）
      const todo = phase.items.filter(i => !done.has(i.id)).slice(0, 6)
      const allDone = todo.length === 0

      // 日付フォーマット
      const [, m, d] = targetDate.split('-')
      const dateLabel = phase.days === 0
        ? `本日（${+m}月${+d}日）公開！`
        : `公開まであと ${phase.days}日（${+m}月${+d}日）`

      const blocks = [
        {
          type: 'header',
          text: { type: 'plain_text', text: `${phase.emoji} ${project.name}`, emoji: true },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*日程*\n${dateLabel}` },
            { type: 'mrkdwn', text: `*担当*\n${project.owner || '未設定'}` },
          ],
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: allDone
              ? `✅ *${phase.label}の項目はすべて完了しています！*`
              : `*${phase.label}の未完了項目（${todo.length}件）:*\n${todo.map(i => `・${i.label}`).join('\n')}`,
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'チェックリストを開く', emoji: true },
              url: APP_URL,
              style: 'primary',
            },
          ],
        },
        { type: 'divider' },
      ]

      await postSlack(
        webhook,
        blocks,
        `${phase.emoji} 公開リマインド：${project.name} - ${dateLabel}`
      )

      results.push({ project: project.name, days: phase.days, todo: todo.length })
    }
  }

  return res.json({ sent: results.length, results })
}
