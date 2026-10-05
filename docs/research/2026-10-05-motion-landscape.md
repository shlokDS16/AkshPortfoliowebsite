# Motion landscape for a Next.js 16 research desk (researched 2026-10-05)

Versions and publish dates come from the npm registry (queried 2026-10-05). Gzip sizes come from the bundlephobia API for the whole package entry, so they overstate tree-shaken use. Where a figure is from a blog and not a primary source it is marked (secondary).

## Recommendation

Use CSS first, Motion second, and skip everything else unless a specific need appears.

1. **CSS transitions and keyframes** for hover, press, focus, row highlight and skeleton states. No JavaScript.
2. **React `<ViewTransition>`** for route changes and shared-element morphs (a thesis card to its detail header). No config flag is needed in the App Router, and no library.
3. **Motion via `LazyMotion` and `m`** for layout animation (inbox reorder, accordion, tab underline) and `AnimatePresence`. Wrap the app in `<MotionConfig reducedMotion="user">`.
4. **NumberFlow** (`@number-flow/react`) for animated figures.
5. **Recharts 3 with `isAnimationActive="auto"`**, or visx if the bundle matters. Draw-on lines use SVG `pathLength`.
6. **Native CSS scroll-driven animations** for reading-progress bars and subtle reveals, guarded by `@supports`. Do not use Lenis.
7. **Copy-paste only** from MIT kits (Motion Primitives, Magic UI), after reading each snippet.

## Comparison

| Tool | Version (date) | Licence | Gzip size | React 19 / Next 16 | Verdict |
|---|---|---|---|---|---|
| Motion (`motion/react`) | 14.0.0 (2026-10-02) | MIT | `motion` ~34 kB; `m` + LazyMotion 4.6 kB + `domAnimation` 15 kB or `domMax` 25 kB; `useAnimate` mini 2.3 kB | Peer `^18 \|\| ^19`. Needs `"use client"`. | Primary |
| GSAP + `@gsap/react` | 3.15.0 (2026-04-13); hook 2.1.2 | Free "no charge" licence, not OSI open source | Package entry ~27 kB; hook 0.5 kB | Works in client components | Only for SplitText or pinned timelines |
| anime.js | 4.5.0 (2026-06-22) | MIT | Full entry ~40 kB | Framework-agnostic | Skip, overlaps Motion |
| React Spring | 10.1.2 (2026-06-24) | MIT | ~20 kB | Peer includes 19 | Skip |
| Theatre.js | 0.7.2 | Apache-2.0 | ~31 kB core, plus studio | Not checked | Skip, built for sequenced scenes |
| Rive | 4.36.0 | MIT | WASM runtime ~200 kB (secondary) | Peer includes 19 | Skip, too heavy for LCP |
| dotLottie | 0.19.16 | MIT | WASM runtime ~150 kB (secondary) | Peer includes 19 | Skip, or lazy-load one icon |
| Lenis | 1.3.26 (2026-08-05) | MIT | 5.5 kB | Peer `>=17` | Skip |
| NumberFlow | 0.6.2 (2026-07-18) | MIT | ~6.3 kB | Peer `^18 \|\| ^19` | Use |
| Recharts | 3.10.1 | MIT | ~151 kB full entry | Peer includes 19 | Use with `"auto"`, lazy-load |
| visx | `@visx/shape` 4.0.0 | MIT | Modular | Peer `^18 \|\| ^19` | Lighter alternative |
| Magic UI, Motion Primitives | n/a | MIT | Copy-paste | Built on Motion | Selective |
| React Bits | n/a | MIT + Commons Clause | Copy-paste | n/a | Allowed for use; do not redistribute |
| Aceternity UI | n/a | See below | Copy-paste | n/a | Check before use |
| 21st.dev | n/a | Per component | Copy-paste | n/a | Check each |
| Uiverse | n/a | MIT | CSS/Tailwind snippets | n/a | Fine |

