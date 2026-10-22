// The ChannelRecipe mod's session state: what its panel draws from.

/** A style as the Studio's /cr-claude-code/styles route lists it. */
export type StyleCard = {
  id: string
  name: string
  description: string
  family: string
  kind: 'video' | 'short'
  mine: boolean
  cloud_note: string
  cost: string
  png: string
  jpg: string
  art: string
  preview_label: string
  short_seconds: number | null
  features: { offered: string[]; on: string[] }
}

/** Per-minute prices of a style's options and the voice (the catalogue's `prices`). */
export type Prices = {
  features: Record<string, { per_min?: number; note?: string }>
  voice?: { per_min?: number; note?: string }
}

/** A video being made or finished, on this computer or Studio Cloud. */
export type VideoRow = {
  id: string
  title: string
  state: string
  where: 'this_computer' | 'studio_cloud'
  percent: number | null
  line: string
  watch: string
  project: string
  file: string
  download: string
  made: string
}

export type Tab = 'styles' | 'render' | 'videos'
export type Filter = 'all' | 'videos' | 'shorts' | 'mine' | 'cloud'
export type Where = 'this_computer' | 'studio_cloud'

declare module 'claude-code' {
  interface PluginState {
    channelrecipe: {
      tab: Tab
      filter: Filter
      page: number
      styles: StyleCard[]
      prices: Prices
      chosen: string
      where: Where
      minutes: number
      titles: number
      quote: string
      videos: VideoRow[]
      cloud: string
      problem: string
    }
  }
}
