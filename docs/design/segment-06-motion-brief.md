# Segment 6: motion (pulled forward)

Demo: `docs/design/comparisons/06-motion.html`. Three personalities run on the decided register home (with "What changed") and the B+ Kaveri file, at desktop and phone size. Each frame has Replay, Skeleton, Empty, light/dark and a Reduced switch, and each personality has a spec panel of tokens. Built with CSS and the Web Animations API, with no CDN library. The chart is a placeholder until segment 3.

## 1. Instrument: snap, tick, roll
- **Feel:** 120/180/220 ms, one ease-out `(0.2,0,0,1)`, `steps(4)` ticks, no overshoot.
- **Borrows:** Emil Kowalski: under 300 ms, ease-out to enter, `scale(0.97)` press, no motion on frequent actions (content never fades in). Rauno Freiberg's interfaces list: motion starts at its trigger, so the card grows out of its chip and the strip opens as a drawer. A sliding tab indicator; odometer counts.
- **Rejects:** content fades, parallax, springs.
- **Risk:** can feel cold; digit rolls must never reach financial figures.

## 2. Paper: glide, draw, settle
- **Feel:** 160/240/300 ms, long-tailed `(0.22,1,0.36,1)`.
- **Borrows:** a shared-element view transition from register row to file title (FLIP fallback); blocks that settle once per session; proof-style diff marking; Emil's 2 px blur on crossfades; a smoothed hairline.
- **Rejects:** stamps, counters, steps.
- **Risk:** the slowest; its parallax is a decorative scroll effect (R2-6 scores 1); the strike costs some legibility.

## 3. Terminal: draw, count, stamp
- **Feel:** 0 ms feedback; data up to 280 ms, linear or stepped.
- **Borrows:** a chart line that draws to the 30-day data cap, then the cap label stamps; count-ups; a single "Watching" pulse; a type-ahead highlight; the hairline on CSS `animation-timeline: scroll()`.
- **Rejects:** eased interactions, morphs.
- **Risk:** count-ups show false figures on a compliance-sensitive page; busy.

## Motion moments for the build

| Moment | Technique | Library |
|---|---|---|
| Hover, press, focus | Transitions | CSS |
| Row to file title | Shared `<ViewTransition>` name | View Transition (React) |
| Strip, card from chip | Clip plus translate from the trigger | Motion (LazyMotion) |
| Index indicator, reorder | `layoutId`, `layout` | Motion |
| Counts | Digit roll | NumberFlow |
| Status tick-in | Stepped clip keyframes, in view | CSS |
| Chart to data cap | `pathLength` + `stroke-dashoffset` | CSS, or Recharts `"auto"` |
| Reading progress | `scroll()` timeline, `@supports`, JS fallback | CSS |
| Tab bar hide | Transform on scroll direction | Motion `useScroll` |
| Skeleton to content | Loaded layout with the ink removed | CSS |

GSAP is not needed (no pinning, scrubbing or split text). No Lenis.

## Reduced motion
- The OS setting is honoured. In the build, use `MotionConfig reducedMotion="user"` plus CSS rules for `prefers-reduced-motion` and `::view-transition-*`.
- Everything becomes instant, or a single 120 ms fade for screen changes, cards, the strip and arriving content. Numbers show their final value.
- The scroll-linked hairline stays, because it moves only when the reader scrolls. With Reduced on, it was the only non-opacity animation left (checked in headless Chrome).

## Performance
- Only transform, opacity and clip-path animate.
- The h1 (LCP) never animates. Below-fold effects are armed on the client only, and anything already in view runs before first paint, so there is no `opacity: 0` in server HTML.
- Measured CLS is 0 on load and across replay, sort, skeleton, empty, navigation and scroll in all three. The skeleton reuses the loaded layout, and search holds the register's height.
- No single animation is longer than 300 ms; staggers finish within 500 ms.
- A watchdog completes stalled animations and counts in hidden tabs, so a figure never stays at an intermediate value.
- Client cost: Motion `m` 4.6 kB plus `domAnimation` 15 kB, and NumberFlow 6.3 kB, in `"use client"` leaves.

## Recommendation
**Instrument as the system**, plus Paper's title morph and Terminal's chart draw-to-cap and scroll-driven hairline. It is the fastest, keeps reading content still and suits a file a reader audits. Drop parallax, figure count-ups and auto-typing.
