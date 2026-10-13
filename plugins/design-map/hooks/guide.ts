// What the model reads: the tools' specs (listed in every session, so kept
// short) and the drawing guide, which map_open returns. The guide rides
// a tool result rather than the system prompt, so opening a map never
// rewrites the prompt cache.

import type { ToolSpec } from 'claude-code'

export const TOOL = {
  open: 'map_open',
  update: 'map_update',
  view: 'map_view',
  reply: 'map_reply',
  save: 'diagram_save',
} as const

const ID_LIST = { type: 'array', items: { type: 'string' } }

export const TOOLS: ToolSpec[] = [
  {
    name: TOOL.open,
    description:
      'Open or create a design map: a live Mermaid diagram of the design being discussed or implemented, drawn in the user\'s browser (updated on every change), where its status, decisions and progress sit beside it. '
      + 'A map is a class diagram (structure: boxes and relations) or a sequence diagram (behavior: participants and ordered messages), chosen when it is created by what the user asks for; it never converts. '
      + 'Use it when the user wants to see, discuss or follow a design (a feature to build or change, a flow to understand), then keep the map in sync with map_update while you analyze, decide and implement. '
      + 'Returns the drawing guide for its kind and the current map; call it again after a context compaction to reload both.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'File name, lowercase: a ticket key or slug such as proj-142.' },
        title: { type: 'string', description: 'Title shown on the page; required when creating.' },
        diagram: { enum: ['class', 'sequence'], description: 'When creating: class (default) or sequence. An existing map keeps its own.' },
        context: { type: 'string', description: 'One line: ticket, branch, what the map is for.' },
        repo: { type: 'string', description: 'Absolute path of the working tree; element files are relative to it.' },
        base: { type: 'string', description: 'Branch the work forks from, e.g. origin/main: progress counts changes since the fork point. Absent: uncommitted changes only.' },
      },
      required: ['name'],
    },
  },
  {
    name: TOOL.update,
    description:
      'Change the open design map in one batch, validated as a whole: on any error nothing is written and the errors come back. A field set to null is removed. '
      + 'Element {id (ASCII), label?, kind?: group|class|interface|enum|table|resource|external (sequence: class|interface|enum|table|resource|external|actor, no group), parent? (a group), change?: keep|result|modify|delete|add, decision?, steps?: number[], done?, members?: [{text, change?: modify|add|delete, done?}], files?: repo-relative paths, note?}. '
      + 'Class maps: Relation {from, to, kind?: association|dependency|inheritance|realization|composition|aggregation, label?, decision?}. '
      + 'Sequence maps (elements are the participants, left to right): Message {id, from, to? (not on a note), kind?: call|reply|async|note, label?, change?, decision?, steps?, done?, files?: call site path:line, note?}, placed by after?/before? (a message id), else appended; '
      + 'Fragment {id, kind: alt|opt|loop|par|section, label?, first, last (message ids), branches?: [{at (message id), label?}] (alt else, par and), change?, decision?}. '
      + 'Decision {id: D1, question, options?: [{id: D1-a, text, impact?}], chosen?, rationale?}.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        context: { type: ['string', 'null'] },
        direction: { enum: ['TB', 'LR', null] },
        repo: { type: ['string', 'null'] },
        base: { type: ['string', 'null'] },
        elements: {
          type: 'object',
          properties: { upsert: { type: 'array', items: { type: 'object' } }, remove: ID_LIST },
        },
        relations: {
          type: 'object',
          properties: {
            add: { type: 'array', items: { type: 'object' } },
            remove: { type: 'array', items: { type: 'object', description: '{from, to, kind?}' } },
          },
        },
        messages: {
          type: 'object',
          properties: { upsert: { type: 'array', items: { type: 'object' } }, remove: ID_LIST },
        },
        fragments: {
          type: 'object',
          properties: { upsert: { type: 'array', items: { type: 'object' } }, remove: ID_LIST },
        },
        decisions: {
          type: 'object',
          properties: { upsert: { type: 'array', items: { type: 'object' } }, remove: ID_LIST },
        },
      },
    },
  },
  {
    name: TOOL.view,
    description:
      'Change what the browser page shows without touching the map: collapse or expand groups, hide or show elements, set the direction. '
      + 'Keep roughly 12 boxes on screen: fold what only matters as a flow, expand what is being decided or changed. Class maps only: a sequence map shows everything.',
    inputSchema: {
      type: 'object',
      properties: {
        collapse: ID_LIST,
        expand: ID_LIST,
        hide: ID_LIST,
        show: ID_LIST,
        direction: { enum: ['TB', 'LR', null] },
        reset: { type: 'boolean', description: 'Start from an empty view: everything expanded and shown.' },
      },
    },
  },
  {
    name: TOOL.reply,
    description:
      'Answer feedback the user left on the design map in the browser (a prompt starting with "[design-map 피드백 #N]"). '
      + 'The reply shows under that feedback in the browser; one short paragraph, Korean.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: ['number', 'array'], items: { type: 'number' }, description: 'The feedback id, or ids that share one answer.' },
        text: { type: 'string' },
      },
      required: ['id', 'text'],
    },
  },
  {
    name: TOOL.save,
    description:
      'Save a plain Mermaid diagram (sequence, flowchart, state, class, ER…) in the user\'s diagram drawer: the browser library where they keep, search, tag, annotate and edit diagrams (/design-map drawer, or dmap in a shell). '
      + 'Use it when the user asks to keep a diagram, put one in the drawer, or change one that is there; for a design being discussed or implemented (class or sequence), use map_open instead. '
      + 'Mermaid checks the source first and nothing is saved when it cannot draw it; every save keeps the version before it. '
      + 'To change a saved diagram, Read its source first (<name>.mmd in the drawer folder, ~/.claude/design-maps unless configured): the user may have edited it in the browser.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Id: lowercase letters, digits, _ and -, such as note-create-flow. An existing id saves a new version of that diagram.' },
        title: { type: 'string', description: 'Title shown in the drawer; required for a new diagram.' },
        mermaid: { type: 'string', description: 'The Mermaid source. Required for a new diagram; leave it out to change only the title, tags or memo.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Replaces the tags.' },
        memo: { type: 'string', description: 'Replaces the markdown memo beside the diagram: what it shows, why, and where it comes from.' },
      },
      required: ['name'],
    },
  },
]

