// ChannelRecipe Studio in Claude Code: a panel with three tabs (Styles, Render, My videos) drawn from the creator's
// own Studio on localhost, a /studio command that opens it, and the permission rule for Studio's tools: the free
// ones run without a prompt; the paid ones (make_videos, clone_style, ...) and the deletes are always asked.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Filter, Prices, StyleCard, Tab, VideoRow, Where } from '../types'

const PANE = 'channelrecipe'
const TITLE = 'ChannelRecipe'
const PER_PAGE = 6
const FREE = new Set(['setup_check', 'list_styles', 'get_style_pick', 'quote', 'progress', 'list_videos',
  'open_in_studio', 'cloud_balance', 'clone_style_look', 'product_ideas', 'products', 'edit_style'])
const PAID = new Set(['make_videos', 'clone_style', 'build_product', 'resume_video', 'style_sample'])
// a video or a learned style moved into Studio's trash (30 days, Restore in Recently deleted): always asked too
const DELETES = new Set(['delete_video', 'delete_style'])
// Reading ChannelRecipe's niche database (the account's channelrecipe server, the folder's or this plugin's) is free
const NICHE_READ = /^mcp__(?:plugin_channelrecipe_)?channelrecipe__(?:list_niches|list_niche_subjects|list_niche_channels)$/
// Studio's tools from this folder's own server (mcp__studio__…) or from this plugin's (mcp__plugin_channelrecipe_studio__…)
const STUDIO_TOOL = /^mcp__(?:plugin_channelrecipe_)?studio__([a-z_]+)$/

const tab = atom({ plugin: 'channelrecipe', key: 'tab' } as const, 'styles')
const filter = atom({ plugin: 'channelrecipe', key: 'filter' } as const, 'all')
const page = atom({ plugin: 'channelrecipe', key: 'page' } as const, 0)
const styles = atom({ plugin: 'channelrecipe', key: 'styles' } as const, [])
const prices = atom({ plugin: 'channelrecipe', key: 'prices' } as const, { features: {} })
const chosen = atom({ plugin: 'channelrecipe', key: 'chosen' } as const, '')
const where = atom({ plugin: 'channelrecipe', key: 'where' } as const, 'this_computer')
const minutes = atom({ plugin: 'channelrecipe', key: 'minutes' } as const, 10)
const titles = atom({ plugin: 'channelrecipe', key: 'titles' } as const, 1)
const quote = atom({ plugin: 'channelrecipe', key: 'quote' } as const, '')
const videos = atom({ plugin: 'channelrecipe', key: 'videos' } as const, [])
const cloud = atom({ plugin: 'channelrecipe', key: 'cloud' } as const, '')
const problem = atom({ plugin: 'channelrecipe', key: 'problem' } as const, '')

// Pictures already made into SVG sources for the desktop app, by file (rebuilt after a reload).
const svgs = new Map<string, string>()
let base = ''
let platform = ''
let isOpen = false

type Json = Record<string, unknown>

async function studio($: EngineInterface): Promise<string> {
  if (base) return base
  let port = 7860
  try {
    const home = (await $.env.get('HOME')) || (await $.env.get('USERPROFILE')) || ''
    const pointer = JSON.parse(await $.fs.read(home + '/.channelrecipe/studio-home.json')) as Json
    if (typeof pointer.port === 'number') port = pointer.port
  } catch {
    // no pointer yet: Studio's usual address
  }
  base = 'http://127.0.0.1:' + port
  return base
}

async function getJson($: EngineInterface, path: string): Promise<Json> {
  const answer = await $.http.fetch((await studio($)) + path, { headers: { accept: 'application/json' } })
  let data: Json = {}
  try {
    data = JSON.parse(answer.text) as Json
  } catch {
    data = {}
  }
  if (!answer.ok) throw new Error(String(data.error || 'Studio answered ' + answer.status))
  return data
}

function link(path: string): string {
  return (base || 'http://127.0.0.1:7860').replace('127.0.0.1', 'localhost') + path
}

function closed(error: unknown): string {
  const text = String((error as Error)?.message || error)
  return /refused|ECONNREFUSED|connect|fetch failed|network/i.test(text)
    ? 'Studio isn\'t running. Open it with its launcher (Start on Mac.command or Start on Windows.cmd) and keep that window open.'
    : text
}

async function loadStyles($: EngineInterface): Promise<void> {
  try {
    const data = await getJson($, '/cr-claude-code/styles')
    await update($, styles, () => (data.styles as StyleCard[]) || [])
    await update($, prices, () => (data.prices as Prices) || { features: {} })
    await update($, problem, () => '')
  } catch (error) {
    await update($, problem, () => closed(error))
  }
}

