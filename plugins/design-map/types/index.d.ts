// The design-map contract: the map's own types (durable, written to disk) and
// the session values the mod keeps ($.state, kept across hot reloads).

/** How much an element touches existing code: grey → light purple → purple → red, new code green. */
export type Change = 'keep' | 'result' | 'modify' | 'delete' | 'add'

/** table is a database table; resource is a non-code file the code reads (a config, a prompt, a template). */
export type ElementKind = 'group' | 'class' | 'interface' | 'enum' | 'table' | 'resource' | 'external' | 'actor'

/** What the map is drawn as, chosen when it is made: boxes and relations, or participants and messages. */
export type Diagram = 'class' | 'sequence'

/** Mermaid-semantic relation kinds; a dashed box (undecided design) is a different thing. */
export type RelationKind =
  | 'association'
  | 'dependency'
  | 'inheritance'
  | 'realization'
  | 'composition'
  | 'aggregation'

export type Direction = 'TB' | 'LR' | 'BT' | 'RL'

export type Member = {
  text: string
  /** ✏ modify, ➕ add, ➖ delete; absent, a plain line with no marker. */
  change?: 'modify' | 'add' | 'delete'
  done?: boolean
}

export type Element = {
  /** ASCII, unique across elements; Mermaid `style` breaks on other ids. */
  id: string
  /** Shown text (Korean is fine). An expanded group shows its id instead: namespaces have no label. */
  label?: string
  /** Default `class`. Only a `group` may have children, and a group has no members. */
  kind?: ElementKind
  parent?: string
  /** Default `keep`. */
  change?: Change
  /** A decision id; while that decision is open the box is dashed and tagged `[D1]`. */
  decision?: string
  /** Its `decision`'s option id: this exists only on that path, and goes when another is chosen. */
  option?: string
  steps?: number[]
  done?: boolean
  members?: Member[]
  /** Paths relative to the map's `repo`; a changed one marks the element as in progress. */
  files?: string[]
  note?: string
}

export type Relation = {
  /** Endpoints are usually leaves; one naming a group is drawn only while that group is collapsed. */
  from: string
  to: string
  /** Default `association`. */
  kind?: RelationKind
  label?: string
  decision?: string
  /** Its `decision`'s option id: this exists only on that path, and goes when another is chosen. */
  option?: string
}

/** call ->>, reply -->>, async -), note: a Note box over `from` (and `to`) with the label as its text. */
export type MessageKind = 'call' | 'reply' | 'async' | 'note'

/** One line of a sequence map, in drawing order. */
export type Message = {
  /** ASCII, unique among elements, messages and fragments. */
  id: string
  /** Participants (elements); a message to itself is a self call. */
  from: string
  /** Required except on a note. */
  to?: string
  /** Default `call`. */
  kind?: MessageKind
  label?: string
  /** Default `keep`; the others draw a colored band behind the line. */
  change?: Change
  decision?: string
  /** Its `decision`'s option id: this exists only on that path, and goes when another is chosen. */
  option?: string
  steps?: number[]
  done?: boolean
  /** The call site (`path:line`), only when the call itself changes. */
  files?: string[]
  note?: string
}

/** alt/opt/loop/par draw Mermaid's frame; section is a grey band with the label as its title. */
export type FragmentKind = 'alt' | 'opt' | 'loop' | 'par' | 'section'

/** A frame around a run of messages, from `first` to `last` (message ids, inclusive). */
export type Fragment = {
  id: string
  kind: FragmentKind
  label?: string
  first: string
  last: string
  /** alt: each `else`, par: each `and`, starting at a message inside the fragment. */
  branches?: { at: string; label?: string }[]
  change?: Change
  decision?: string
  /** Its `decision`'s option id: this exists only on that path, and goes when another is chosen. */
  option?: string
}

export type DecisionOption = {
  id: string
  text: string
  impact?: string
  /** Why this path was not taken. Written when another option is chosen, and kept after. */
  rejected?: string
  /** One value per the decision's `axes`, in the same order, for the comparison table. */
  by?: string[]
}