const GUIDE_HEAD = `# Design map: how to draw it

The map is the user's picture of the design, shared with you. Its job is to close the gap between what you know and what the user understands, so they can take part in design decisions. Keep it true as you go: update it right after you learn, propose, decide or finish something, not at the end.

## Three phases
1. **Current state**: before proposing anything, map what exists (change: keep). Read the code; draw only what the task touches and what explains it.
2. **Discussion**: mark the proposal on the same map (modify / add / delete / result). Every open question becomes a decision (D1, D2…) with options and their impact; tag what it would change with \`decision\`, which marks it [D1] (class maps also draw it dashed). When the user decides, set \`chosen\` and update the map to match.
3. **Implementation**: give elements \`steps\` (implementation order). Changed files mark their element 🔧 automatically; set \`done: true\` when an element's work is finished. Changed files that no element owns are listed to the user as "지도 밖 변경": add them to the map or explain them.

## repo and files: required for code
- Set \`repo\` (the working tree, absolute) on map_open, and \`base\` (the branch it forks from) when work happens on a branch.
- Give every element backed by code its \`files\` (repo-relative, \`path:line\` allowed). With them the user sees, live, which box you are reading or editing, can open the file in their editor from the box, and sees progress. Without them none of that works.
- If code in the repo changes during a turn and the map does not, the user is told the map went stale, and so are you; update the map or say why it needs no change.

## Colors (\`change\`): how much the element touches existing code
keep = code and values unchanged (grey) · result = code unchanged, stored values change (light purple: verify results) · modify = code changes (purple) · delete = code removed (red, 🗑) · add = new code (green).
external is another system and table a database table; neither has code in the repo: add when this change brings the dependency in (a new service, a new table), keep when it was already there. resource is a non-code file in the repo that the code reads (a config, a prompt, a template), with that file in \`files\`: it takes the usual colors, add for a new file, modify for an edited one.
`

