export const config = { maxDuration: 30 }

const SUPABASE_URL = 'https://ykfiydyfmtypndzrgiow.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlrZml5ZHlmbXR5cG5kenJnaW93Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1NTQ4NjYsImV4cCI6MjA5NDEzMDg2Nn0.DA8uZn9jE7t3C_ntE58vhOw8_SieKbHXc2Zjwx7RzGw'
const UA = 'Mozilla/5.0 (compatible; LaunchChecker/1.0)'

async function sbFetch(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  })
  if (!r.ok) throw new Error(`Supabase ${r.status}`)
  return r.json()
}

async function sbPatch(path, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`Supabase PATCH ${r.status}`)
}

async function postSlack(webhook, blocks, fallback) {
  await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: fallback, blocks }),
  })
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')

  const { project_id } = req.query
  const appUrl = process.env.APP_URL || 'https://launch-checklist-psi.vercel.app'
  const webhook = process.env.SLACK_WEBHOOK_URL

  // 特定案件 or 監視中の全案件
  const projects = project_id
    ? await sbFetch(`/projects?id=eq.${project_id}&select=id,name,url`)
    : await sbFetch(`/projects?dns_monitoring=eq.true&url=not.is.null&select=id,name,url`)

  const results = []

  for (const project of projects) {
    if (!project.url) { results.push({ project: project.name, status: 'no_url' }); continue }

    const url = project.url.startsWith('http') ? project.url : `https://${project.url}`

    try {
      const r = await fetch(url, {
        signal: AbortSignal.timeout(10000),
        headers: { 'User-Agent': UA },
      })

      if (r.ok) {
        const confirmedAt = new Date().toISOString()
        await sbPatch(`/projects?id=eq.${project.id}`, {
          dns_monitoring: false,
          dns_confirmed_at: confirmedAt,
        })

        if (webhook) {
          await postSlack(webhook, [
            {
              type: 'header',
              text: { type: 'plain_text', text: `🌐 ${project.name} — DNS伝播を確認しました！`, emoji: true },
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `本番URL *${url}* にアクセスできました。\nネームサーバーの切り替えが完了しています。`,
              },
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: { type: 'plain_text', text: '本番サイトを開く', emoji: true },
                  url,
                  style: 'primary',
                },
                {
                  type: 'button',
                  text: { type: 'plain_text', text: 'チェックリストを開く', emoji: true },
                  url: appUrl,
                },
              ],
            },
          ], `🌐 ${project.name} DNS伝播確認！本番サイトにアクセスできます`)
        }

        results.push({ project: project.name, status: 'confirmed', url })
      } else {
        results.push({ project: project.name, status: 'pending', httpStatus: r.status })
      }
    } catch (e) {
      results.push({ project: project.name, status: 'pending', error: e.message })
    }
  }

  return res.json({ results })
}
