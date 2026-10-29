import { expect, test } from 'claude-code/testing'

const STYLES = {
  styles: [
    { id: 'documentary', name: 'Editorial Documentary', description: 'Real footage and maps.', family: 'Documentary',
      kind: 'video', mine: false, cloud_note: '', cost: 'about $0.08 a minute', png: '', jpg: '', art: '',
      preview_label: '', short_seconds: null, features: { offered: ['youtube'], on: ['youtube'] } },
    { id: 'cr-shorts-3d', name: '3D Explainer Shorts', description: 'Weird facts.', family: 'Animation',
      kind: 'short', mine: false, cloud_note: 'Renders on this computer for now.', cost: '', png: '', jpg: '', art: '',
      preview_label: '', short_seconds: 25, features: { offered: [], on: [] } },
  ],
  prices: { features: { youtube: { per_min: 0.03 } }, voice: { per_min: 0.02 } },
}
const ANSWERS: Record<string, unknown> = {
  '/cr-claude-code/styles': STYLES,
  '/api/queue': { jobs: [{ slug: 'rome', title: 'Why Rome fell', state: 'running', progress: 0.4, line: 'Voice 2/5' }] },
  '/cr-cloud/progress': { state: 'idle', balance_usd: 7.71, videos: [] },
  '/cr-claude-code/videos': { videos: [{ slug: 'nile', title: 'The Nile', mtime: 1792680000, path: '/v/nile.mp4' }] },
}
const PANE = {
  component: 'Pane', requestId: 'channelrecipe',
  props: { title: 'ChannelRecipe', isFocused: true, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

test('free Studio tools run without a prompt and paid ones are always asked', async ($, on) => {
  on('tool.check', () => ({ decision: 'allow' }))
  expect((await $.tool.check({ tool: 'mcp__studio__make_videos', input: {} })).decision).toBe('ask')
  expect((await $.tool.check({ tool: 'mcp__plugin_channelrecipe_studio__clone_style', input: {} })).decision).toBe('ask')
  expect((await $.tool.check({ tool: 'mcp__plugin_channelrecipe_studio__resume_video', input: {} })).decision).toBe('ask')
  expect((await $.tool.check({ tool: 'mcp__plugin_channelrecipe_studio__style_sample', input: {} })).decision).toBe('ask')
})

test('deleting a video or a style is always asked, even where the whole server is allowed', async ($, on) => {
  on('tool.check', () => ({ decision: 'allow' }))
  expect((await $.tool.check({ tool: 'mcp__plugin_channelrecipe_studio__delete_video', input: {} })).decision).toBe('ask')
  expect((await $.tool.check({ tool: 'mcp__studio__delete_style', input: {} })).decision).toBe('ask')
})

test('Studio 107: carrying the queue on and recovering a video are always asked; the queue, Style Lab and fix-its are free', async ($, on) => {
  on('tool.check', ({}, e) => ({ decision: /carry_on_queue|recover_video/.test(e.tool) ? 'allow' : 'ask' }))
  expect((await $.tool.check({ tool: 'mcp__plugin_channelrecipe_studio__carry_on_queue', input: {} })).decision).toBe('ask')
  expect((await $.tool.check({ tool: 'mcp__studio__recover_video', input: {} })).decision).toBe('ask')
  for (const free of ['queue', 'style_lab', 'fix_ffmpeg', 'fix_node', 'fix_claude_cli', 'fix_graphics_browser']) {
    expect((await $.tool.check({ tool: 'mcp__plugin_channelrecipe_studio__' + free, input: {} })).decision).toBe('allow')
  }
})

test('editing a learned style is free', async ($, on) => {
  on('tool.check', () => ({ decision: 'ask' }))
  expect((await $.tool.check({ tool: 'mcp__plugin_channelrecipe_studio__edit_style', input: {} })).decision).toBe('allow')
})

test('products: ideas and status are free, building one is always asked; niche reads are free', async ($, on) => {
  on('tool.check', ({}, e) => ({ decision: e.tool.endsWith('build_product') ? 'allow' : 'ask' }))
  expect((await $.tool.check({ tool: 'mcp__studio__build_product', input: {} })).decision).toBe('ask')
  expect((await $.tool.check({ tool: 'mcp__studio__product_ideas', input: {} })).decision).toBe('allow')
  expect((await $.tool.check({ tool: 'mcp__plugin_channelrecipe_studio__products', input: {} })).decision).toBe('allow')
  expect((await $.tool.check({ tool: 'mcp__plugin_channelrecipe_channelrecipe__list_niche_channels', input: {} })).decision).toBe('allow')
  expect((await $.tool.check({ tool: 'mcp__channelrecipe__list_niches', input: {} })).decision).toBe('allow')
  expect((await $.tool.check({ tool: 'mcp__channelrecipe__generate_script', input: {} })).decision).toBe('ask')
})

test('a free tool is allowed and a deny is left alone', async ($, on) => {
  on('tool.check', ({}, e) => ({ decision: e.tool.endsWith('progress') ? 'deny' : 'ask' }))
  expect((await $.tool.check({ tool: 'mcp__studio__list_styles', input: {} })).decision).toBe('allow')
  expect((await $.tool.check({ tool: 'mcp__plugin_channelrecipe_studio__quote', input: {} })).decision).toBe('allow')
  expect((await $.tool.check({ tool: 'mcp__studio__progress', input: {} })).decision).toBe('deny')
  expect((await $.tool.check({ tool: 'mcp__other__list_styles', input: {} })).decision).toBe('ask')
})

test('the panel lists styles, sends the chosen one to the conversation and shows videos', async ($, on) => {
  const sent: string[] = []
  on('http.fetch', ({}, e) => {
    const path = new URL(e.url).pathname
    const body = ANSWERS[path]
    return { value: body === undefined ? { status: 404, ok: false, headers: {}, text: '{}' }
      : { status: 200, ok: true, headers: {}, text: JSON.stringify(body) } }
  })
  on('fs.read', () => ({ deny: 'no pointer here' }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('env.get', () => ({ value: undefined }))
  on('prompt.submit', ({}, e) => {
    sent.push(e.text)
    return { text: e.text }
  })
  await $.command.run({ command: 'studio', args: '' } as never)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'channelrecipe', surface, ...PANE })
    expect((await ui.find({ text: /Editorial Documentary/ }))).toBeDefined()
    expect((await ui.find({ text: /Cloud or this computer/ }))).toBeDefined()
    await ui.press({ key: 'use-documentary' })
    expect((await ui.find({ text: /Render on|Studio Cloud|This computer/ }))).toBeDefined()
    await ui.press({ key: 'tab-videos' })
    expect((await ui.find({ text: /Why Rome fell/ }))).toBeDefined()
    expect((await ui.find({ key: 'watch-video:nile' }))).toBeDefined()
    await ui.press({ key: 'tab-styles' })
    await ui.unmount()
  }
  expect(sent[0]).toContain('id documentary')
})

test('on the desktop a style card shows its picture as an Svg with the JPEG inside', async ($, on) => {
  const withPicture = { ...STYLES, styles: [{ ...STYLES.styles[0], jpg: '/thumbs/documentary-s.jpg' }] }
  on('http.fetch', ({}, e) => {
    const path = new URL(e.url).pathname
    const body = path === '/cr-claude-code/styles' ? withPicture : ANSWERS[path]
    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify(body ?? {}) } }
  })
  on('fs.read', ({}, e) => (String(e.path).endsWith('.jpg') ? { value: { base64: '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAASACADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDl6KKK8c/RwooooAKKKKACiiigD//Z' } } : { deny: 'no pointer here' }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('env.get', () => ({ value: undefined }))
  await $.command.run({ command: 'studio', args: '' } as never)
  const ui = await $.ui.mount({ plugin: 'channelrecipe', surface: 'desktop', ...PANE })
  const svg = await ui.find({ type: 'Svg' })
  expect(svg).toBeDefined()
  expect(String(svg?.props.source)).toContain('data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAASACADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDl6KKK8c/RwooooAKKKKACiiigD//Z'.slice(0, 60))
  expect(svg?.props.alt).toBe('Editorial Documentary')
  await ui.unmount()
})

test('the niche agent\'s tools are free: YouTube reads, the database, saved ideas', async ($, on) => {
  on('tool.check', () => ({ decision: 'ask' }))
  for (const name of ['niche_teaching', 'niche_breakouts', 'yt_search', 'yt_channel_stats', 'yt_look', 'save_ideas',
    'list_ideas', 'use_idea']) {
    expect((await $.tool.check({ tool: `mcp__plugin_channelrecipe_studio__${name}`, input: {} })).decision).toBe('allow')
    expect((await $.tool.check({ tool: `mcp__studio__${name}`, input: {} })).decision).toBe('allow')
  }
})
