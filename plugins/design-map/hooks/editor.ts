// Opening an element's file in the user's editor: the command for each preset, or the
// user's own template. Pure: the mod runs what this returns.

export const EDITORS = ['intellij', 'vscode', 'cursor', 'zed', 'custom'] as const
export type Editor = (typeof EDITORS)[number]

/** Quotes a value for /bin/sh: a template's {file} and {line} never break out of their word. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/**
 * The argv that opens `file` (absolute) at `line` (1 when absent). Presets run with no shell;
 * `custom` runs the template through /bin/sh with its placeholders quoted.
 */
export function editorCommand(editor: string, template: string, file: string, line: number | undefined, home: string): { argv: string[] } | { error: string } {
  const at = String(line ?? 1)
  switch (editor) {
    case 'intellij':
      return { argv: [`${home}/Library/Application Support/JetBrains/Toolbox/scripts/idea`, '--line', at, file] }
    case 'vscode':
      return { argv: ['code', '-g', `${file}:${at}`] }
    case 'cursor':
      return { argv: ['cursor', '-g', `${file}:${at}`] }
    case 'zed':
      return { argv: ['zed', `${file}:${at}`] }
    case 'custom': {
      if (template.trim() === '') return { error: 'editor is "custom" but editorCommand is empty: set it in /config, e.g. nvim --server /tmp/nvim.sock --remote {file}' }
      const script = template.replaceAll('{file}', shellQuote(file)).replaceAll('{line}', shellQuote(at))
      return { argv: ['/bin/sh', '-c', script] }
    }
    default:
      return { error: `unknown editor "${editor}": pick one of ${EDITORS.join(', ')} in /config` }
  }
}