const GUIDE_CLASS = `
## Granularity: mixed on purpose
- Draw at the level that makes the current question easiest to understand. Expand what is being decided or changed down to classes and members; fold what the user only needs as a flow into one group box.
- Groups are elements with \`kind: "group"\`; others point at them with \`parent\`. Groups nest. A collapsed group is one box in its strongest change color, with its relations lifted onto it.
- If mixing levels does not help, draw a plain class diagram.
- About 12 boxes on screen at most; past that, collapse with map_view. The page keeps a side panel beside the diagram: keep the default direction TB, use LR only for a short chain.
- An expanded group shows its id, not its label: give groups meaningful English ids (Load, Stat, Payment).

## Members and labels
- List only members that change (\`change\`: modify ✏ / add ➕ / delete ➖), plus at most one plain line of essential context.
- Labels may be Korean; ids are ASCII. \`<T>\` generics are fine. Not allowed: \`:\` in relation labels or members, \`{ }\` or \`"\` in members, a member ending in \`$\` or \`*\`.
- Relations: association (-->) for calls and ownership, dependency (..>) for a looser use, realization for implements, inheritance for extends. Prefer relations between leaves; one that names a group is drawn only while that group is collapsed.
`

const GUIDE_SEQUENCE = `
## A sequence map
- The user chose a sequence map to follow behavior: who calls whom, in what order, under which condition. Elements are the participants, drawn left to right in list order; messages are the lines, top to bottom in list order. Messages are numbered (autonumber), and the user may refer to them by that number.
- Draw the flow the task is about, at the level of a call between classes or services; one map per flow. About 6 to 8 participants and 30 messages at most.
- Participants: \`kind\` actor for a person or the app, table for a database table, resource for a config or prompt file, external for another system; ids are ASCII and must not be a Mermaid word (Note, End, Loop, Alt, Par, Opt, Box, Rect, Actor…): NoteTable, not Note. A participant has no members.
- Messages: kind call (\`->>\`), reply (\`-->>\`), async (\`-)\`: a queue or a fire-and-forget call), note (a Note over \`from\`, or over from and \`to\`; its label is the text). A message to itself is a self call. Place a new message with \`after\` or \`before\` (a message id); without either it goes last. Ids are unique across participants, messages and fragments.
- Fragments frame a run of messages from \`first\` to \`last\`: alt (with \`branches\` for each else), opt, loop, par (\`branches\` for each and), and section, a cream band with its label as a title note: use sections for phases such as a transaction or a stage. Frames nest or stay apart; a frame inside an alt or par stays inside one branch.

## Colors on a sequence map
- On a message (or a note), a change other than keep draws a colored band behind it and marks it ➕ ✏ 🗑: this is how the user sees which calls are new, changed or removed. On a participant it colors the box in the browser and marks it.
- Give messages \`files\` (the call site, \`path:line\`) only when the call itself changes: the browser then lights that arrow when you read or edit around that line, and progress marks it 🔧. A message's line is what links it to your edits, so keep it current as the code moves. Participants carry their class files as usual.
`

const GUIDE_TAIL = `
## Working with the user
- Tell the user what changed on the map in a sentence; they are looking at it.
- Ask them to decide open decisions; never mark a decision chosen on your own. The user can also pick an option with a button on the map.
- Several sessions may share one map; map_update always applies to the latest file.

## Feedback from the browser
- The user clicks a box, a relation line, a group, a message, a frame or the whole map in the browser and writes feedback; it arrives as a prompt starting with "[design-map 피드백 #N ...]". It is the user's own words, sent from the page.
- Feedback marked "작업 중 전달" arrived while you were working: the user interrupted to steer you. Take it into account before your next step, then map_reply.
- For each item: answer it, change the map with map_update when the feedback implies a change, then call map_reply with its id and a short answer (it shows under the feedback in the browser). Touch code only when the feedback asks for implementation.
- When you need the user's choice, add a decision with options to the map instead of asking in prose: the user picks it on the map, and that pick arrives here as feedback with the decision already marked chosen.
- Fold, unfold, hide and reset from the browser are applied without you.`

/** What map_open returns: the parts every map shares, and those of its kind. */
export function guideOf(diagram: 'class' | 'sequence'): string {
  return `${GUIDE_HEAD}${diagram === 'sequence' ? GUIDE_SEQUENCE : GUIDE_CLASS}${GUIDE_TAIL}`
}
