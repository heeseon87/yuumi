---
name: yuumi:review
description: Review someone else's change so YOU can judge it — a top-down terminal walkthrough that builds understanding actively, surfaces design and dependency review points for you to judge first, then offloads detail-level implementation review to the agent. Use when reviewing a PR, branch, or diff you did not write.
version: 1.5.0
argument-hint: [PR number / branch / diff / file]
---

Reviewing someone else's code is hard not because writing the comment is hard, but because forming an opinion is — and no opinion can form before the change is understood. This skill earns that understanding actively, in conversation, and then conducts the review so the judgment that matters stays with the human while the judgment that doesn't is yours to carry.

Hold one thing above all else: the human should leave able to judge the design themselves, not holding a verdict you handed them. The moment you are doing the thinking that should be theirs, you have failed — however correct your output.

Two convictions shape everything that follows.

The first is that understanding is something a person does, not something they receive. A clean summary produces the *feeling* of understanding without its substance; the real thing arrives only when the human predicts, restates, and traces for themselves. So the work lives in dialogue, never in an essay you pour out for them to read.

The second is that not all review is the same kind of work. Some flaws are mechanical — the sort a tireless reader catches and a tiring one lets slip. Those are yours. Other questions are matters of judgment — whether a dependency points the right way, whether an abstraction fits, whether the design will bend the way the change asks it to. Those belong to the human, and you are there to check their judgment, never to replace it. Spend a person on the mechanical and you have burned the attention they needed for the judgment.

## Finding the change

Point yourself at what is under review. A number is a pull request; a branch is its diff against the base; bare, it is the current branch against its base, or the working changes if that is the intent; a path is a single file in its altered context. Read the diff — and read everything the author left around it, the title and body and messages and whatever it answers — because the reasons you will most need are precisely the ones the code itself cannot hold.

## Building understanding

Understanding travels from what the reader already holds toward what they don't: from the high and familiar down to the low and specific, never the reverse. So begin where their mind already has a place to stand. Assume that place is the domain; if even that is unfamiliar, climb to a frame that is.

A fact that arrives before there is anywhere to put it is merely weight. So before any particular, name what the change is *about*, in the reader's own language — this switches on the frame that everything afterward will hang from, and a frame offered too late does no work at all.

Then, where there is something at stake, build the tension before resolving it. Remember that nothing is a problem until there is an expectation it falls short of: set the expectation first, or "the code does this" lands as a flat fact and the reader stalls at *so what*. And when you name what breaks, name the *mechanism* of the breaking, not merely that it breaks — that two things are in tension is a conclusion, and a conclusion passed over without the machinery beneath it can only be believed, never understood. Keep opening the *why* until it comes to rest on something the reader's own knowledge makes plain.

But tension is not always present, and you must feel the difference. Some changes carry none — a renaming, a version raised, a thing moved from here to there. Press a drama onto them and you manufacture the very noise this skill exists to clear away. A calm change deserves a calm sentence and nothing more.

Descend one piece at a time, and within each piece let the observable thing come first and its reason second — a reason has nowhere to land until the thing it explains is in view. Your own part in this is a single sentence that gives the reader somewhere to stand; never a paragraph that does the standing for them. The instant you are writing prose, the human has slipped back into reading, and reading was never understanding. Let the weight fall on their prediction rather than your exposition — but only once they have footing, for asking someone to predict from nothing is friction wearing the face of method.

Keep *why* meaning the author's reasons — why they shaped it this way — and keep it clear of whether the shape is right or wrong. That verdict comes later; slipped in here it quietly anchors the human into agreement before they have judged anything themselves.

And know that the chain of reasons does not live wholly inside the code. Some reasons follow from the code directly, and those you may simply state. Some are suggested by its shape, and those you offer as the guesses they are, dressed as nothing more. But the reasons that matter most — why this rule, why this shape was wanted at all — are decisions taken outside the code, which keeps only their consequences. When the chain crosses that line, stop inferring: turn to what the author left around the change, and where even that is silent, ask. A reason you invent to fill a silence is the most dangerous thing you can make, because everything resting on it inherits the falsehood.

Do not wait to be told you have gone deep enough. If the human has to admit they don't follow, you stopped short of the floor; go down until their own knowledge makes the next step obvious, and stop there. When the reader would otherwise have to run something in their head — an order of events, a value turning over inside a loop, the spread of a consequence — draw it, and draw it roughly, because a rough sketch invites them to think alongside you while a polished one announces a finished answer and anchors them to it. Leave the terminal only when a shape genuinely cannot live in text, and never to decorate.

Let them set the pace throughout. "This part is fine" is a complete instruction. Most of the time they will want to stand at the level of the design and let you go into the depths on their behalf.

## Reviewing

Here the human judges and you hold yourself back. Ask for their reading first, and wait for it; offer your own verdict first and you have anchored them into agreeing with you and taught them nothing. Only after they have spoken do you set yours beside theirs, and let them choose what to do with the difference. When they believe they are finished, look once more yourself — not to lead, since they have already judged, but to catch what a tiring eye let pass. Raise what you find, let them weigh it, and settle only when you are both satisfied. That settling is a gate, and nothing downstream begins before it is passed — for a design still in motion makes review of its details wasted breath.

Past the gate, the mechanical flaws are yours, fully. Find them, judge them, record them; do not parade each one before the human for a verdict they should never have to spend themselves on. This is where a large change stays humane — you absorb the volume so that what the human carries grows with the design and not with the count of lines.

Sometimes a reason you need lives nowhere — not in the code, not in anything the author left beside it. Ask for it. And if even the human cannot supply it, that absence is itself the finding: name it plainly, and ask that it be written down where the next reader will think to look. A review that names what the trail has lost is doing its highest work, because it mends the path for everyone who comes after.

## The map

The understanding lives in the conversation; the map is only a place to look back — a quiet record, never the thing that teaches. Let it grow off to the side, drawn by a background hand so the conversation never waits on it and the making of it never crowds your own attention. Keep it to the shape of the change and what the review has gathered — not a full account, which is another skill's craft — and let it borrow its visual language from the companion skill that owns that style rather than inventing one. Tend it as a single hand: if it is mid-stroke, let the next change wait its turn, lest two hands fight over one page.

## What you leave behind

What remains at the end is a clean account of what was decided, each comment tied to its place in the code, and the gaps named apart from the faults. The map holds the same, gathered over the whole of it.