## Findings by area

### 1. Core libraries

- **Motion 14.0.0** was published three days ago. The upgrade guide says it has no React breaking changes; it removes internal compat shims and pins its internal deps (secondary: search summary of motion.dev/docs/react-upgrade-guide). The `motion` package depends on `framer-motion` 14.0.0 exactly. Pin the exact version.
- **"Framer Motion is heavy" is outdated.** `m` with LazyMotion costs 4.6 kB initially, and features can load async after hydration (https://motion.dev/docs/react-reduce-bundle-size, https://motion.dev/docs/react-lazy-motion). Use `strict` on LazyMotion to catch accidental `motion.*` imports.
- **Motion scroll-linked values** run on the browser's native `ScrollTimeline` where possible. Scroll-triggered effects use a pooled `IntersectionObserver` (https://motion.dev/docs/react-scroll-animations).
- **`MotionConfig reducedMotion="user"`** disables transform and layout animation but keeps opacity and colour (https://motion.dev/docs/react-motion-config). Use opacity-only fades as the reduced-motion fallback.
- **Motion+ is paid ($399 one-time)** and includes AnimateNumber (https://motion.dev/plus). The core library stays MIT. NumberFlow is the free equivalent.
- **GSAP is free for commercial use.** Webflow's licence is dated 2025-04-30 and covers SplitText, MorphSVG and the former members-only plugins (https://gsap.com/community/standard-license/). It is not open source. It forbids use in tools that let users build visual animations without code, in competition with Webflow. A research site is unaffected.
- **View Transitions in Next 16.** The Next docs (v16.3.8, updated 2026-08-25) say view transitions "work in the App Router with no configuration" and import `ViewTransition` from `react` (https://nextjs.org/docs/app/guides/view-transitions). Several 2025-2026 blog posts say to set `viewTransition: true` or `experimental.viewTransition`. The docs do not mention that flag, so treat the blogs as stale or version-specific and test it. React still documents the component against canary builds (https://react.dev/reference/react/ViewTransition); Next's App Router bundles canary React. `Link` takes a `transitionTypes` prop for directional navigation.
- **Browser support.** Single-document View Transitions are at 91.75% global usage: Chrome 111, Safari 18, Firefox 144 (https://caniuse.com/view-transitions).
- **CSS scroll-driven animations.** They shipped in Chrome 115 and Safari 26 (Sept 2025). Firefox is still behind a flag in stable as of Firefox 152, June 2026 (secondary: https://cssawwwards.com/blog/css-scroll-driven-animations-guide-2026). Global support is about 82.6% (secondary: caniuse via https://www.buildmvpfast.com/blog/css-scroll-driven-animations-replace-js-2026). One guide claims Firefox 132 stable; that conflicts with the others and is probably wrong. MDN lists the feature as not Baseline (https://developer.mozilla.org/en-US/docs/Web/CSS/animation-timeline). It is a named Interop 2026 item (https://webkit.org/blog/17818/announcing-interop-2026/). Content must be fully visible without it.

### 2. Kits

- **Magic UI:** MIT, copy-paste through the shadcn CLI, built on Motion.
- **Motion Primitives (ibelick):** MIT, copy-paste (https://github.com/ibelick/motion-primitives).
- **React Bits:** MIT plus Commons Clause. You may use it commercially but not resell or redistribute the components (https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md).
- **Aceternity UI:** a secondary source says the free tier is MIT. The licence page I fetched (https://ui.aceternity.com/licence) covers only Pro, which bans resale of components and templates. I could not confirm the free-tier terms, so confirm per component.
- **21st.dev:** a registry where each component carries its contributor's licence (https://21st.dev/terms).
- **Uiverse:** MIT, CSS and Tailwind snippets (https://github.com/uiverse-io/galaxy/blob/main/LICENSE).
- Most of these kits are showy (aurora, spotlight, beams). That clashes with a sober research desk, so take primitives such as text reveal, number ticker and blur-fade, not effects.

### 3. Data-viz motion

- **Recharts 3:** `isAnimationActive` defaults to `"auto"`, which turns animation off for reduced motion and in SSR (https://recharts.github.io/en-US/guide/animations/). The package is large (~151 kB gzip for the full entry), so import only the chart types you use and lazy-load below the fold.
- **NumberFlow** is built on `Intl.NumberFormat` and Web Animations, is dependency-free, and supports reduced motion (https://github.com/barvian/number-flow). Set `font-variant-numeric: tabular-nums` (IBM Plex Sans supports it) so widths do not jump. Check the `trend` and `format` props against its docs.
- **Draw-on lines:** set `pathLength={1}`, `stroke-dasharray: 1`, then animate `stroke-dashoffset` from 1 to 0 with CSS or Motion. This is a standard technique, not drawn from a fetched source.
- **D3 and Plot:** use them for scales and path generators only. Let React own the DOM.

### 4. Gotchas

- **Server Components cannot animate.** Put Motion, GSAP and NumberFlow in small `"use client"` leaf components and keep pages as Server Components. Prefer CSS for entrance effects so nothing ships to the client.
- **CLS and flicker.** Never start content at `opacity: 0` in server HTML if JavaScript must flip it, because the content is invisible until hydration. Animate transform and opacity only, never height or margin. Keep reserved space (min-height, aspect-ratio) for charts and numbers. Do not animate anything in the LCP element; the hero should paint static.
- **Reduced motion.** Use `MotionConfig reducedMotion="user"`, a global CSS `@media (prefers-reduced-motion: reduce)` rule, and one for `::view-transition-*` pseudo-elements. The Next docs include the snippet. React does not disable view transitions for you.
- **View Transition pitfalls.** Updates must run inside a transition, `Suspense` or `useDeferredValue`; a plain `setState` does not trigger them. Put `<ViewTransition>` in `page.tsx`, not in layouts. Set `::view-transition { pointer-events: none }`. Names must be unique across the app.
- **GSAP in React.** Use `useGSAP` for cleanup and StrictMode. Register plugins inside client components. Wrap event-handler tweens in `contextSafe`.
- **Scroll and INP.** Avoid `scroll` event listeners; use `IntersectionObserver`, `animation-timeline` or Motion's `useScroll`. INP measures clicks and keypresses, but animation code competes for the main thread.
- **Lenis** has been criticised for running without `prefers-reduced-motion` gating (secondary: https://github.com/davidsneighbour/kollitsch.dev/issues/1998). It adds nothing for a data-reading site.
- **Hobby tier:** nothing here needs server resources; motion is all client or CSS.

### 5. Principles and inspiration

- **Emil Kowalski** (https://emilkowal.ski/ui/7-practical-animation-tips):
  - Keep UI animation under 300 ms.
  - Use ease-out for entering and exiting elements.
  - Don't animate from `scale(0)`; start at about 0.93.
  - Use `scale(0.97)` on `:active`.
  - Skip animation entirely for high-frequency interactions.
  - Use about 2 px blur to mask crossfades.
- **Rauno Freiberg:** the interfaces list (https://github.com/raunofreiberg/interfaces).
- **Reference sites:** Linear, Vercel, Stripe and Family.co for restraint. I did not retrieve specific Awwwards, Godly or Lapa finance examples, so the caller should browse those directly.

## Contradictions to conventional wisdom

1. GSAP is free, including SplitText and ScrollTrigger, but it is not open source.
2. Motion's core cost is 4.6 kB with LazyMotion, not 30 kB or more.
3. The Next 16 docs show view transitions needing no config flag, though blogs say otherwise.
4. Firefox still lacks stable scroll-driven animations as of mid-2026 (secondary).
5. Motion's number-animation component is paid; the free equivalent is NumberFlow.
