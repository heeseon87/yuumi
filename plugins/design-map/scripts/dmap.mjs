#!/usr/bin/env node
// dmap: opens the diagram drawer in the browser. Starts the page server first when none
// answers, or replaces one that runs older code. The settings come from the last Claude Code
// session that loaded design-map (<pages>/launch.json), else from the plugin's defaults.
//
//   dmap         the drawer
//   dmap <id>    one design map or diagram
//
// DESIGN_MAP_NO_BROWSER=1 only prints the address.

import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, openSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Keep identical to SERVER_FLAGS in hooks/version.ts. */
const FLAGS = ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON']
const here = dirname(fileURLToPath(import.meta.url))
const home = homedir()
const pagesDir = join(home, '.cache', 'design-map')
const config = JSON.parse(readFileSync(join(here, '..', '.claude-plugin', 'plugin.json'), 'utf8')).userConfig ?? {}
let launch = {}
try {
  launch = JSON.parse(readFileSync(join(pagesDir, 'launch.json'), 'utf8'))
} catch {}
const nodePath = launch.nodePath || config.nodePath?.default || process.execPath
const port = Number(launch.port || config.port?.default || 7777)
const mapsDir = process.env.DESIGN_MAP_DIR || launch.mapsDir || join(home, '.claude', 'design-maps')
const base = `http://127.0.0.1:${port}`
const server = join(here, 'server.mjs')

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
async function health() {
  try {
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(1000) })
    const value = await res.json()
    return value.app === 'design-map' ? value : undefined
  } catch {
    return undefined
  }
}

const wanted = execFileSync(nodePath, [...FLAGS, server, '--version'], { encoding: 'utf8' }).trim()
let running = await health()
if (running !== undefined && running.version !== wanted) {
  process.kill(running.pid)
  for (let i = 0; i < 20 && (await health()) !== undefined; i++) await sleep(100)
  running = undefined
}
if (running === undefined) {
  mkdirSync(pagesDir, { recursive: true })
  const log = openSync(join(pagesDir, 'server.log'), 'a')
  spawn(nodePath, [...FLAGS, server, String(port), pagesDir, mapsDir], { detached: true, stdio: ['ignore', log, log] }).unref()
  for (let i = 0; i < 25 && (await health()) === undefined; i++) await sleep(200)
  if ((await health()) === undefined) {
    console.error(`dmap: the page server did not start on port ${port}; see ${join(pagesDir, 'server.log')}`)
    process.exit(1)
  }
}
const id = process.argv[2]
const url = id === undefined ? `${base}/` : `${base}/map/${encodeURIComponent(id)}`
if (process.env.DESIGN_MAP_NO_BROWSER !== '1') execFileSync('open', [url])
console.log(url)
