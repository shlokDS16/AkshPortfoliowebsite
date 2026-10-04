# Tooling landscape for a free-tier equity-research desk (verified 2026-10-04)

Source: deep-research subagent, all figures checked against vendor docs on 2026-10-04 unless marked "could not verify". Re-verify before relying on any limit; vendors change free tiers often.

## 1. Document -> structured data

- Claude native PDF: 32 MB/request; 600 pages/request (100 when context <1M tokens); Files API lets you reference a `file_id`. Visual mode ~2,300 tokens/page, text-only ~330/page. Structured outputs GA via `output_config.format` (json_schema). NOT free; ~$0.70 input for a 300-page annual report on Haiku 4.5 visual mode. https://platform.claude.com/docs/en/build-with-claude/pdf-support
- Paid parsers: Reducto ($10/1k pages, $150 free credit; best on financial tables per vendor benchmark), LlamaParse ($1.25/1k credits, 1-45 credits/page), Mistral OCR 4 ($4/1k pages, $2 batch, bounding boxes + confidence), Unstructured (10k free pages then $0.015/page), Docling (MIT, self-hosted, too heavy for Vercel).
- Free path: see section 8.

## 2. Spreadsheet model ingestion

- SheetJS reads formula text (`cell.f`) + cached value (`cell.v`); does NOT recalculate. openpyxl same.
- HyperFormula 3.4.0 (Sept 2026): ~400 Excel functions, incremental recalculation, browser + Node. Licence GPLv3 or paid; GPL fine for a personal/open-source site, taints closed-source commercial. formulajs has no dependency graph (unsuitable for a DCF). Python `formulas` 1.3.4 compiles a workbook to a graph.
- Pipeline: upload .xlsx -> SheetJS server-side (`cellFormula:true`) -> dump `{addr, f, v, t}` -> load in HyperFormula -> diff HF values vs Excel cached values to flag unsupported functions -> Groq LLM labels "assumption" cells (hard-coded inputs with many dependents) and maps to canonical schema (WACC, g, FCF rows) -> store map in Supabase -> recompute in browser when a reader drags an assumption.

## 3. Video / audio

- Groq whisper-large-v3-turbo: FREE tier 20 RPM, 2,000 RPD, 2 h audio/hour, 8 h/day, 25 MB file limit. Paid $0.04/h.
- Alternatives: OpenAI gpt-4o-mini-transcribe $0.003/min; Deepgram Nova-3 $0.0043/min ($200 credit); AssemblyAI $0.15/h ($50 credit; chapters/summarisation deprecated).
- Chapters/summary: Groq Whisper (timestamps) -> Groq chat model -> chapters + summary JSON.
- Hosting: YouTube unlisted free (Google tracks viewers; links uncontrolled). Cloudflare Stream $5/1k min stored + $1/1k delivered, no free tier. Mux $20/month credit. Vercel Blob Hobby 1 GB / 10 GB transfer, hard cut-off. Pick: YouTube unlisted for video, voice notes as small MP3 in Supabase Storage.

## 4. Indian market data