export type Decision = {
  /** The question's id (`D1`); options are `D1-a`, `D1-b`. */
  id: string
  question: string
  options?: DecisionOption[]
  /** The chosen option's id; absent while the decision is open. */
  chosen?: string
  rationale?: string
  /** The option being considered: drawn faintly on the map, committed to nothing. */
  leaning?: string
  /** What has to be known before this can be decided, in the user's words. */
  blocked?: string
  /** Hard to undo: the browser makes choosing deliberate instead of one click. */
  oneWay?: boolean
  /** Column names that compare the options side by side; each option fills them in `by`. */
  axes?: string[]
}

export type DesignMap = {
  schema: 1
  /** Default `class`; never changes once the map exists. */
  diagram?: Diagram
  title: string
  context?: string
  direction?: Direction
  /** The working tree the elements' `files` are relative to (absolute). */
  repo?: string
  /** The git ref progress is measured from; absent, uncommitted changes only. */
  base?: string
  /**
   * Repo-relative folders this map is about: changed files elsewhere are other work, not
   * "outside the map". Absent, the whole repo; [] a design-only map that counts nothing outside.
   */
  scope?: string[]
  /** Bumped on every write, so two sessions never overwrite each other blindly. */
  revision?: number
  /** A sequence map's participants, left to right. */
  elements: Element[]
  /** Always empty on a sequence map. */
  relations: Relation[]
  /** Sequence maps only, in drawing order. */
  messages?: Message[]
  /** Sequence maps only. */
  fragments?: Fragment[]
  decisions?: Decision[]
}

/** What is shown right now; changes often and never touches the facts above. */
export type MapView = {
  /** Groups drawn as one box, their descendants folded in. */
  collapse?: string[]
  /** Elements left out, with their descendants and relations. */
  hide?: string[]
  direction?: Direction
  /** Default true; the browser page draws its legend beside the diagram and turns this off. */
  legend?: boolean
}

/** The active map as the session holds it. */
export type DesignMapDoc = {
  name: string
  /** The map file; the view sits beside it as `<name>.view.json`. */
  path: string
  map: DesignMap
  view: MapView
  /** The map file's modification time when last read or written. */
  mtimeMs: number
  /** The title the person gave the map in the drawer, when they renamed it; else the map's. */
  title?: string
}

/**
 * The drawer's record of an item, beside its content (`<id>.meta.json`): only the page server
 * writes it, from the person's edits in the browser and from diagram_save.
 */
export type DrawerMeta = {
  /** A plain diagram's title, or the name the person gave a map (its own title stays in the map). */
  title?: string
  tags?: string[]
  pinned?: boolean
  /** Markdown shown beside the diagram. */
  memo?: string
  createdAt?: number
  /** When the title or memo last changed: the item counts as updated then. */
  editedAt?: number
  /** A plain diagram's revision; a map keeps its own in the map. */
  revision?: number
}

/** The local server the browser view comes from. */
export type DesignMapServer = {
  url: string | null
  error: string | null
}

/**
 * Whether a model turn is running, and the feedback the running one carries. In $.state, not
 * the module, because the mod can reload in the middle of a turn (its own tool call reloads it).
 */
export type DesignMapTurn = {
  isRunning: boolean
  turnId: string | null
  /** The feedback this turn carries: from its prompt, or delivered into it while it ran. */
  feedback: { name: string; ids: number[] } | null
  /** Repo files this turn's edit tools touched (repo-relative). */
  edited: string[]
  /** Whether this turn changed the map (map_update or map_view). */
  isMapChanged: boolean
  /**
   * The working tree's changed files when the turn began: the git side of what it changed.
   * null while not measured yet (no map was open): the first measurement in the turn sets it.
   */
  changedAtStart: string[] | null
}

/** Code changed while the map stood still: one episode, told once, until the map changes. */
export type DesignMapDrift = {
  name: string
  files: string[]
  turnId: string
}

/** Which elements the working tree says are being worked on, and what changed off the map. */
export type DesignMapProgress = {
  touched: string[]
  outside: string[]
  changed: number
  /** The changed files themselves (repo-relative). */
  files: string[]
  checkedAt: number
  error?: string
}

declare module 'claude-code' {
  interface PluginState {
    'design-map': {
      doc: DesignMapDoc | null
      server: DesignMapServer
      progress: DesignMapProgress | null
      turn: DesignMapTurn
      drift: DesignMapDrift | null
    }
  }
}