async function loadVideos($: EngineInterface): Promise<void> {
  try {
    const rows: VideoRow[] = []
    const queue = await getJson($, '/api/queue')
    for (const job of (queue.jobs as Json[]) || []) {
      const slug = String(job.slug || '')
      if (job.state === 'done') continue
      rows.push({ id: 'video:' + slug, title: String(job.title || slug), state: String(job.state || ''),
        where: 'this_computer', percent: typeof job.progress === 'number' ? Math.round(job.progress * 100) : null,
        line: String(job.line || job.error || ''), watch: '', project: '', file: '', download: '', made: '' })
    }
    const cloudNow = await getJson($, '/cr-cloud/progress').catch(() => ({}) as Json)
    const state = String(cloudNow.state || 'idle')
    if (state !== 'idle' && state !== 'done') {
      const lines = (cloudNow.lines as string[]) || []
      rows.push({ id: 'cloud', title: String(cloudNow.title || 'Studio Cloud render'), state, where: 'studio_cloud',
        percent: null, line: String(cloudNow.error || cloudNow.message || lines[lines.length - 1] || ''),
        watch: '', project: '', file: '', download: '', made: '' })
    }
    for (const v of (cloudNow.videos as Json[]) || []) {
      const slug = encodeURIComponent(String(v.slug || ''))
      rows.push({ id: 'cloud:' + v.slug, title: String(v.title || v.slug), state: 'done', where: 'studio_cloud',
        percent: null, line: '', watch: '', project: '', file: '',
        download: v.video ? link(`/api/farm/file/${slug}/${encodeURIComponent(String(v.video))}`) : '', made: '' })
    }
    const done = await getJson($, '/cr-claude-code/videos')
    for (const v of ((done.videos as Json[]) || []).slice(0, 12)) {
      const slug = encodeURIComponent(String(v.slug || ''))
      const when = typeof v.mtime === 'number' ? new Date(v.mtime * 1000).toISOString().slice(0, 16).replace('T', ' ') : ''
      rows.push({ id: 'video:' + v.slug, title: String(v.title || v.slug), state: 'done', where: 'this_computer',
        percent: null, line: '', watch: link('/f/video/' + slug), project: link('/editor/' + slug),
        file: String(v.path || ''), download: '', made: when })
    }
    await update($, videos, () => rows)
    const balance = cloudNow.balance_usd
    await update($, cloud, () => (typeof balance === 'number' ? 'Cloud balance $' + balance.toFixed(2) : ''))
    await update($, problem, () => '')
  } catch (error) {
    await update($, problem, () => closed(error))
  }
}

async function loadQuote($: EngineInterface): Promise<void> {
  const list = await read($, styles)
  const id = await read($, chosen)
  const style = list.find(s => s.id === id)
  if (!style) {
    await update($, quote, () => '')
    return
  }
  const isShort = style.kind === 'short'
  const m = isShort ? 1 : await read($, minutes)
  const n = await read($, titles)
  const p = await read($, prices)
  const perMinute = (p.voice?.per_min || 0) + style.features.on.reduce((sum, key) => sum + (p.features[key]?.per_min || 0), 0)
  const media = perMinute * m
  const mediaText = media >= 0.01 ? `media about $${media.toFixed(2)}${n > 1 ? ' each' : ''}` : 'media a few cents'
  const place = await read($, where)
  if (place === 'studio_cloud' && !style.cloud_note) {
    try {
      const features: Record<string, boolean> = {}
      for (const key of style.features.offered) features[key] = style.features.on.includes(key)
      const q = await getJson($, `/cr-claude-code/quote?minutes=${m}&style=${encodeURIComponent(style.id)}&features=${encodeURIComponent(JSON.stringify(features))}`)
      if (!q.available) {
        await update($, quote, () => String(q.why || 'Studio Cloud isn\'t available on this account.'))
        return
      }
      const expected = Number(q.expected_cents) / 100
      const most = Number(q.max_cents) / 100
      const total = (expected + media) * n
      const balance = Number(q.balance_usd || 0)
      const short = most * n > balance ? ` Short by $${(most * n - balance).toFixed(2)}: top up at ${q.topup_url}.` : ''
      await update($, quote, () => `Studio Cloud: machine about $${expected.toFixed(2)}${n > 1 ? ' each' : ''} (up to $${most.toFixed(2)} reserved, only what it uses is charged), ${mediaText}; about $${total.toFixed(2)} in all. Balance $${balance.toFixed(2)}.${short}`)
    } catch (error) {
      await update($, quote, () => closed(error))
    }
    return
  }
  const total = media * n
  await update($, quote, () => `This computer: ${mediaText}; about $${total.toFixed(2)} in all, plus Claude Code usage on your plan. One video at a time.`)
}

