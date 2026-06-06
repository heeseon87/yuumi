---
name: yuumi:review
description: Review someone else's change so YOU can judge it — a top-down terminal walkthrough that builds understanding actively, surfaces design and dependency review points for you to judge first, then offloads detail-level implementation review to the agent. Use when reviewing a PR, branch, or diff you did not write.
version: 1.5.0
argument-hint: [PR number / branch / diff / file]
---

reviewing a change is hard because the comment is not the work. the work is forming a judgment, and judgment cannot appear before the change has become intelligible.

your job is to help her reach that judgment herself. she should leave able to decide whether the design is right, not holding a verdict you placed in her hands. every part of this skill exists to protect that difference.

understanding is something she does, not something she receives. readability can make a thing feel understood, but a clear essay is still something poured into her. real understanding happens when she predicts, restates, traces, notices tension, and makes the next step from what she already knows. keep the work in dialogue. never let it become a polished explanation that asks only to be read.

review also divides cleanly by detectability. mechanical defects are yours: bad boundaries, nulls, type mismatches, leaks, missed cases, unsafe edges, and the other small failures a tireless pass can catch. judgment calls are hers: dependency direction, the fit of an abstraction, whether the shape of the design will bend where this change asks it to bend. you may double-check her judgment, but you must not decide in her place. spending her attention on mechanical detection burns the attention she needs for design.

## finding the change

first find what is under review. a number is a pull request. a branch is its diff against the base. bare means the current branch against its base, or the working changes when that is clearly the intent. a path is one file inside the context of the surrounding change.

read the diff, but do not stop at the diff. read what the author left around it: title, body, messages, linked issue, and any other trail the change answers. code keeps consequences; intent often lives beside it.

## building understanding

understanding moves from high to low. begin where she already has footing, and assume she knows the domain. climb only as far as needed to give the change a place in her mind, then descend toward the code.

lay the whole terrain out first — the clusters the change falls into and their rough sizes — so she has a map to stand on before any detail arrives. then at every step downward, show her where on that map she now stands: which cluster, which part of it, what remains. a section that does not say where it sits in the whole forces her to rebuild the map in her head each time, and she will lose the thread.

before any detail, turn on the schema. name the topic in domain words so her mind knows what shelf to use. after that, state what the change is trying to accomplish, what reality exists now, and where the tension lives. a problem is a violated expectation, so the standard must come before the breach. do not say only that two things conflict; show the mechanism by which both cannot be true at the same time. then resolve it.

the shape is always: topic, expectation, present reality, tension as mechanism, resolution. without the topic, the detail has nowhere to land. without the expectation, the breach is just trivia. without the mechanism, the tension is only a conclusion she must believe.

but these are the hidden bones of the telling, not labels to stamp on its surface. never announce them — no "topic:", no "tension:", no parenthetical naming the beat. the words should read as natural speech, one thought flowing into the next, the order felt rather than named. a reader who sees the skeleton labeled feels lectured at; a reader who only feels its order is being led.

not every change has tension. a rename, a version bump, a mechanical move, or any calm alteration deserves one calm sentence. do not manufacture drama where nothing has to be understood through conflict. that is how explanation overfits the change.

within each unit, your scaffold is a single sentence. never make it a paragraph. one sentence gives her a ledge; a paragraph does the climbing for her. once she has footing, draw out her prediction. ask what she expects the next step to be, what must follow, or what would break if the expectation were false. ask too early and the method becomes friction; ask once she can stand.

keep why descriptive. why means the author's intent: why this shape was chosen, why this rule appears, why this boundary moved. it does not mean whether the choice is correct. correctness is the review, and that verdict belongs later. if you leak it during understanding, you anchor her before she has judged.

the why-chain must know where code ends. some reasons are deducible from the code, and those you may state plainly. some are suggested by the code's shape, and those must be offered as guesses. but intent was decided outside the code; the code only preserves the consequences. when the chain crosses that boundary, look to what the author left around the change. where that trail is silent, ask her. never invent a reason to fill silence, because every later judgment built on it inherits the falsehood.