- NSE bhavcopy: official "CM-UDiFF Common Bhavcopy Final" zip; community URL pattern `https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_YYYYMMDD_F.csv.zip` (verify at https://www.nseindia.com/all-reports). NSE terms forbid redistributing raw data; personal tracking of own calls is low-risk, republishing price tables is not. BSE bhavcopy: https://www.bseindia.com/markets/MarketInfo/BhavCopy.aspx
- yfinance: unofficial, breaks often, personal use only. Alpha Vantage free = 25 req/day (too small). Zerodha Kite Connect Rs 500/month for historical. Upstox v3 historical candle API: daily candles from 2000, Bearer token, widely reported free for account holders (could not verify on official pricing page). https://upstox.com/developer/api-documentation/v3/get-historical-candle-data/
- screener.in terms forbid copying, public display, mirroring; no public API; CSV export premium-only. DO NOT scrape for the public site. Tijori API: nothing public verified.
- Free fundamentals: EODHD (NSE/BSE, 20 req/day free). No clean free fundamentals API; use own parsed annual reports + BSE/NSE filings.
- Recommendation: daily Vercel cron (Hobby = once/day) -> Upstox daily candle for tracked symbols + Nifty 50 -> Supabase; bhavcopy zip for backfill.

## 5. SEBI compliance (factual, not legal advice)

- RA Regulations 2014 (Third Amendment 16 Dec 2024): anyone issuing a "research report" (analysis/recommendation/opinion on securities forming a basis for an investment decision) must register. Excluded: general market trends, broad-based index discussion, economic/political commentary. Graduate + NISM Series XV suffices; "part-time RA" category (max 75 clients). FAQ circular SEBI/HO/MIRSD/MIRSD-PoD/P/CIR/2025/105 (23 Jul 2025): https://www.sebi.gov.in/sebi_data/faqfiles/jul-2025/1753269723942.pdf
- Finfluencer: circular SEBI/HO/MIRSD/MIRSD-PoD-1/P/CIR/2025/11 (29 Jan 2025): "engaged solely in investor education" is outside the association ban, provided no advice/recommendation and no performance claims. Circular HO/47/17/12(11)2025-MRD-POD3/I/11107/2026 (8 May 2026, effective 1 Jul 2026): uniform 30-day lag on price data in educational content; may not name a security from the preceding 30 days in a way indicating future price direction. Enforcement: Avadhut Sathe order 4 Dec 2025 (Rs 546 cr impounded) for "education" that was stock-specific advice.
- Practical reading for an unregistered student: publish process, frameworks, historical case studies with >=30-day-old prices; avoid buy/sell/target language, "my calls returned X%" performance claims, live portfolios presented as recommendations. Public track record is the riskiest feature: frame as learning journal, delay prices 30 days.
- Disclaimer elements: not SEBI-registered; educational, not investment advice; no recommendation/solicitation; author may hold positions (disclose); market risk; consult a SEBI-registered adviser.
- TODO: download official sebi.gov.in PDFs for Jan 2025 and May 2026 circulars into docs/compliance/.

## 6. Stack sanity (free tier)

- Next.js 16.3.8 (30 Sep 2026) Active LTS; 15.x EOL 21 Oct 2026. Vercel Fluid compute default since Apr 2025. Hobby: 300 s max function duration, 4 active-CPU hours, 1M invocations, 100 GB transfer, 100 deployments/day, cron once/day (+/-59 min), 1 h log retention, 250 MB bundle, strictly NON-COMMERCIAL.
- Supabase Free: 500 MB DB, 1 GB storage, 50k MAU, 5 GB egress, 2 active projects, PAUSED after 1 week inactivity (daily cron prevents). pgvector available. Pro $25/month.
- Newsletters: Resend free = 3,000 emails/month, 100/day, 1,000 marketing contacts with Broadcasts. Buttondown free to 100 subs. Beehiiv free to 2,500 subs but Send API enterprise-only. Brevo free 300/day (could not verify officially). Pick: Resend Broadcasts.
- Alternative if non-commercial clause bites: Cloudflare Pages + Workers (100k req/day free).

## 7. Groq free tier (Oct 2026)

- Chat: openai/gpt-oss-120b, gpt-oss-20b, qwen/qwen3.8-27b each 30 RPM, 1,000 RPD, 8k TPM, 200k TPD. Whisper-large-v3-turbo 20 RPM, 2,000 RPD, 2 h audio/hour, 8 h/day. https://console.groq.com/docs/rate-limits
- Vision: Llama 4 Scout/Maverick DEPRECATED on Groq. Vision model = qwen/qwen3.8-27b: 131k context, up to 3 images/request, 20 MB/request, each image = 2,048 tokens, JSON mode. https://console.groq.com/docs/vision
- Structured outputs: strict json_schema on gpt-oss-120b, gpt-oss-20b, qwen3.8-27b; JSON-object mode on all. Context 131,072; gpt-oss-120b max completion 65,536.
- Practical ceiling: 8k TPM = one dense page per request, a few pages/minute; 200k TPD = 70-100 pages/day. Batch overnight; cache results in Supabase.

## 8. Free OCR / parsing pipeline

- Digital PDFs: `unpdf` (pdf.js serverless build, zero native deps) in a Vercel function. `pdf-parse` FAILS on Vercel (canvas dependency). Covers most annual reports, concall transcripts, broker notes.
- Scanned/screenshot fallback (free): Azure Document Intelligence F0 = 500 pages/month incl. Layout (tables). Google Cloud Vision DOCUMENT_TEXT_DETECTION 1,000 pages/month. OCR.space 25k req/month, 1 MB files, 3 pages/PDF. Mistral free "Experiment" plan unverified for OCR. tesseract.js poor on financial tables.
- Recommended free pipeline: (1) `unpdf` text + per-page char count; (2) pages <50 chars -> page image -> Azure DI Layout (500/month) or Google Vision overflow; (3) chunk 1-2 pages per call to Groq gpt-oss-120b strict json_schema (P&L, BS, CF, KPIs, management commentary); (4) chart/table screenshots -> qwen3.8-27b vision -> JSON; (5) store page text + JSON + embeddings (pgvector; free embedding via Supabase Edge gte-small); (6) human review UI flags cells where OCR confidence or LLM self-check disagree.

## Open questions

- Official SEBI PDFs for Jan 2025 and May 2026 circulars to be downloaded and kept in docs/compliance/.
- Upstox API fee status and Mistral free-tier OCR inclusion unverified.
- Vercel Hobby non-commercial clause: any paid newsletter tier or sponsorship would breach it.