async function openUrl($: EngineInterface, url: string, reveal = false): Promise<void> {
  if (!platform) {
    const probe = await $.process.run(['uname']).catch(() => null)
    platform = probe && probe.exitCode === 0 ? (probe.stdout.includes('Darwin') ? 'mac' : 'linux') : 'windows'
  }
  const argv = platform === 'mac' ? (reveal ? ['open', '-R', url] : ['open', url])
    : platform === 'windows' ? (reveal ? ['explorer', '/select,' + url] : ['explorer', url])
      : ['xdg-open', url]
  await $.process.run(argv).catch(() => undefined)
}

async function svgFor($: EngineInterface, style: StyleCard): Promise<string> {
  const path = style.jpg || style.art
  if (!path) return ''
  const known = svgs.get(path)
  if (known !== undefined) return known
  let source = ''
  try {
    if (style.jpg) {
      const { base64 } = await $.fs.read(style.jpg, { as: 'bytes' })
      source = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">'
        + `<image href="data:image/jpeg;base64,${base64}" x="0" y="0" width="320" height="180" preserveAspectRatio="xMidYMid slice"/></svg>`
    } else {
      source = await $.fs.read(style.art)
    }
  } catch {
    source = ''
  }
  if (source.length > 131072) source = ''
  svgs.set(path, source)
  return source
}

function shown(list: StyleCard[], f: Filter): StyleCard[] {
  return list.filter(s => f === 'all' || (f === 'videos' && s.kind === 'video') || (f === 'shorts' && s.kind === 'short')
    || (f === 'mine' && s.mine) || (f === 'cloud' && !s.cloud_note))
}

