// The page server's version is a hash of the text of every file it runs or serves, so two
// installed copies of this plugin with the same code agree and never restart each other's
// server. scripts/server.mjs computes the same FNV-1a over the same files in the same order;
// keep the two functions and the two lists identical.

/** What the server runs or serves, relative to the plugin root, in hashing order. */
export const SERVER_FILES = ['scripts/server.mjs', 'scripts/page.html', 'scripts/library.html', 'hooks/model.ts'] as const

/** How the server is started: Node runs hooks/model.ts by stripping its types. */
export const SERVER_FLAGS = ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON'] as const

export function fnv1a(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/** The version of a server made of these sources, in SERVER_FILES order. */
export function serverVersion(sources: readonly string[]): string {
  return fnv1a(sources.join('\n'))
}
