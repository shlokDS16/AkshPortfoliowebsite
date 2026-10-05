# Segment 5: identity

Comparison: `docs/design/comparisons/05-identity.html`. Each direction is applied to the register home with What changed, the B+ Kaveri file with an exhibit, a 1200 × 630 share card and a 32 px favicon, at 960 and 375 px, light and dark. There is also a three-phones view, a token sheet per direction, and contrast ratios computed from the tokens. All three use the same components, so only identity differs.

**Studied:** 30 identities, read with agent-browser (fonts, colours, radii, favicon and share-card tags). The full list is in the HTML. Seven bot checks were not bypassed: FT, Economist, Bloomberg, Zerodha and Varsity, Ambit and Scuttleblurb. Three findings:
- Marcellus is set entirely in Plex Sans.
- Violet is the Indian fintech default.
- Tegus uses a deep teal, the same family as B's accent.

**Shared rule:** the accent is for the hand and ink is for the data. The accent marks links, focus, the active tab and the mark. It never colours figures, statuses or chart series. Charts use ink for the subject, grey for the benchmark, and one separate hue for thresholds. Every text pair passes WCAG AA in both themes. Links stay underlined, because the accent is close to ink in luminance (2.0 to 3.0:1).

## A. Masthead (name-led, editorial)
*"Aksh Agrawal · Research desk": paper, ink, a blue-black accent (#23439A), ochre thresholds, 0 px radii, a double rule under the masthead.*
- **References:** Stratechery, Sequoia, Berkshire, Oaktree memos, Nomad.
- **Rejects:** FT salmon, a logo box, a serif body.
- **Imagery:** none, except one dated portrait on About.
- **Voice:** first person.
- **For an AMC head:** a person's dated record, in the letters-to-partners tradition, which is exactly what Aksh legally is.
- **Risks:** it can look unfinished, and the name carries no equity yet.

## B. Assay (desk brand, instrument-grade)
*"Assay, by Aksh Agrawal": cool slate, a cold teal (#006A7E), amber thresholds, 6 px radii, a crucible monogram (an A filled to a measured line).*
- **References:** Tegus, Koyfin, Linear, Vercel, Observable.
- **Rejects:** violet, gradients, KPI tiles.
- **Imagery:** none.
- **Voice:** terse ("0 entries").
- **For an AMC head:** it looks like their daily tools.
- **Risks:** a brand can look like a firm offering research while Aksh is unregistered. It is also the coldest of the three.
- **Candidate names** (check the IP India register in classes 36 and 41, MCA names and the .in and .com domains):
  1. **Assay**: a test of what something is made of.
  2. **Plumbline**: shows whether a wall is true.
  3. **Nikasha**: Sanskrit for touchstone.

  Rejected as lookalikes: Parakh (NCERT), Touchstone, VeriDesk (Varidesk), Testbook.

## C. Case files (rooted in Indian markets)
*"Aksh Agrawal · Case files": khadi paper, a geru red-ochre accent (#A13A22), neel indigo thresholds, 3 px radii, a notched AA tag.*
- **The mark is the numbering:** File 03, Ex. 03.1, T1. File numbers are never reused.
- **References:** Marcellus, Zerodha Tech, Our World in Data, broker initiation notes.
- **Rejects:** saffron, green, the tricolour, rupee-sign logos, maps, ornament.
- **Imagery:** cited crops of primary documents only.
- **Voice:** third person ("Aksh holds no position"), which separates the chrome from his first-person VIEW.
- **For an AMC head:** it reads like the sell-side exhibits they already cite in meetings.
- **Risks:** geru sits near loss red, which is safe only because figures are never coloured. Warm paper can read as lifestyle.

## Fonts
Each direction was tested against two alternatives, with Plex Mono kept for IDs:
- A: Public Sans, and Plex with Source Serif 4 titles.
- B: Inter and Geist.
- C: Anek Latin and Mukta.

**Keep IBM Plex Sans and Plex Mono:**
- None of the six alternatives beat Plex on tabular figures.
- Inter and Geist read as SaaS.
- Public Sans reads as government.
- Mukta's figures are uneven at small sizes.
- Plex has a Devanagari companion, and segments 1 to 3 are already set in it.

## Favicon and share card
- **Favicon:** an SVG with outlined paths, a `prefers-color-scheme` rule and a 32 px PNG fallback. C needs its own 16 px drawing.
- **Share card:** one fixed card per direction, linted under publishing rule 8.

## Recommendation
**C, with A's restraint.** Publish under Aksh's own name, which answers Q5; check akshagrawal.in first. Use the numbering as the mark, geru only for interaction and identifiers, and no ornament in the chrome. Keep B's names for the day Aksh registers as a Research Analyst.