async function openPane($: EngineInterface, which?: Tab, asked = true): Promise<void> {
  if (which) await update($, tab, () => which)
  isOpen = true
  const opened = await $.ui.open({ id: PANE, title: TITLE, ...(asked ? { focus: true as const } : {}) })
  if (!opened.isPlaced && asked) $.ui.log('ChannelRecipe: the panel opens when there is room for it.')
  await Promise.all([loadStyles($), loadVideos($)])
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'studio', description: 'ChannelRecipe Studio: styles, where to render, my videos',
      argumentHint: '[styles | render | videos]' })
    // While the panel is open, keep My videos fresh (progress) without starting a turn.
    $.clock.every(6000, () => {
      if (isOpen) void loadVideos($)
    })
    return next(e)
  })

  on('command.run', { command: 'studio' }, async ($, e) => {
    const word = String(e.args || '').trim().toLowerCase()
    const which: Tab | undefined = /video/.test(word) ? 'videos' : /render|cloud|cost/.test(word) ? 'render'
      : /style/.test(word) ? 'styles' : undefined
    await openPane($, which)
    if (which === 'render') await loadQuote($)
    return {}
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    isOpen = false
    return next(e)
  })

  // Free Studio tools run without a prompt; paid ones always ask, even where someone allowed the whole server.
  on('tool.check', { tool: STUDIO_TOOL }, async ($, e, next) => {
    const name = (STUDIO_TOOL.exec(e.tool) || [])[1] || ''
    const verdict = await next(e)
    if (PAID.has(name) && verdict.decision === 'allow') {
      return { decision: 'ask', reason: 'ChannelRecipe: this spends money, so you are always asked.' }
    }
    if (DELETES.has(name) && verdict.decision === 'allow') {
      return { decision: 'ask', reason: "ChannelRecipe: this moves it to Studio's trash, so you are always asked." }
    }
    if (FREE.has(name) && verdict.decision === 'ask') {
      return { decision: 'allow', reason: 'ChannelRecipe: a free Studio tool.' }
    }
    return verdict
  }).catch(($, e, next) => next(e))

  on('tool.check', { tool: NICHE_READ }, async ($, e, next) => {
    const verdict = await next(e)
    return verdict.decision === 'ask' ? { decision: 'allow', reason: 'ChannelRecipe: reading the niche database is free.' } : verdict
  }).catch(($, e, next) => next(e))

  // When Claude lists the styles or starts videos, show them in the panel too.
  on('tool.call', { tool: STUDIO_TOOL }, async ($, e, next) => {
    const result = await next(e)
    const name = (STUDIO_TOOL.exec(e.tool) || [])[1] || ''
    if (name === 'list_styles') void openPane($, 'styles', false)
    if (name === 'make_videos' || name === 'list_videos') void openPane($, 'videos', false)
    return result
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const table = $.ui.resolve(e)
    const { Box, Text, Button } = table
    const width = e.props.bodyColumns
    // A choice: a Select where the surface has one, else a row of buttons (the phone app has no Select).
    const choice = (key: string, label: string, value: string, options: { value: string; label: string }[],
      onSelect: (value: string) => void) => {
      if ('Select' in table) {
        const { Select } = table
        return <Select key={key} label={label} value={value} options={options} onSelect={v => onSelect(v)} />
      }
      return (
        <Box key={key} flexDirection="row" gap={1} flexWrap="wrap">
          <Text dimColor>{label}</Text>
          {options.map(o => (
            <Button key={key + '-' + o.value} label={o.label} variant={o.value === value ? 'primary' : 'secondary'}
              onPress={() => onSelect(o.value)} />
          ))}
        </Box>
      )
    }
    const current = await read($, tab)
    const trouble = await read($, problem)

    const tabs = (
      <Box flexDirection="row" gap={1}>
        {(['styles', 'render', 'videos'] as const).map((t, i) => (
          <Button key={'tab-' + t} label={t === 'styles' ? 'Styles' : t === 'render' ? 'Where to render' : 'My videos'}
            hotkey={String(i + 1)} variant={t === current ? 'primary' : 'secondary'}
            onPress={() => {
              void update($, tab, () => t)
              if (t === 'render') void loadQuote($)
              if (t === 'videos') void loadVideos($)
            }} />
        ))}
      </Box>
    )
    const header = (
      <Box flexDirection="column" gap={1}>
        {tabs}
        {trouble ? <Text color="red">{trouble}</Text> : null}
      </Box>
    )

    if (current === 'styles') {
      const all = await read($, styles)
      const f = await read($, filter)
      const list = shown(all, f)
      const pages = Math.max(1, Math.ceil(list.length / PER_PAGE))
      const p = Math.min(await read($, page), pages - 1)
      const pick = await read($, chosen)
      const cards = []
      for (const s of list.slice(p * PER_PAGE, p * PER_PAGE + PER_PAGE)) {
        let picture = null
        if (e.surface === 'terminal' && width >= 70) {
          const { Image } = $.ui.resolve(e)
          picture = s.png ? <Image key={'img-' + s.id} source={{ file: s.png, format: 'png' }} columns={20} rows={6} alt={' '} /> : null
        } else if ((e.surface === 'desktop' || e.surface === 'vscode') && width >= 50) {
          const { Svg } = $.ui.resolve(e)
          const source = await svgFor($, s)
          picture = source ? <Svg source={source} alt={s.name} width={160} height={90} /> : null
        }
        const tags = [s.family, s.kind === 'short' ? 'Short' : '', s.mine ? 'My style' : '',
          s.cloud_note ? 'This computer' : 'Cloud or this computer'].filter(Boolean).join(' · ')
        cards.push(
          <Box key={'card-' + s.id} flexDirection="row" gap={2} paddingY={0}>
            {picture}
            <Box flexDirection="column" flexGrow={1} flexShrink={1}>
              <Text bold>{s.name}{s.id === pick ? '  ✓ chosen' : ''}</Text>
              <Text dimColor wrap="wrap">{s.description}</Text>
              <Text dimColor wrap="truncate-end">{tags}</Text>
              <Box flexDirection="row">
                <Button key={'use-' + s.id} label={s.id === pick ? 'Chosen' : 'Use this style'} variant="primary"
                  onPress={() => {
                    void update($, chosen, () => s.id)
                    void update($, tab, () => 'render')
                    void loadQuote($)
                    void $.prompt.submit({ text: `Use the ChannelRecipe style "${s.name}" (id ${s.id}) for my next video.`, asUser: true })
                  }} />
              </Box>
            </Box>
          </Box>,
        )
      }
      return (
        <Box flexDirection="column" gap={1}>
          {header}
          <Box flexDirection="row" gap={2} alignItems="center">
            {choice('filter', 'Show', f, [{ value: 'all', label: 'All styles' }, { value: 'videos', label: 'Long videos' },
              { value: 'shorts', label: 'Shorts' }, { value: 'mine', label: 'My styles' },
              { value: 'cloud', label: 'Renders in the cloud' }], value => {
              void update($, filter, () => value as Filter)
              void update($, page, () => 0)
            })}
            <Text dimColor>{list.length} styles · page {p + 1} of {pages}</Text>
          </Box>
          {all.length === 0 && !trouble ? <Text dimColor>Loading your styles…</Text> : null}
          {cards}
          <Box flexDirection="row" gap={1}>
            <Button key="prev" label="‹ Previous" hotkey="p" onPress={() => void update($, page, n => Math.max(0, Math.min(n, pages - 1) - 1))} />
            <Button key="next" label="Next ›" hotkey="n" onPress={() => void update($, page, n => Math.min(pages - 1, n + 1))} />
          </Box>
        </Box>
      )
    }

    if (current === 'render') {
      const list = await read($, styles)
      const id = await read($, chosen)
      const pick = list.find(s => s.id === id)
      const place = await read($, where)
      const m = await read($, minutes)
      const n = await read($, titles)
      const text = await read($, quote)
      if (!pick) {
        return (
          <Box flexDirection="column" gap={1}>
            {header}
            <Text>Choose a style first: open Styles and press Use this style.</Text>
          </Box>
        )
      }
      const cloudOk = !pick.cloud_note
      const label = place === 'studio_cloud' && cloudOk ? 'Studio Cloud' : 'this computer'
      return (
        <Box flexDirection="column" gap={1}>
          {header}
          <Text bold>{pick.name}</Text>
          <Box flexDirection="row" gap={2} flexWrap="wrap">
            {choice('where', 'Render on', cloudOk ? place : 'this_computer', cloudOk
              ? [{ value: 'this_computer', label: 'This computer' }, { value: 'studio_cloud', label: 'Studio Cloud' }]
              : [{ value: 'this_computer', label: 'This computer' }], value => {
              void update($, where, () => value as Where)
              void loadQuote($)
            })}
            {pick.kind === 'short' ? null : choice('minutes', 'Minutes', String(m),
              [1, 3, 5, 8, 10, 12, 15, 20, 30].map(v => ({ value: String(v), label: String(v) })), value => {
                void update($, minutes, () => Number(value))
                void loadQuote($)
              })}
            {choice('titles', 'Videos', String(n), [1, 2, 3, 4, 5].map(v => ({ value: String(v), label: String(v) })),
              value => {
                void update($, titles, () => Number(value))
                void loadQuote($)
              })}
          </Box>
          {pick.cloud_note ? <Text dimColor>{pick.cloud_note}</Text> : null}
          <Text>{text || 'Working out the cost…'}</Text>
          <Box flexDirection="row" gap={1}>
            <Button key="make" variant="primary" label="Ask Claude to make it"
              onPress={() => void $.prompt.submit({ asUser: true, text: `Make ${n} video${n > 1 ? 's' : ''} in the ChannelRecipe style "${pick.name}" (id ${pick.id})${pick.kind === 'short' ? '' : `, ${m} minutes each`}, on ${label}. The panel estimated: ${text} Ask me for the title${n > 1 ? 's' : ''} if I haven't given ${n > 1 ? 'them' : 'it'}, get the exact quote, and start only when I agree.` })} />
            <Button key="requote" label="Refresh the cost" onPress={() => void loadQuote($)} />
          </Box>
        </Box>
      )
    }

    const rows = await read($, videos)
    const balance = await read($, cloud)
    return (
      <Box flexDirection="column" gap={1}>
        {header}
        {balance ? <Text dimColor>{balance}</Text> : null}
        {rows.length === 0 && !trouble ? <Text dimColor>No videos yet.</Text> : null}
        {rows.map(v => (
          <Box key={'row-' + v.id} flexDirection="column">
            <Text bold wrap="truncate-end">{v.title}</Text>
            <Text dimColor wrap="truncate-end">
              {(v.where === 'studio_cloud' ? 'Studio Cloud' : 'This computer') + ' · ' + (v.state === 'done' ? 'ready' + (v.made ? ' · ' + v.made : '') : v.state + (v.percent !== null ? ' ' + v.percent + '%' : '')) + (v.line ? ' · ' + v.line : '')}
            </Text>
            {v.state === 'done' ? (
              <Box flexDirection="row" gap={1}>
                {v.watch ? <Button key={'watch-' + v.id} label="Watch" variant="primary" onPress={() => void openUrl($, v.watch)} /> : null}
                {v.project ? <Button key={'open-' + v.id} label="Open in Studio" onPress={() => void openUrl($, v.project)} /> : null}
                {v.file ? <Button key={'file-' + v.id} label="Show file" onPress={() => void openUrl($, v.file, true)} /> : null}
                {v.download ? <Button key={'dl-' + v.id} label="Download" variant="primary" onPress={() => void openUrl($, v.download)} /> : null}
              </Box>
            ) : null}
          </Box>
        ))}
        <Button key="refresh" label="Refresh" hotkey="r" onPress={() => void loadVideos($)} />
      </Box>
    )
  })
}
