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
  await $.command.run({ command: 'studio' })
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
