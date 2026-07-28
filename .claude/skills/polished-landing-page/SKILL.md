---
name: polished-landing-page
version: "0.1.0"
description: Guide a coding agent through a 7-stage process for building a landing page or marketing site that looks like a designed product, not generic AI output. Covers scoping, design taste, self-verification, brand visual system, original imagery, layout reference, and component-level polish.
argument-hint: "[project description]"
allowed-tools: Bash, Read, Write, Edit, WebFetch, AskUserQuestion
user-invocable: true
---

# /polished-landing-page

A checklist-driven workflow for building landing pages that don't read as
"AI slop" — the same green-gradient-hero, same rounded-card, same generic
layout that shows up whenever a coding agent gets a one-line prompt and no
other direction. The fix isn't a better one-shot prompt; it's giving the
agent the same inputs a human designer would use: a clear brief, a real
visual system, real reference material, and a self-check loop.

This is a **process skill** — it has no bundled scripts. Follow the stages
below yourself, using whatever tools you have (Bash, Read/Write/Edit,
browser/screenshot tooling if available). Skip stages that don't apply to
the project; this is a checklist to adapt, not a rigid pipeline.

## Origin

Adapted from a public tutorial on using OpenAI Codex to build landing
pages (a 7-stage process built by the "AI Labs" channel). The underlying
ideas are general to any coding agent — this version reframes them for
Claude Code specifically and is meant to be edited as you find what works.

## Stage 1 — Scope it before you design anything

A one-line prompt ("build a landing page for X") makes the agent guess
who the page is for and what it should do, and it will guess wrong before
it guesses right. Before writing any code, pin down:

- **Audience** — who is this page for?
- **Product/purpose** — what does it do, in plain language?
- **Primary action** — what is the ONE thing you want a visitor to do?
  (join a waitlist, sign up, book a call, buy something.) This is the
  single most important line in the brief — it decides the CTA, the
  page structure, and what counts as "done."

Write this into the project's `CLAUDE.md` (or create one) so every future
session — not just this one — starts with the same context instead of
re-explaining it per prompt. Also add an explicit autonomy instruction at
the top: *"When you can verify or run something yourself, do it — don't
ask the user to do it for you."* Coding agents default to asking for
things they're fully capable of doing themselves (starting a dev server,
checking the result); naming this once in `CLAUDE.md` removes a lot of
friction.

## Stage 2 — Load real design taste, not defaults

Left alone, most models converge on the same handful of layouts and color
choices — technically fine, visually interchangeable with every other
AI-generated site. Counter this explicitly:

- If a design-quality skill is installed in this session (check `/help`
  or the available-skills list), invoke it before generating anything.
- If none exists, write your own short design-principles note (spacing
  scale, type scale, motion restraint, "no default purple/violet gradient
  hero unless the brand calls for it") and put it in `CLAUDE.md` or a
  `design-principles.md` the agent reads first.
- Be explicit about what to avoid, not just what to do — negative
  instructions ("don't use a generic vendor site-builder skill/template
  for the actual design work") are as important as positive ones, since
  agents default to whatever's fastest.

## Stage 3 — Make the agent verify its own work

Working code isn't the same as a page that looks right. If your agent has
browser/screenshot access, tell it (in `CLAUDE.md`, once) to always:

1. Load the page itself after building or changing it.
2. Check it at both a desktop and a narrow/mobile width.
3. Fix anything visibly broken before reporting "done."

If it doesn't self-correct on the first request, hand it back a
screenshot of the specific problem rather than describing it in words —
layout issues are much easier to fix from an image than from text.

## Stage 4 — Give it a real visual system (`design.md`)

A design-quality skill improves *general* taste; it doesn't give this
particular project its own identity. Without a project-specific visual
system, two different agents given the same skill will still converge on
similar palettes. Fix this with a `design.md`: one file describing the
concrete visual system for *this* brand — color palette (with hex
values), type scale, spacing scale, corner radii, shadow style.

- Write your own, or start from an existing open design-system reference
  (several public collections of `design.md`-style files exist for
  well-known products) and adapt it.
- Attach or paste the file, then ask the agent to apply it while
  explicitly preserving the layout, structure, and any animation work
  already done — you're re-skinning, not rebuilding.

## Stage 5 — Replace stock imagery with on-brand imagery

Stock photos rarely match a specific brand's visual system, and generic
AI landing pages are easy to spot partly because of mismatched imagery.
Once `CLAUDE.md` (product context) and `design.md` (visual system) both
exist, the agent has enough context to generate or source imagery that
actually matches:

- Create an `assets/` folder and reference it in `CLAUDE.md` so the agent
  knows where generated/sourced images belong.
- Ask for imagery that matches both the design system *and* the specific
  copy/content next to it — not generic decoration.
- If the agent supports a planning mode, use it before an image-heavy
  task, especially if image generation is rate-limited — review the plan
  before letting it burn budget on the wrong images.

## Stage 6 — Borrow layout ideas, not just colors

Copy and color can be original while the page *structure* still reads as
"default AI layout" — most noticeable in the hero section, since it's the
first thing anyone sees. Layout is hard to specify in text, so show,
don't tell:

- Pull 2-3 real reference screenshots for the section you're unsure about
  (Pinterest boards, Awwwards/Dribbble showcases, or direct competitors
  are good sources).
- Give the agent the screenshot(s) and ask it to use them as
  *composition* inspiration — what goes where, not a pixel copy.
- Only do this for sections you're actually unhappy with; don't
  re-litigate parts that already look good.

## Stage 7 — Polish weak components individually

By this point the overall design should be solid; some individual
components (nav, buttons, a section background) may still feel generic.
Rather than re-prompting the whole page, fix these in isolation:

- Component libraries (21st.dev, Godly, and similar sites) have
  drop-in pieces — nav patterns, animated backgrounds/shaders, buttons —
  you can hand the agent as a reference or literal snippet.
- Apply component-level changes one at a time so you can evaluate each
  before moving to the next.
- If the page feels sluggish after adding heavy animation/motion effects,
  explicitly ask the agent to optimize for performance — this is usually
  a single, cheap follow-up prompt, not a redesign.

## Checkpoint and ship

- **Checkpoint with git as you go.** Ask the agent to make a local commit
  after each stage that lands well, with a clear message. This gives you
  free rollback points if a later stage makes things worse — you don't
  need any remote/hosting setup for this, just local commits.
- **Deploy last.** Once the page is right locally, deploy it (whatever
  your agent's deployment tool/skill is, or a standard host like Vercel/
  Netlify) and make sure sharing is set to public before handing out the
  link. Add a custom domain if this is going to production.

## Notes for editing this skill

This is a first pass — edit stages, add your own resource links (design
system libraries, component libraries, inspiration sources you actually
use), or split it into a multi-file skill with bundled reference docs as
it grows. Treat the 7 stages as a checklist to adapt per project, not a
rule to follow rigidly — skip stages that don't apply (e.g. stage 5 is
irrelevant if the brand already has a full stock of real photography).
