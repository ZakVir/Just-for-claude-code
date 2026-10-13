# Research notes — welcome screens with liquid glass

Method: `appllama-usage` + `appllama-app-design-skill` (Appllama skills). The
Appllama MCP (`mcp.appllama.io/mcp`) was **not connected** in the session that
built this, so nothing here came from MCP calls. Everything below comes from
Appllama's public app pages (the free "Welcome — first open, captured live"
recordings) and from the public Threads post the user supplied. Screen media
is not committed: it's third-party footage. Links are kept so it can be
re-studied.

## Primary reference: Wabi

- Appllama page: https://appllama.io/apps/6747768928/wabi (Social Networking,
  $20/mo, 9 flows: Welcome 2, Onboarding 9, Paywall 1, …)
- Intro designer's post (collab with @wabi): https://www.threads.com/share/BAZYwSRWeo/

### Capture A — Appllama "first open" (1.3 s)

| t | What happens |
|---|---|
| 0.0 | App icon (5 black dots on a white squircle) at screen centre — continuity from the springboard launch. |
| 0.3 | The dots turn frosted/translucent and the squircle dissolves. |
| 0.5 | The dots fuse into one liquid-glass sphere carrying a crisp `+`. Headline "Create and discover mini-apps" and a black "Let's go" pill fade in. |
| 0.7–1.3 | Tiny mini-app avatars drift toward the sphere. Inside its rim they show as smeared, inverted copies with cyan/yellow fringes (chromatic dispersion). "mini-apps" gets a hand-drawn scribble strike, and "wabis" types in after it. |

### Capture B — designer's intro reel (26 s, two loops)

| t | What happens |
|---|---|
| 0:00 | Entry screen: small centred text "A new era of software is here." and a frosted dome half-submerged at the bottom edge with "Swipe up to enter". |
| 0:01–0:03 | Finger drags the dome up; its trailing rim lights up with a saturated blue/indigo dispersive band; the entry text fades. |
| 0:03–0:05 | The rising lens passes over "Meet Wabi" — the text is magnified like a ball lens; near the rim it wraps and appears **upside down** ("teeM"), with rainbow fringes. Outside the lens that text is not yet visible: the lens works as a **portal**. |
| 0:06–0:07 | Lens shrinks into a button-sized glass bead above "Meet Wabi. / The first personal software platform." and the Google/Apple auth buttons. |
| 0:08–0:12 | A fountain of avatar **glass bubbles** bursts out of the bead and piles up under the Dynamic Island like physics bodies (collisions, jostling). Each bubble refracts its own picture. |
| 0:12–0:14 | The bead is draggable: dragged over the headline it bends live text ("et Wabi.", "st pers"). |

## Category grammar (AI assistant welcome screens on Appllama)

Studied the public first-open captures of Claude, ChatGPT, Gemini, Grok,
Perplexity, v0, Meta AI, Poe and Arc Search.

**Convergence (table stakes)**
- Logo-as-transition: the icon/logo carries over from the springboard, holds about 0.5 s, then moves or transforms (Wabi, Gemini, Meta AI, v0, Arc, Claude).
- One value-prop line, centred, large; Claude sets it in a serif ("The AI for problem solvers"), Arc emphasises one word in italic of the same family.
- Primary action is a full-width ink pill at the bottom (black on light). Most AI apps put auth on this screen.
- Ambient motion lives only in the hero; copy and CTAs settle still.

**Divergence (real choices)**
- Auth on welcome (Claude, Grok, Perplexity, Poe, v0) vs one "start" CTA (Wabi, Arc, Meta).
- Terminal flavour: Grok types "Understand the Universe_" with a cursor.

**Claude's own welcome (palette source)**: warm ivory ground, ink text,
clay-orange spark + clay line illustration, serif headline, black pills.

## What we took

1. Logo → glass continuity (Capture A), but the logo is my spark, which melts into droplets that fall into the dome.
2. Swipe-up dome with a dispersive trailing rim (Capture B), as a one-way door.
3. Ball-lens refraction with rim inversion + RGB dispersion, and the lens as a portal into the next headline.
4. Strike-and-retype beat in the headline (Capture A), with an agent-style caret (Grok's terminal cue).
5. Glass-bubble burst with collision physics, using the agent's artefacts (clay tokens) instead of avatars.
6. Draggable bead that refracts the headline and springs home with the finger's velocity.

## What we changed / where we aim to beat it

- The bubbles also collide with the bead, so dragging the bead through the pile pushes them around.
- The bead stretches along its velocity, and a goo bridge to its home spot snaps when pulled too far. It also has a haptic on snap-home.
- Reduce Motion: the whole sequence collapses to cross-fades, and bubbles appear at precomputed rest positions.
- One accent (clay) only; the dispersion ramp is an optical effect inside the glass, not chrome colour.
