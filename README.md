# ChannelRecipe for Claude Code

Make faceless YouTube videos with your [ChannelRecipe](https://channelrecipe.com) Studio, from Claude Code.

- **Pick a style** from a panel of picture cards, or ask Claude to show the style gallery.
- **Clone a style** from any YouTube channel (`/channelrecipe:clone-style`).
- **Render on this computer or on Studio Cloud**, with the cost shown before anything starts. Claude Code always
  asks you before anything that spends money.
- **Watch your videos**: progress, finished videos, Open in Studio, Download.

It drives the ChannelRecipe Studio installed on your computer (its own local tools, with every check the Studio page
makes). You need a ChannelRecipe plan with Studio, and Studio downloaded and opened once with its launcher.

## Install

At the prompt of a Claude Code session in a terminal:

```
/plugin install channelrecipe --marketplace keviscoding/channelrecipe-plugins
```

From a shell:

```bash
claude plugin install channelrecipe --marketplace keviscoding/channelrecipe-plugins
```

In the Claude desktop app: click + next to the prompt box, then Plugins, Add marketplace with
`keviscoding/channelrecipe-plugins`, then add the ChannelRecipe plugin.

Updates: `claude plugin update channelrecipe@channelrecipe`, then `/reload-plugins`.

## Use

- `/studio` opens the ChannelRecipe panel: **Styles**, **Where to render** (this computer or Studio Cloud, with the
  live cost) and **My videos**. `/studio videos` opens it on your videos.
- `/channelrecipe:make-videos [idea]`, `/channelrecipe:cloud-batch [topic]`, `/channelrecipe:clone-style [YouTube link]`,
  `/channelrecipe:my-videos`.
- Or just ask: "make me three 8-minute history videos on Studio Cloud".

Pictures in the panel show in the Claude desktop app, VS Code, and the kitty, Ghostty and iTerm2 terminals; other
terminals show the style names and descriptions. Panels need Claude Code 2.1.287 or later in a terminal (2.1.286 in
the desktop app, 2.1.299 in VS Code).

## What it needs

- ChannelRecipe Studio, opened at least once (the plugin finds it in Downloads, Desktop, Documents or your home
  folder, or wherever it last ran; set `CR_STUDIO_HOME` for anywhere else).
- Node.js (Studio already needs it).
