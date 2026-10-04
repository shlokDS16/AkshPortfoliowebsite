# Reference implementations: research-first investor sites (2026-10-04)

Method: live fetches plus web search. UNVERIFIED = could not be fetched; rests on search snippets.

## Reference sites

1. **Triyambak-CA equity-deep-dives** - https://github.com/Triyambak-CA/equity-deep-dives
   Indian listed-company deep dives. One self-contained HTML file per report, named `company-YYYY-MM-DD`, with a `reports.json` manifest and an auto-generated index. Private notes repo kept separate from the published one. Stated stance: "No ratings, no price targets", not SEBI-registered. Corrections appear as new dated reports, which leaves an audit trail. Closest structural match to "living thesis with dated versions".

2. **Sajal Kapoor, Antifragile Thinking** - https://antifragilethinking.substack.com/p/axiscades-what-would-prove-the-thesis
   Indian small-cap thesis posts. The title question is "What would prove the thesis wrong?" Posts promise falsification criteria, timestamped updates, disclosures and a method for tracking prediction accuracy (full text paywalled; UNVERIFIED beyond the intro). His About page says he writes beliefs down before the evidence arrives, in the open so mistakes cannot be forgotten. States he is not a SEBI registered analyst.

3. **Bessemer Anti-Portfolio** - https://www.bvp.com/anti-portfolio
   Logo plus 1-2 sentence reason for each famous pass (Apple, Google, Tesla), framed "the only thing worse than missing a great company is pretending it didn't happen". Credibility comes from a named mistake with the real reasoning quoted, placed beside the success record. Strongest model for a Mistakes page.

4. **The SEA Analyst** - https://www.theseaanalyst.com/about
   A consistent pseudonymous identity as the "public record you can hold to account". Primary filings only, multi-scenario valuation instead of a single price target, positions disclosed in every piece, no ads, committed to corrections. Gap: it shows no track record at all.

5. **Marcellus Investment Managers** - https://www.marcellus.in
   Newsletters per fund, blog, "Three Longs and Three Shorts" reading list, podcasts in English and Hindi, four books, philosophy pages. Regulatory and marketing disclosures and a fraud warning are linked prominently. Performance is mostly kept out of the public homepage (client portal and newsletters). AMC-grade compliance footer. Also hosts the Nomad collection: https://marcellus-us.com/story/the-full-collection-of-the-nomad-investment-partnership-letters-to-partners/

6. **Nomad Investment Partnership letters** - https://igyfoundation.org.uk/wp-content/uploads/2021/03/Full_Collection_Nomad_Letters_.pdf
   No dedicated site exists. The letters live as one PDF, 2001-2014, written every six months, now a Stripe Press book. Credibility comes from consistency over 14 years and candid reasoning, not UI. Lesson: a complete, chronological, unedited archive beats polish.

7. **Stratechery** - https://stratechery.com/about/
   Free weekly articles, paid daily updates, interviews, podcasts. The ethics statement is explicit: no company pays him for opinions, no individual stocks in companies he covers, no speaking for companies he analyzes. Models a conflicts statement as a trust signal.

8. **Tegus / AlphaSense** - https://www.tegus.com
   300k+ expert transcripts, 4,000+ Canalyst models, answers "fully cited and sourced" with AI comparison grids across sources. The pattern to borrow is a claim-to-source link on every figure, and a side-by-side view of assumptions. This is what an AMC analyst uses daily, so the site should feel closer to this than to a blog.

9. **Yet Another Value Blog** - https://www.yetanothervalueblog.com
   27k+ subscribers; credibility rests on third-party endorsements. No visible track record or mistakes on the landing page. A student cannot rely on audience as proof.

10. **Rohit Chauhan, RC Capital** - https://rccapitalmanagement.substack.com/
    Search snippets say a public dashboard of actual investments, a free Substack, and SEBI RIA number INA000004088. I could not verify the dashboard (Substack shell only). UNVERIFIED. Treat as a lead to inspect manually.

11. **Eugene Ng, Vision Investing Viewpoints** - https://visioninvesting.substack.com/ - fetch returned no content on sections or performance. UNVERIFIED.

Not reached: Scuttleblurb (403), Nomad site (SSL), Akre (404), Bronte (thin), Ambit, Dalton & Co. Sequoia memos: https://www.alexanderjarvis.com/resources/collections/vc-investment-memo-collection/

## What these sites do NOT do (what an AMC head wants)
1. No scored prediction ledger: nobody publishes thesis, date, price at call and outcome in one sortable table, including losers.
2. No assumption-level provenance: valuations are PDFs or prose, with no live model, no sensitivity grid, and no per-input source.
3. No version diff: updates are new posts, so nobody can see what changed in the thesis and why. Item 1 comes closest.
4. No return attribution against a benchmark with dates (Nifty 500 TRI), and no distinction between paper and real money.
5. No process evidence (screening funnel, time spent, checklists, pre-mortems) and no explicit position-sizing or risk logic.

## Contradicts conventional "portfolio website" wisdom
- A "portfolio" site is usually projects and skills. Here the trust assets are dated documents, mistakes and compliance language, not visual polish. Item 6 (a bare PDF) is among the most respected pieces of investment writing.
- Hiding failures is the norm; Bessemer and Sajal Kapoor show publishing them raises credibility.
- Interactivity is rare in the best sites. Interactive valuation is a differentiator only if inputs are sourced and defaults are defensible.
- Regulatory risk: recommendations from an unregistered person in India may fall under SEBI Research Analyst rules. Both Indian examples (1, 2) avoid ratings and price targets and carry a "not SEBI registered" line. Confirm with a lawyer before shipping buy/sell language.
- Social proof (item 9) matters less than a verifiable record for an institutional audience.
