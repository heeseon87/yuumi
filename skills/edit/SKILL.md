---
name: yuumi:edit
description: Use when editing long drafts or multiple files where copy-paste workflow is tedious, when you have scattered edit instructions across a document, or when edits across files need to stay consistent with each other
version: 1.4.1
---

# Edit (Spatial Editing)

## Overview

**Position IS context.** Instead of bringing text TO Claude, leave instructions WHERE they belong using `{curly brace comments}`.

## When to Use

- Editing long documents with multiple scattered changes
- Making consistent edits across multiple files
- Draft revision workflow where you want to mark issues in-place
- Any situation where copy-paste back-and-forth is annoying

**Not for:** Single, focused edits where you can just describe what to change

## The Command

```
/edit                    # Currently open file or search for {thoughts}
/edit draft.md           # Specific file
/edit draft.md notes.md  # Multiple files
```

If no file specified and nothing open, searches vault for `{thoughts}`:

```bash
rg "\{[^}]+\}" --type md -l
```

## Syntax

Mark edit instructions with curly braces `{your instruction here}`:

```markdown
# Why Vaults Matter

Vaults give claude memory
{feels abstract - add concrete mechanism}

Without persistent storage claude forgets everything between sessions
{this is the key point, make it hit harder}

The solution is simple
{dont say simple, show it instead}
```

## Processing Rules

1. **Read the file** and identify all `{...}` comments
2. **Each comment applies to its surrounding context** (paragraph, sentence, or section)
3. **Apply edits** based on the instruction
4. **Remove the `{...}` markers** after processing
5. **Output summary** of changes made

## Output Format

After processing, show a summary:

```
Processed 3 edits in why-vaults-matter.md:
1. "feels abstract" → added concrete mechanism
2. "make it hit harder" → expanded with specific pain points
3. "dont say simple" → replaced with direct statement
```

## Example Transformation

**Before:**

```markdown
Vaults give claude memory
{feels abstract}
```

**After:**

```markdown
Vaults give claude persistent memory across sessions by storing context in files it can read and write
```

## Multi-File Consistency

When editing multiple files, ensure references stay consistent:

```
/edit api.md docs.md changelog.md
```

If `api.md` has `{rename this endpoint to /users/profile}`, update all references in other files too.

## The Workflow

1. Write your draft without stopping
2. Quick read - drop `{thoughts}` wherever something feels off
3. Run `/edit`
4. Review changes

## Common Instructions

| Instruction     | Meaning                         |
| --------------- | ------------------------------- |
| `{expand}`      | Add more detail                 |
| `{cut}`         | Remove this                     |
| `{too vague}`   | Make specific                   |
| `{example?}`    | Add an example                  |
| `{tone}`        | Adjust voice/style              |
| `{→ section X}` | This relates to another section |
