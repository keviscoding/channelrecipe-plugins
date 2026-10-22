#!/usr/bin/env node
// ChannelRecipe plugin: starts ChannelRecipe Studio's own tool server (cr_studio_tools.py in the Studio folder, run
// with Studio's own Python), so the tools always match the Studio release installed on this computer.
//
//   node launch.mjs [project folder]
//
// - In a Studio folder that registers its own `studio` server (.mcp.json), it serves no tools: that one is used.
// - Studio not found: a one-tool server whose setup_check says how to install or open Studio.
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

const WINDOWS = process.platform === 'win32'
const SCRIPT = 'cr_studio_tools.py'

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

function isStudio(folder) {
  return Boolean(folder) && existsSync(join(folder, SCRIPT)) && existsSync(join(folder, 'cr-release.json'))
}

function python(folder) {
  const candidate = WINDOWS ? join(folder, '.venv', 'Scripts', 'python.exe') : join(folder, '.venv', 'bin', 'python')
  return existsSync(candidate) ? candidate : null
}

function hasOwnServer(folder) {
  // Only the server names are read; the file's other entries are never touched or printed.
  const config = readJson(join(folder, '.mcp.json'))
  return Boolean(config && config.mcpServers && config.mcpServers.studio)
}

function findStudio(project) {
  const pointer = readJson(join(homedir(), '.channelrecipe', 'studio-home.json'))
  const places = [
    process.env.CR_STUDIO_HOME,
    project,
    pointer && pointer.home,
    join(homedir(), 'Downloads', 'ChannelRecipe studio'),
    join(homedir(), 'Desktop', 'ChannelRecipe studio'),
    join(homedir(), 'Documents', 'ChannelRecipe studio'),
    join(homedir(), 'ChannelRecipe studio'),
  ]
  return places.find(isStudio) || places.find(p => Boolean(p) && existsSync(join(p, 'cr-release.json'))) || null
}

// A minimal MCP server for when the real one can't run here.
function serveAlone(tools, call, instructions) {
  const send = message => process.stdout.write(JSON.stringify(message) + '\n')
  createInterface({ input: process.stdin }).on('line', line => {
    let message
    try {
      message = JSON.parse(line)
    } catch {
      return
    }
    if (message.id === undefined || message.id === null) return
    const params = message.params || {}
    if (message.method === 'initialize') {
      send({ jsonrpc: '2.0', id: message.id, result: {
        protocolVersion: params.protocolVersion || '2025-06-18', capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'channelrecipe-studio', version: '1.0.0' }, instructions } })
    } else if (message.method === 'tools/list') {
      send({ jsonrpc: '2.0', id: message.id, result: { tools } })
    } else if (message.method === 'tools/call') {
      send({ jsonrpc: '2.0', id: message.id, result: call(params.name) })
    } else if (message.method === 'ping') {
      send({ jsonrpc: '2.0', id: message.id, result: {} })
    } else {
      send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Method not found' } })
    }
  })
}

const project = process.argv[2] && !process.argv[2].startsWith('${') ? process.argv[2] : process.env.CLAUDE_PROJECT_DIR
if (isStudio(project) && hasOwnServer(project)) {
  serveAlone([], () => ({ content: [{ type: 'text', text: 'Use the studio server of this folder.' }], isError: true }),
    "This Studio folder's own studio server has ChannelRecipe's tools.")
} else {
  const home = findStudio(project)
  const interpreter = home && isStudio(home) && python(home)
  if (!interpreter) {
    const why = home && !isStudio(home)
      ? `ChannelRecipe Studio in "${home}" is older than release 84, which brought these tools. Press Update now on the Studio page (or run cr_update.py), then run /reload-plugins.`
      : home
      ? `ChannelRecipe Studio in "${home}" hasn't been opened yet. Open it once with its launcher (Start on Mac.command or Start on Windows.cmd), then run /reload-plugins.`
      : 'ChannelRecipe Studio isn\'t on this computer yet. Download it from https://channelrecipe.com/app (Studio), unzip it, open its launcher once, then run /reload-plugins. If it lives somewhere unusual, set CR_STUDIO_HOME to its folder.'
    serveAlone([{ name: 'setup_check', description: 'Is ChannelRecipe Studio installed and running? Free.',
      inputSchema: { type: 'object', properties: {} } }],
    () => ({ content: [{ type: 'text', text: JSON.stringify({ running: false, message: why }) }], isError: false }),
    'ChannelRecipe Studio was not found on this computer.')
  } else {
    const child = spawn(interpreter, [join(home, SCRIPT)], { cwd: home, stdio: 'inherit',
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, windowsHide: true })
    child.on('exit', code => process.exit(code ?? 0))
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
  }
}
