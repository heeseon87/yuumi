// Render a map file through model.ts and mmdc, then count the colors that
// actually landed in the SVG (the color guide's check: styles fail silently).
//
//   node --experimental-strip-types scripts/render-fixture.ts <map.json> <out-dir> [view-json]
//
// Write <out-dir> outside dev-mods/: a file written inside reloads the mod.

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { toMermaid, validate } from '../hooks/model.ts'
import type { DesignMap, MapView } from '../hooks/model.ts'

// The node running this script, unless told otherwise; mermaid-cli is its global install.
const NODE = process.env.DESIGN_MAP_NODE ?? process.execPath
const MMDC = process.env.DESIGN_MAP_MERMAID_CLI === undefined
  ? join(dirname(NODE), '..', 'lib', 'node_modules', '@mermaid-js', 'mermaid-cli', 'src', 'cli.js')
  : join(process.env.DESIGN_MAP_MERMAID_CLI, 'src', 'cli.js')

const [mapPath, outDir, viewJson] = process.argv.slice(2)
if (mapPath === undefined || outDir === undefined) {
  console.error('usage: render-fixture.ts <map.json> <out-dir> [view-json]')
  process.exit(2)
}

const map = JSON.parse(readFileSync(mapPath, 'utf8')) as DesignMap
const view = (viewJson === undefined ? {} : JSON.parse(viewJson)) as MapView

const errors = validate(map, view)
if (errors.length > 0) {
  console.error(errors.join('\n'))
  process.exit(1)
}

const { mermaid, warnings } = toMermaid(map, view)
for (const w of warnings) console.log(`warning: ${w}`)

mkdirSync(outDir, { recursive: true })
const name = basename(mapPath, '.map.json') + (viewJson === undefined ? '' : '.view')
const mmd = join(outDir, `${name}.mmd`)
writeFileSync(mmd, mermaid)

for (const ext of ['svg', 'png']) {
  execFileSync(NODE, [MMDC, '-i', mmd, '-o', join(outDir, `${name}.${ext}`), '-s', '1.5', '-b', 'white'], { stdio: 'pipe' })
}

const svg = readFileSync(join(outDir, `${name}.svg`), 'utf8')
const wanted = [...new Set([...mermaid.matchAll(/fill:(#[0-9a-f]{6})/g)].map(m => m[1]))]
for (const color of wanted) {
  const count = svg.split(`fill:${color}`).length - 1
  console.log(`${count > 0 ? 'ok  ' : 'MISS'} fill:${color} x${count}`)
}
const dashedWanted = mermaid.includes('stroke-dasharray')
const dashedGot = svg.includes('stroke-dasharray:6 4')
if (dashedWanted) console.log(`${dashedGot ? 'ok  ' : 'MISS'} stroke-dasharray:6 4`)
console.log(`wrote ${join(outDir, name)}.{mmd,svg,png}`)