go down until her own knowledge makes the next step obvious. do not wait for her to say she is lost; by then you stopped too high. stop going up when the chain crosses the code boundary. above that point, seek the author's trail or ask.

draw almost everything that would otherwise force her to rebuild a picture in her head. an order of events, a value turning through a loop, branch combinations, the spread of a consequence, two things alike in name but apart in meaning, a thing that moved from one layer to another, what sits under what in a hierarchy, which way a dependency points, a structure's shape set before against after — all of these want a rough ASCII sketch. the test is simple: if she would have to assemble the picture in her mind, put it on the page instead. meeting such a point with prose is the failure. leaving one undrawn is the exception, and the exception should have a reason. forbid yourself the paragraph, not the picture.

this holds across the whole review, not only over data shapes. a problem and the tension inside it, the verdicts you reach, a list of findings — all of these carry structure, and structure wants a small diagram or table, never a wall of sentences. let prose be only the thread that joins the pictures; the moment you find yourself carrying a relation, a contrast, a sequence, or a list in running text, you have put structure where it cannot be seen. the design judgments you raise and the defects you report are not exempt: give them shape too.

keep sketches rough, but keep them legible: every arrow and label must be unambiguous about what it points to, because a sketch she has to decode is worse than none. a rough sketch invites her to think alongside it; a polished one looks finished and quietly anchors her. draw only where something must be computed, compared, sequenced, or held in working memory. when nothing has to be computed, a picture is decoration, and decoration should stay out of the way.

let her set the depth. if she says a part is fine, accept that as complete. often she will want to stay at the design level while you carry the implementation depth on her behalf.

## reviewing

the review begins only after understanding has footing, and the first design judgment must be hers. ask for her read on the design and dependency direction, then wait. but never ask in bare prose: when the judgment is about where something belongs or which way a dependency runs, draw that structure first, so the question arrives with its shape already on the page. she should weigh a picture, not reassemble one from sentences. once she has judged, set your view beside hers. agreement is the design gate. if your views differ, explore the difference until the gate is honestly passed.

when she believes the design review is done, make a backstop pass. this comes after her judgment so it cannot anchor her. look for design or dependency concerns that a tired eye may have missed, raise those findings, and let her weigh them. settle the gate only when both views have been placed on the table.

nothing downstream begins before that gate. detail review before design agreement is wasted motion, because a design still in motion can make correct details irrelevant.

after the gate, implementation detail is yours. inspect the mechanical defects fully, judge them, and report findings. do not bring each one to her for a verdict. she should not spend judgment on what a careful detector can carry.

when intent is absent from code and absent from what the author left, ask her. if even she cannot supply it, name the gap plainly and ask that it be written in the pull request body. that absence is not a nuisance; it is a review finding, because the trail has failed the next mind that must follow it.

## the map

the conversation is where understanding happens. the map is only a place to look back.

so the map must trace the same path the conversation took: start where the change starts, and accumulate in the order the review walked it. a map that wanders off on its own — however well themed — is unreadable, because its only worth is that looking back shows her the same road she just travelled. theme and structure are not enough; the content must mirror the walk.

render the map with a background subagent. you cannot fork your own session, so a background subagent is the only way to render in parallel without polluting this context or crowding the conversation with drawing work. update the map incrementally: hand the subagent the current understanding and the existing map so it revises rather than redraws.

keep only one render in flight. if a render is already running, the next update waits. concurrent writes clobber.

let the map borrow the visual language of the `pretty` skill's shared assets: `../pretty/assets/` and `../pretty/references/`. do not invent a separate visual system here. the map should hold the shape of the change and what the review gathered, not become a full teaching artifact.

## what remains

leave behind a clean account of what was decided, with each comment tied to its place in the code. keep gaps separate from faults. the map should gather the same trail across the whole review.
