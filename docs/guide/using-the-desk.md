# Using the Aksh Research Desk

A guide for Aksh (daily use) and for Shlok (the short section near the end on running the site).

Written 14 October 2026, from the code and the design documents as they stand on that day. Section 4.9 (case studies) and section 4.10 (concepts, reads and your month) were added on 15 October 2026, section 4.11 (PDFs, links and the feed) and section 4.12 (videos) and section 4.13 (letters) on 16 October 2026. Where a label or message is quoted, it is the text in the code. Anything that could not be confirmed is listed at the very end, under "To verify before sharing".

## Contents

1. [What this site is](#1-what-this-site-is)
2. [Signing in](#2-signing-in)
3. [A normal day in five minutes](#3-a-normal-day-in-five-minutes)
4. [The areas of the desk](#4-the-areas-of-the-desk)
   - [4.1 Moving around](#41-moving-around)
   - [4.2 Capture](#42-capture)
   - [4.3 New names](#43-new-names)
   - [4.4 Company files and publishing](#44-company-files-and-publishing)
   - [4.5 The document inbox](#45-the-document-inbox)
   - [4.6 The Ledger](#46-the-ledger)
   - [4.7 What a visitor sees on the public side](#47-what-a-visitor-sees-on-the-public-side)
   - [4.8 Your model on the desk](#48-your-model-on-the-desk)
   - [4.9 Case studies](#49-case-studies)
   - [4.10 Concepts, reads and your month](#410-concepts-reads-and-your-month)
   - [4.11 Sharing your work: PDFs, links and the feed](#411-sharing-your-work-pdfs-links-and-the-feed)
   - [4.12 Videos](#412-videos)
   - [4.13 Letters](#413-letters)
5. [The publishing rules in plain words](#5-the-publishing-rules-in-plain-words)
6. [When something looks wrong](#6-when-something-looks-wrong)
7. [For Shlok: running the site](#7-for-shlok-running-the-site)
8. [Not in this version](#8-not-in-this-version)
9. [To verify before sharing](#9-to-verify-before-sharing)

---

## 1. What this site is

- It is your personal equity-research system. You note thoughts, keep a research file on each company, read company documents with help, and record your ideas and how they turned out.
- It has two sides. The **desk** is private, behind sign-in. Only you can open it.
- The **public side** is a showcase of your research. Anyone can read it, including people who work at asset-management firms.
- Nothing moves from the desk to the public side by itself. A file goes public only if you press the publish button and it passes the checks in section 5.
- The site helps with organising and reading. It does not think for you. Machine-read figures and your own words are always kept apart.

**What is private and what is public**

| Private (desk only) | Public (after the checks, and after a 30-day wait) |
|---|---|
| Your captures (the quick notes) | Company files you chose to publish |
| The document inbox and its page text | The "Printed on p. N ..." line under a filed figure |
| The Ledger: ideas, scores, closing prices, lessons | Learning notes and process notes you chose to publish |
| Drafts and unpublished files | The About and disclosures page |

Nothing from the Ledger is shown on the public side in this version.

---

## 2. Signing in

There is no password. You sign in with a link sent to your email.

1. Go to the site's address and open the sign-in page (it is at `/login`; opening `/desk` while signed out sends you there).
2. Type your email in the **Email** box.
3. Press **Send sign-in link**. The button says "Sending..." while it works.
4. The page answers: "If this address is allowed, a sign-in link is on its way. Check your inbox." It gives this same answer for every address. It does this on purpose, so nobody can use the page to find out which address is yours.
5. Open the email and press the link. You land on the desk.

**Important:** the sign-in page says "The sign-in link only works in the browser that requested it. Open it on this device, in this browser." If you ask for the link on your laptop and open the email on your phone, it will not work. Ask for a new link and open it where you asked.

**If the link does not arrive**

- Check the spam folder.
- Check that you typed the address the site knows. Any other address gets the same "on its way" message but no email.
- Ask for a new link. Wait a minute or two first.
- If it still does not arrive, tell Shlok. He can read the server's log (section 7).

**If the link opens but you see a red message on the sign-in page**

- "That sign-in link did not work. Request a new one." The link may be used up, may have expired, or was opened in a different browser. Ask for a new one.
- "That account is not allowed into the desk." The email you signed in with is not the desk's admin account.

**Signing out:** press **Sign out** in the bar at the top of the desk.

---

## 3. A normal day in five minutes

This is the shortest useful routine. Each step is explained in section 4.

1. **Open the desk.** Look at the top. If a red strip is showing, read it (section 6). If there is no red strip, nothing is late.
2. **Capture what you noticed.** On the Capture tab, type one line and press Enter. Add `$SYMBOL` for a company and `#concept` for each concept (up to 8). Do this whenever a thought comes, not only once a day.
3. **Clear "Needs you".** On the Capture tab, the "Needs you" box lists what is waiting: a document ready to review, a name to screen, a publish that was stopped, a capture that was not filed. Open each card and deal with it.
4. **Check the Inbox.** If a document says "Ready", press **Review**, check the figures it flags, and file the rest.
5. **Open the Ledger tab.** Look at the lines at the top. Check the "Needs you" box there: ideas that need a price check, closed ideas with no lesson, ideas past their horizon. If your thinking on an open idea changed, add a note to it.
6. **If you closed an idea, write the lesson** while it is fresh.

On a day with nothing new, steps 1 and 2 are enough.

---

## 4. The areas of the desk

### 4.1 Moving around

The desk has five tabs: **Capture**, **Inbox**, **Items**, **Ledger**, **Names**. On a computer they run along the top. On a phone they run along the bottom. **Inbox** and **Names** show a number while something is waiting for you.

There is also a **Capture** button on every desk screen. On a phone it sits in the thumb corner. On a computer it is in the top bar. On a computer you can also press `c` or `/` on any desk screen (when you are not typing in a box) to open it.

At the very top, a **red strip** appears only when something is late or broken. A grey line (not red) can appear for things worth a look that are not failures. Section 6 explains each.

### 4.2 Capture

**What it is for.** Getting a thought down in seconds, before you lose it. Every capture is saved exactly as you typed it, before the site tries to understand it, so nothing is lost if the understanding step fails.

**Where.** The Capture tab opens with the box already selected. The box shows: "What did you just notice?   $company  #concept  t:  l:  p:  r:".

**How to capture**

1. Type your thought.
2. Press **Enter** to save. The box clears at once. Press **Shift+Enter** to start a new line without saving.
3. Under the box, a line "Will go to ..." tells you where the capture will be filed before you save it. With nothing special typed it says "Will go to: Today, as a private note".

**The small grammar.** All of it is optional.

| You type | What happens |
|---|---|
| `$RELIANCE` (a dollar sign and a company's NSE symbol) | Links the capture to that company. Capital or small letters both work. An unknown symbol shows as `$SYMBOL → New names` and the company waits on the Names tab for you to screen it. |
| `#capital-cycle` | Links the capture to a concept. Every `#name` links, in the order you write them, up to 8 (the receipt says "Only the first 8 concepts were linked." past that). A run of `#names` at the end of the first line is left out of the title; a `#name` inside the sentence stays. An unknown concept shows as `#concept → New names`. |
| `t:` at the very start | A thesis (your view on a company). With a `$SYMBOL` it starts that company's file, or adds a new revision to it if one exists. The receipt says "Thesis". |
| `l:` at the very start | A learning note. The receipt says "Learning note, private". |
| `p:` at the very start | A process note (how you work). The receipt says "Process note, private". |
| `r:` at the very start | Something you read, for the reading log. The receipt says "Reading log, private". A read always stays private. |
| `v:` at the very start, then a YouTube link | A video (section 4.12). The receipt says "Video, private". Nothing is read from YouTube until Shlok has set a key. |
| A web address (https://...) anywhere | Kept with the capture. The desk does not open it by itself. See "Read this link" below. |
| None of the above | A private note, listed under Today. |

A few details:

- A thesis belongs to one company. If you start with `t:` and give no `$SYMBOL`, the box warns "A thesis belongs to one company. Add $SYMBOL, or this saves as a private draft without one."
- `$` followed only by an amount (such as `$5M` or `$500cr`) is read as money, not a company.
- On a phone, a row of keys above the keyboard types `$`, `#`, `t:`, `l:`, `p:`, `r:` and `v:` for you.
- A capture can be up to 20,000 characters.

**After you save**

- Under the box: "Saved." when it reached the server.
- If you are offline or the server is unreachable: "Saved on this device, will sync (N waiting)." A card on the page says "On this phone ... N notes not synced yet. They are saved on this phone and will sync when you are back online. Nothing is lost." They go up by themselves when you are back online.
- The **Today** box lists today's captures, grouped by company.
- A strip below shows your capture streak over the last 30 days.

**Read this link.** If a capture holds a web address, its line in the Today list has a **Read this link** button. Press it and the desk opens the page, reduces it to text, and adds it to the Inbox (section 4.5). The desk never does this without your press.

**Messages you may see**

| Message | What it means and what to do |
|---|---|
| "Nothing to save. Write something first." | The box was empty. |
| "That is too long to capture (20,000 characters max)." | Shorten it, or split it into two captures. |
| "This capture is malformed and was not saved." | Rare. Retype it. |
| "Saved on this device; it will sync when the desk is reachable." | Nothing to do. It will go up by itself. |
| "Needs attention (still on this device)" with **Copy** and **Dismiss** | The server refused a capture for good, or the phone could not read a stored one. Your text is shown. Press **Copy** to keep it, then **Dismiss**. |
| A "Not filed" card in "Needs you": "Saved, but not filed as an item yet." | The text is safe but did not become an item. Press **File it now**. |
| "Saved, but the thesis is at its length limit (200,000 characters), so this was not added. Start a new item or shorten the thesis." | That company's thesis is full. |

### 4.3 New names

**What it is for.** The first time you write a `$SYMBOL` or `#concept` the site has not seen, it keeps your note and puts the name on a list. You say who it is, like a screener. This stops typos from becoming companies.

**Where.** The **Names** tab, headed "New names". The "Needs you" box on the Capture tab also shows a "New names" card with the button **Screen new names**.

**How.** Each name has a card showing the name, when it was first seen and the line you wrote it in. Choose one:

- **Same as ...** (shown when the site spotted a likely match). Joins this name to the existing one. After this, the old spelling files under the target.
- **New company** (or **New concept**). A form opens. Fill in **Name** (and **Sector**, picked from a list, for a company). Press **Yes, add it**.
- **Not a company, keep as text** (or **Not a concept, keep as text**). The word stays in your note as plain text.

Your notes were saved either way.

Messages: "Give the name." (the Name box was empty), "Choose a sector from the list.", "Screen this name on the New names tab first." (you tried to use an unscreened name), "A public item names this. Unpublish that item before changing what this name is."

### 4.4 Company files and publishing

**What it is for.** A company file is your research on one company: your view, the tests that would change your mind, the facts with their sources, and every revision since. This is what can be published.

**Where.** The **Items** tab lists your items, newest first, each marked private or public. Press a title to open it.

**Starting a file.** The simplest way is a capture such as `$KAVERI t: I expect margins to hold because ...`. That creates the company's file, or adds a revision if it exists. A second way is from the document review screen (section 4.5), where **Start a file for ...** creates a private, empty file. The Items tab also has a **Create item** form with a **Kind** (note, thesis, learning, case study, process) and a **Title**. That form has no company box, so I could not confirm that it is the way to start a company file; use a capture or the review screen for that.

**The file page** has these parts, from the top:

1. The title, the kind, "Private" or "Public", and the current revision number.
2. **Open a document** (company files only). It opens a document you have filed for that company beside the editor, so you can read the page while you write. Section 4.5 has more.
3. The **publish checklist** (on the right on a computer; on a phone it sits with the page).
4. **Details**: **Title**, **Learning objective** (one sentence on what the reader learns), **Holds position** (Not set, Yes, No, Not disclosed) and **Figures to** (a date). Press **Save details**.
5. **New revision**: **Body (Markdown)**, the facts editor (company files only), and **Change reason**. Press **Save revision**.
6. A collapsible **Wording guide**.
7. The history of revisions, with a comparison between any two.

**Writing the body.** Your words. For a company file: write the view, then a heading `## What would prove me wrong` with one line per test, written `- T1: ...`, `- T2: ...`. Cite a fact in your text as `[F1]`, `[F2]`. The Wording guide reminds you to write "what I expected and why" rather than "what you should do", to write the market priced X and you thought Y because Z (instead of "undervalued"), to prefer ranges and scenarios over point targets, and that mistakes are the most credible content on the site.

**The facts editor** (inside **New revision** for a company file) has two modes: **Form** and **Text sheet**. Use the form. Its sections:

- **Company line**: **One line about the company**.
- **Sources**: **Add source**. Each has **Document**, **Type**, **Filed on** and **Link (optional)**.
- **Facts**: **Add fact**. Each has **Metric**, **Value**, **Unit**, **Period**, **As of** (date), **Source**, **Page or locator**, **Prior period**, **Prior value**, **Quoted line (optional)** and **Topic (optional)**.
- **Test readings**: one reading per `- T1: ...` line in your body. Fields include **Reading (blank if none)**, **Unit**, **Reading date**, **Last checked**, **Status** (Met, Watching, Not met, No data), **Above or below**, **Threshold**, **Prior reading**, **Scale min**, **Scale max** and **Metric to watch**. The condition is your words from the body; edit it there.
- **Exhibits**: **Add exhibit** (a titled chart with a source).
- **Scenario** (optional): **Add a scenario**. The form says "Operating outputs only: no value, price or target rows."
- **Read first**: **Add note** (points a reader to one of your notes).

The **Save revision** button is disabled while the facts form has a problem. If your text cites a fact that no longer exists, the site warns: "The body cites [F2], which is no longer in the facts. Those citations will break. Add the fact back or change the body." For a new break, press **Save revision** again to save anyway.

Revisions are **append-only**: saving never overwrites. "Revisions are append-only: an existing revision cannot be changed or deleted. Save a new revision instead."

**Publishing a file**

1. Make sure **Details** are filled in: a **Learning objective**, **Holds position**, and **Figures to** (see below).
2. Read the **Publish checklist**. It is a preview ("Preview passes. The gate decides and records the result." or "Preview: 1 rule fails ..."). The gate, not the preview, decides, and the button is never greyed out by the preview.
3. If the file names a company, the company itself must be public. If the checklist shows "Company is public" failing, press **Make <company> public**.
4. If the file names a company, a tick box appears: "I have not changed my stance on <company> in my private notes in the last 30 days." Tick it only if that is true. If the Ledger already blocks the publish (section 5), this box is not offered.
5. Press **Run the publishing gate on revision #N**. The button says "Running the gate..." while it works.
6. The result:
   - "Published." or "Passed the gate. The file shows on the public site once its Figures to date is 30 days old (30-day lag); the date is beside Unpublish."
   - Or "Blocked by the gate", with the rule number and the exact sentence that failed, highlighted in the preview of your body. Edit the sentence (**Edit sentence**), save a new revision, and run the gate again.

**Figures to** is the date your newest figure runs to. The 30-day wait is counted from it. Every dated figure in the file (facts, test readings, exhibit points) must be on or before it. If you have newer figures, the hint offers **Set Figures to <date>**.

**Allowing one sentence (rule 1 only).** If rule 1 flags a sentence that explains your process rather than a view on a stock, the note beside it offers **Allow this sentence**. Type a reason in "Reason, saved with the gate decision (required)" and press the button. The allowance covers that exact sentence only. If you edit the sentence, the check runs again. Only rule 1 has allowances.

**After publishing.** The history shows the current revision. A new revision of a public file is stored at once but stays hidden until it passes the gate again. The file shows "N revision is waiting for the publishing gate. The public page still shows revision #X." While a file is public its **Details** are locked; to change them, press **Unpublish**.

**Unpublish** makes the file private again at once. Search engines and social previews keep their own copies, and the site cannot clear those.

**Messages you may see**

| Message | What it means and what to do |
|---|---|
| "Title is required" | Type a title. |
| "Choose a kind" | Pick a kind in the Create item form. |
| "Use a valid date (YYYY-MM-DD)" | Fix the date. |
| "Choose yes, no or not disclosed" | Set **Holds position**. |
| "Nothing to append" | The revision had no changes. |
| "Give a reason of at least 3 characters." | Type a reason (for an allowance). |
| "This item is public. Unpublish it before changing its details." | Details are locked while public. |
| "This revision is too long (200,000 characters max). Start a new item or shorten it." | Shorten it. |
| "Tick the rule 4 check before running the gate on a file that names a company." | Tick the box, if it is true. |
| "The file's view, tests and facts do not line up yet. The checklist names what is missing." | Read the "File structure" row in the checklist. |
| "The facts sheet has a problem; the line is marked in the editor." | Fix the marked line. |
| "This file has no dated figure yet, so there is nothing to set Figures to." | Add a fact with an **As of** date first. |
| "Revision saved. This item is public, so the new revision is waiting for the publishing gate; the public page still shows the previous one." | Run the gate on the new revision. |
| "You are not allowed to do that. Sign in again as the admin." | Sign in again. |
| "Could not save. Try again." | Try again. If it repeats, tell Shlok. |

**Limits**

- A file about a company cannot be published until the company is public and passes the rules in section 5.
- Interactive valuation models are never public (section 5).
- The checklist cannot read the titles and summaries of exhibits for figures. Its reminder: "Do not quote a figure younger than 30 days there."

### 4.5 The document inbox

**What it is for.** You drop in a company document. The site reads its pages, proposes figures, and shows you the exact quote and page each one came from. You accept, edit or reject each figure before it goes into a file. The site proposes; you decide.

**What you can drop**

- A PDF (annual report, presentation, filing), up to 50 MB.
- A photo or screenshot of a table. The browser shrinks it first. If it is still over 1 MB, the site asks you to crop it to the table.
- A web address.
- Pasted text.

(Voice notes exist in the code but are switched off. Ignore them.)

**Where.** The **Inbox** tab. At the top: an "AI reading is off ..." line if the AI is off (see below), then the drop area, then three meters, then the document cards in trays.

**How to add something**

1. Press **Choose a file**, or drag a file onto the dashed box. The line under it shows "Checking the file...", "Uploading...", "Saving...", then "Uploaded <name>. The desk starts reading it now."
2. To add a link or text, use the box labelled **Or paste a link or some text**, then press **Read it**. A link is opened only when you press **Read it**. Pasted text must be at least 50 characters.
3. Optionally open **Company, filing date and link (optional)** and fill in **Company, as $SYMBOL**, **Filed on** and **Public link**. The company must already exist ("No company has that symbol yet. Capture it first as $SYMBOL on the Capture tab, or leave this blank.").
4. Leave the Inbox tab open while it reads. The tab keeps asking the server to carry on while it is visible. If you close it, a background job picks the work up within about 15 minutes ("Queued. Starts within 15 minutes, sooner while this page is open.").

**The meters.** "AI pages today:" (the free daily allowance for reading), "Storage" and "Database" (the free plan's room). If storage passes 90% you see "Storage is over 90% full. Mark finished documents as done to free space."

**The trays.** Each document is a card in one tray:

| Tray | Meaning |
|---|---|
| Ready for you | Read and waiting for your check. Press **Review**. |
| Needs attention | Something stopped. The card says which pages. |
| Being read | In progress ("Reading page 12 of 80", "Reading scanned pages: 3 of 9", "Reading figures: 4 of 20 pages"). |
| Paused, nothing lost | Waiting for a free allowance. It carries on by itself. |
| Waiting to start | Queued. |
| Finished | Done or skipped. |

**What the card says when it is ready**

- "N figures ready to check. M need a look." Press **Review**.
- "All figures checked." Every figure is decided. **Review** is still there, and **Done with this document**.
- "Read. No figures matched; open it beside your file."
- "Read. The commentary notes are in the document pane beside your file; there are no figures to check." (Commentary pages are summarised privately. They are never published.)
- "N pages could not be sorted by the desk. You can choose the pages to read yourself."

**Choosing which pages to read.** Open **Pages to read** on a card. It lists each page and what the desk thinks it is. Tick the ones you want. A document starts with a limit of 20 pages read by the AI. You can raise it to 40, the most. Press **Read the ticked pages** to start. **Re-read page N** reads one page again, harder. It shows its price first ("Re-read, using about N tokens") and you confirm.

**Reviewing figures** (press **Review**)

1. Page title: "Review: <document>". If the document is linked to the wrong company, use **Change company**.
2. **Flagged figures come first, one at a time**: "Check 1 of 3". The card shows the label, the page, "The desk read" with its figure struck through, why it was flagged, and "The page line" (the actual line from the page). Choose:
   - **1  Type the value from the page**. Enter **Value as printed on the page**, plus **Year, for example FY26**, **Unit** or **Prior-year figure as printed** if asked. Press the save button.
   - **2  Drop it**. Rejects the figure.
   The keys `1` and `2` also work while the card has focus.
3. Then "All checked. N figures to file". Under it: "N accepted · N edited · N rejected". Figures are grouped by topic. Each has a tick box (ticked figures will be filed), an **Edit <label>** button (type the value, press **Use**), and a button that opens that page's text, so you can read the line yourself. Untick a figure to leave it out.
4. At the bottom is **File under**. Fill in **Document title**, **Type** (Annual report, Presentation, Filing, Transcript, Other), **Filed on** (required) and **Public link (optional)**. Press **File N figures under <file title>**. If the company has no file yet, the button says **Start a file for <company>** and creates a private, empty file.
5. The filed figures now wait, staged, in that file's facts form (section 4.4). **They are not part of the file until you save a revision there.**
6. When the document is finished, press **Done with this document**. It asks: "This deletes the stored PDF and cannot be undone. Its page text and the figures you filed stay." Choose **Delete the PDF and finish** or **Keep the PDF**. Finishing frees storage.

The review screen tells you if there is nothing to review: "Nothing to review. No figures are waiting for this document."

**Reading beside your file.** On a company file, **Open a document** shows the filed document next to the editor. You can step through pages (**Previous page**, **Next page**), search the text, press **Use as source** to add the document to the Sources list, and use **Check my quotes** to compare each quoted line with the page it cites. Commentary notes the desk summarised are labelled "Machine-read"; a claim whose line is printed on the page offers **Use as a fact**.

**On the public side.** A figure filed from a document shows, under its quote on the public file, the line: "Printed on p. N of <source>; matched by the desk and accepted by the analyst." It appears only for a figure that has a record of where it came from.

**Messages you may see**

| Message | What it means and what to do |
|---|---|
| "You uploaded this file before. Open the earlier copy." | Same file already in the Inbox. |
| "Over 50 MB. Upload the financial statements section, or compress the file." | Make the file smaller. |
| "Drop a PDF, a photo or a voice note." | That file type is not accepted. |
| "This photo is still over 1 MB after shrinking; crop it to the table." | Crop it. |
| "The upload did not arrive complete. Upload the file again." / "The upload did not finish. Choose the file again to resume." | Choose the file again. |
| "Upload not finished. Choose the file again to resume." (on a card) | Same. |
| "Use a full link that starts with https:// and has no user name, password or port number." | Fix the link. |
| "That link points somewhere the desk will not open." | The desk refuses addresses inside private networks. |
| "The desk could not open that link. Check it, or paste the text instead." | Open it in your browser and paste the text. |
| "That link sends the desk through too many other links. Open it in your browser and paste the final link." | As it says. |
| "That link is over 50 MB. Download the part you need and upload it." | As it says. |
| "That link took longer than 30 seconds to answer. Try again, or paste the text instead." | As it says. |
| "That link is not a web page or a PDF. Upload the file instead." | As it says. |
| "No readable text was found at that link. Paste the text instead." | As it says. |
| "Paste a little more, at least 50 characters." | Text was too short. |
| "That is over 200,000 characters. Paste the part with the figures." | Paste less. |
| "AI reading is off. Pages are still read and searchable; open a document beside your file to enter figures." | No figures are proposed. Read the document beside your file and enter figures by hand. |
| "AI reading is off, so figures cannot be read yet. Pages are still read and searchable." | Same. |
| "Today's free AI allowance is used up. It carries on by itself: ..." | Wait. Nothing is lost. |
| "Waiting a minute for the AI allowance." | Wait. |
| "Today's free scan reading is used up. It carries on by itself within 24 hours." | Wait. |
| "Scan reading is off." / "Scan reading is off, so this scanned page cannot be read. Enter it manually or skip." | Enter figures by hand, or skip. |
| "This PDF could not be opened (it may be password-protected or damaged)." | Remove the password or get a clean copy. |
| "Pages 142-147 could not be read." (Needs attention) | Press **Try again**, **Skip**, or **Enter manually** (this goes to the Items tab). |
| "This scanned page is over the free reader's 1 MB limit. Enter it manually or skip." | As it says. |
| "Nothing could be read from this scan. Enter the figures yourself, or skip." | As it says. |
| "The scan reader did not accept the desk's key. Check the OCR.space key in the settings, then try again." | Tell Shlok (section 7). |
| "The scan reader has refused three requests in a row ... Try again later, or upload a text PDF instead." | The free reader's limit is shared. Try later. |
| "This document is at its page limit. Raise the limit to read more pages." | See "Choosing which pages to read". |
| "You marked this document done or skipped, so its pages are not read again." / "... its figures can no longer be reviewed or filed." | The document is closed. |
| "Type the value from the page first." / "Add the period, the as-of date and the unit." | Fill the missing box. |
| "Type the figure as printed on the page, for example 41.20." | Use digits as printed. |
| "This figure is already filed. Change it in the file's Facts form." | Edit it in the file. |
| "Add the date the document was filed." | Fill **Filed on**. |
| "Check the flagged figures first." | Finish the "Check N of M" cards. |
| "Tick at least one figure to file." | Tick a figure. |
| "This document is not linked to a company, so there is no file to put its figures in." | Use **Link to this company**. |
| "Some of this document's figures are already in its company's file, so the company cannot be changed." | As it says. |

**Limits**

- The free tools have daily allowances. A big annual report can take more than one day. It pauses and carries on by itself.
- Scans are read by a free reader that is weaker with tables. Check scanned figures with extra care.
- The site never files a figure for you. You tick each one.

### 4.6 The Ledger

#### What the Ledger is

The Ledger is where you record an idea about a company and see how it turns out against the market. It answers one question: when I said a company would do better (or worse) than the Nifty 50, was I right?

Some words, once:

- **Nifty 50** is the index of India's 50 large listed companies. The Ledger compares each share with it.
- **A close** is a share's closing price on a trading day. NSE is the National Stock Exchange of India; it publishes official closing files after each day.
- **Horizon** is how long you expect the idea to take, from 30 days to about 10 years.
- **Sealed** means the desk stamps your entry with its own date and time and links it to the entries before. Changes after the fact are meant to be detectable by the desk's own daily comparison, not by anyone outside the desk. The site's word for the result is "consistent with itself", explained below.

The Ledger is **private**. Nothing in it is shown on the public side. It is not advice and nothing on it is a recommendation.

**Deliberate limits.** Read these once, because they surprise people.

- **Entries have no edit and no delete.** The warning under every text box says: "Once saved, this screen has no way to edit or delete an entry, and the desk sets its date. Write it the way you would stand behind it." This is on purpose. The record is only worth reading if it shows what you thought at the time. To change your mind, add a new entry.
- **You cannot set a date.** The desk dates every entry itself. No entry can be backdated.
- **You can withdraw an idea only for a short time after opening it** (at most 24 hours; the form shows the exact time). After that, its entry price is fixed and you can only close it.
- **A closed idea cannot be reopened.**
- **Scores are not typed by you.** The desk computes them from official closing prices. Your words and the numbers are kept apart.

#### The Ledger page

Open the **Ledger** tab. From the top:

1. The heading **Ledger** and the button **Record an idea**. Under it, two links: **Closes and corporate actions** and **What I learned**.
2. A status box with three lines:
   - "Closes to 12 Oct 2026." (how current the prices are) and, if any: "N days rest on closes entered or dropped by hand." Or "No closing prices yet."
   - The consistency check (below).
   - The public copy line (below).
   - A fold-out **Daily steps** listing the three daily jobs (Closing prices, Scores, Public copy) with the time each last ran. It opens by itself, with "Daily steps: one failed", when one failed.
3. The figures (below).
4. **Needs you**: cards for ideas that need a look.
5. **Open ideas** and **Closed ideas** lists.

If you have no ideas, the page says: "No ideas yet. Write the first one when you have a view you would stand behind."

#### Recording an idea

1. On the Ledger page press **Record an idea**. The page says: "This is a commitment, not a passing thought. The desk seals it with the date and time it is saved, then sets the entry price at the next close."
2. **Company**: choose from the list. A company with no NSE symbol or one still waiting on the Names tab is listed but greyed out, with the reason. Fix it on the **Names** tab first.
3. **What do you expect?** Choose "Expects to do better than the Nifty 50" or "Expects to do worse than the Nifty 50".
4. **Over what horizon?** Choose 6 months, 1 year, 3 years, or **A number of days** (30 to 3650).
5. **Do you hold it?** "Yes, I hold a position" or "No, I do not hold it".
6. **Why do you think so, and what would change your mind?** Your words. The wording guide sits beside it.
7. Press **Record the idea**. The button says "Recording..." while it works.
8. You land on the idea's page: "Idea recorded and sealed." with a line such as "Sealed 14 Oct 2026, 14:02."

The idea opens with no score. Its score starts after the desk has the next close.

**An idea linked to a company file.** The New idea page can be opened with a company file attached (`?item=<file id>` on the address). Then the company is fixed to that file's company: "Linked to the file for <name>. The company is fixed while the idea is linked to a file." I found no button on the screens that opens it this way, so you will not normally meet this. You cannot link an idea to a file later, and there is no unlink.

#### The idea page

- **Header**: company name and symbol; what you expect, the horizon and the date it ends ("(past its horizon)" when it is over); whether you hold a position; status (Open, Closed, Withdrawn); the sealed time; links **Open the company file** and **Add to this idea**.
- **Scored by the desk**: the machine's numbers. They are not your words. The section explains: the result is for the call, and "a positive figure means it ended as expected, whichever way it pointed." It shows **Entry** (date and close), **Marked to** (or **Exit** once closed), **Split or bonus factor** if any, **Share** (the share's move), **Nifty 50**, **Result for the call** (the share's move against the index, in percentage points), and **Days held**. The result word is "as expected" or "not as expected". For an open idea it says "as expected so far" or "not as expected so far", because it is not final.
- A score for an idea that expected to do worse than the Nifty 50 counts as "as expected" when it did worse.
- Level with the index counts as "not as expected".
- Returns are **price only**: "Price return only: dividends are left out on both sides."
- **What you wrote**: every entry in order, with its date, its kind and the first eight characters of its fingerprint.
- **Add to this idea**: one form at a time.

Until a score exists, the page shows one of: "Entry will be set at the next close.", "Entry: close of 14 Oct 2026. The first result appears after the next close.", or "No result yet: waiting for a close."

#### Adding entries

At the bottom of the idea page, under **Add to this idea**, choose **What do you want to add?**. On an open idea:

| Choice | Button | Use it when |
|---|---|---|
| Add a note | Add the note | You want to record a thought, with no change. Box: **Your note**. |
| Revise the thesis or the horizon | Save the revision | Your reasoning or horizon changed. Choose "Keep the horizon as it is", a standard horizon, or a number of days. Box: **What changed in your thinking**. |
| Record that I bought more | Record the purchase | You added to the position. Box: **Why you bought more**. |
| Record that I sold some | Record the sale | You reduced it. It asks "Do you still hold some?" (Yes, I still hold some / No, I hold none now). Box: **Why you sold some**. |
| Close this idea | Close the idea | You are finished. Choose a **Reason**: Played out, Thesis broken, Horizon reached, Better use of the money, Other. Box: **Why you are closing it**. The form says: "The exit is set at the next close. A closed idea cannot be reopened." |
| Withdraw this idea | Withdraw the idea | You opened it by mistake and the window is still open. It shows: "You can withdraw this idea until <date, time>. After that its entry price is fixed and you can only close it." Box: **Why you are withdrawing it**. |

After saving: "Entry added and sealed."

On a **closed** idea the only choice is **Write what I learned** (below). A **withdrawn** idea takes nothing: "This idea was withdrawn, so nothing more can be added to it."

#### Closing an idea and writing the lesson

1. Choose **Close this idea** and fill the form. The exit price is the next close.
2. Choose **Write what I learned**. Fill **What you learned**. Choose **Was the process sound?** ("Process was sound" or "Process was flawed"). Tick at least one **What kind of mistake, if any?** (Thesis, Valuation, Timing, Sizing, Process, Behaviour, Luck, or No mistake). Press **Save what I learned**.
3. The Ledger page reminds you with a "No lesson yet" card ("Closed <date>. Write what you learned while it is fresh.") and a **Write the lesson** button.

#### The figures at the top of the Ledger page

- **Closed ideas**: "N of M" with the note "ended as expected", and a percentage once there are at least 5 closed ideas. Below it, if any closed ideas were left out: "N closed idea(s) not counted yet (needs a check, waiting for a close, or exit not fixed)." The count is never shown without that line, so the headline cannot hide them. Under 5 closed ideas: "Fewer than 5 closed ideas: no percentage and no median are shown."
- **All ideas, to the latest close**: "N of M", with "as expected so far". It counts open ideas at their latest score, so it can move.
- **Median result, closed ideas**: the middle result, in percentage points. "none yet" until 5 ideas have closed.
- **Median days held**: for closed ideas, with the range.
- Notes underneath: how many ideas expect to do better and how many worse, a line explaining that "each idea is judged in the direction of its own call", how many ideas were withdrawn and are not counted, and "Figures to <date>".

#### Marks on scores

A **mark** is a plain sentence under a score that tells you something about how it was built. A mark is not an error. Some say "Needs a check". The marks:

| Mark | What it means |
|---|---|
| "Entry will be set at the next close." / "Exit will be set at the next close." | Waiting for a price. |
| "Includes a close that was entered by hand." | A price you typed or a file you uploaded as NSE's official file is used, not the desk's own fetch. |
| "Includes a split, bonus or note about a price move that you entered by hand." | You entered a corporate action that falls inside the idea's period. |
| "The latest close is three or more weekdays old." | The score is stale. |
| "Needs a check: the price moved sharply. Was there a split or bonus?" | Enter the corporate action (below), or enter "No action needed" if nothing explains the move. |
| "Needs a check: the share's identity code changed." | The share's ISIN changed. Look into it. |
| "Needs a check: the return is too large to be believed." | A price is probably wrong. Check the closes. |
| "Needs a check." | A check flag this version does not describe. |
| "Entry taken N trading day(s) late: the share had no close on the days before it." / "Exit taken ..." | The share did not trade on those days. |
| "Restated on 13 Oct 2026." with lines like "Entry close: was 100.00, now 101.50." | A stored price changed, so the score was recomputed. The old figures are kept in the history. |
| "Another part of the score changed." | A restatement changed a detail with no label of its own. |
| "The idea was withdrawn, so its score was removed." | As it says. |

A score that needs a check shows its sentence where the result would be, and it stays out of the counts until it is settled.

#### The consistency check

In the status box at the top of the Ledger page is the check. When it passes, it says: "Consistent with itself: N entries, M sealed days." Right below it, always: "This checks that the entries and the sealed days agree with each other. It does not show that nothing could have been changed."

This is the strongest thing the site says about the record. The desk writes down a fingerprint of each day's entries (a "sealed day"). The check recomputes the fingerprints and compares them with the entries. Changes after the fact are meant to be detectable by this daily comparison. While the public copy is switched off (it is, in this version: see the next heading and section 7), the comparison is made only against the desk's own database, so someone with access to the database itself could change the record without it showing. It is a check that the record agrees with itself. It is not an outside audit.

If it fails, a red box says **The ledger failed its own check** and names which check found it: **Entry chain check** ("The ledger chain is broken at entry N.") or **Sealed-day check** ("The sealed days and the entries disagree from <date> (<reason>). This check changed nothing. Tell Shlok."). Do not try to fix anything. Tell Shlok.

If the check could not run, you see: "Could not check: the integrity check did not run just now. This says nothing about the ledger either way. Reload to try again." Reload the page. If it keeps saying that, tell Shlok.

A failing check does not stop you from recording an idea or adding an entry: those never run it. It stops the scores from being recomputed (the scores already stored stay as they were), it stops new days from being sealed, and it blocks publishing any file about a company (section 5). If a screen says "The ledger failed its own check. Nothing was saved.", the same applies: tell Shlok.

#### The public copy line

The line below the check will say "Nothing in the public copy yet; N sealed days waiting (the public copy may be switched off)." The public copy is switched off in this version. See section 7 for what it is. Nothing is wrong when you see this line.

#### The Closes page

Open **Closes and corporate actions** from the Ledger page. The page opens: "The closing prices the scores rest on. The desk fetches NSE's official files by itself each day; this page is for when it cannot, and for what you enter by hand. A close you type or an action you enter is marked on every score that uses it."

The desk fetches closes each morning. A day's close is normally in the desk the next morning.

Sections, in order:

1. **Recent days.** Each of the last days with its state: "Open" (with where the price came from: "NSE's official file, fetched by the desk", "a file you uploaded as NSE's official file", or "a close you typed"), "Shut: no trading", "Not decided yet", or "Today: NSE publishes its file after the close". An open day lists any company you track that has no close for it: "No close yet for Acme Ltd, Beta Ltd and 2 others.", or "Every company you track has a close." A day is marked shut only when NSE has no file for it and a later day is open.
2. **Fetch closes now.** "Asks NSE for the days that are not decided yet, then scores the ideas. The public copy is left to the daily run." Press **Fetch closes now** (it says "Fetching..."). The result shows one line per step, such as "Closing prices: stored 2 dates, 4 closes". If a fetch is already running: "A fetch is already running. Wait for it to finish, then reload this page."
3. **Drop NSE's official file.** For when NSE does not answer the desk. Download the day's files from NSE yourself, then fill in:
   - **Trading date of the files**
   - **Equity file (the day's bhavcopy, a .zip)**
   - **Index file (the day's indices, a .csv), optional**. Drop it too: the Nifty 50 close opens the day. On a day marked shut, the index file is required.
   Press **Store the official closes** ("Reading the files..."). The desk reads them the way it reads its own fetch and stores the closes of the companies you track as "a file you uploaded as NSE's official file". The desk checks the file's layout and date; it cannot check that the file is NSE's. The file itself is not kept; the desk records only when you uploaded it, the trading date, the file's fingerprint (a SHA-256 hash) and size, and how many closes were stored. The date must be within the last 400 days. Limits: the equity zip up to 2 MB, the index file up to 512 KB, both together up to 2.5 MB. The real files are about 210 KB and 20 KB.
   - Success reads like: "Stored 4 closes for 12 Oct 2026 from a file you uploaded as NSE's official file. The Nifty 50 close is stored, so the day is open. Scored 3 ideas." The number is what was actually written. A close that already had one from NSE's fetched file or from an earlier upload is left as it was and counted separately: "Stored 3 closes for 12 Oct 2026 from a file you uploaded as NSE's official file. 1 close in the file already had a close from NSE's fetched file or an earlier upload and was left as it was." If nothing was written it says "Nothing new was stored for 12 Oct 2026." The first upload for a day stands: dropping a corrected file for the same day does not replace it.
   - If the file is refused, the message says why and always ends "Nothing was stored." The common ones: "Choose the equity file (the day's bhavcopy zip) first.", "That date is more than 400 days back. Closes can be dropped for a day in the last 400 days. Nothing was stored.", "Choose the trading date the files are for.", "The market has not closed yet for that date (15:30 India). Drop the files after the close.", "The equity file is not a zip file. Choose the day's bhavcopy zip.", "The equity file is for 9 Oct 2026, not the date you chose.", and "A closing price the desk needs (a company you track) is blank or not a plain number, so the whole file was refused and nothing was stored. To go on, type that close by hand below ...". If you see a message you do not understand, send it to Shlok. If it says "You are signed out", sign in again and drop the files again.
4. **Type a close.** For one company and one day, when the official file is not available. Choose **Company** (one that has an idea), **Trading date**, **Closing price of the company**, and optionally **Nifty 50 close for the same day, optional**. Press **Store the close**. You see: "Close stored as typed. It is marked on every score that uses it." If the day already has a close for that company from NSE's fetched file or from a file you uploaded, the typed close is not stored and the page says so (see the messages below). Rules: not before 15:30 India on the day, not on a weekend, not on a day marked shut, and not for a day more than 400 days back. A day is open only when its Nifty 50 close is stored, and a score needs both closes.
5. **Closes you typed or dropped.** Every close that is not NSE's own fetched file, over the last 400 days. "The fetched file replaces them when it arrives, if the day is still inside its seven-day fetch window."
6. **Files you uploaded.** One line for every official file you have uploaded, kept for good: the day and time (India time) you uploaded it, the trading date, the first 12 characters of the file's fingerprint (a SHA-256 hash of the zip as the desk received it), and "stored N, kept M" (with or without the Nifty 50 close). The file itself is not kept. NSE's real file for a day has one fingerprint, so anyone holding that file can compare. A refused upload leaves no line.
7. **Scores restated lately.** A stored close changed an idea's score, so a dated row is listed here, with the figure that moved.
8. **Splits, bonuses and other actions.** See next.

**Closes: messages**

| Message | What to do |
|---|---|
| "Type the close as a plain number such as 1234.50 (up to four decimals, no commas)." | Retype. |
| "Choose a real date that is not in the future." | Fix the date. |
| "The market has not closed yet for that date (15:30 India). A close can be typed after it." | Wait. |
| "NSE has no session on a Saturday or Sunday, so a close cannot be typed for it." | As it says. |
| "NSE had no trading on that date, so a closing price cannot be typed for it. If NSE did trade that day, upload NSE's official file for it instead." | Drop the official file with the index file. |
| "That close was not stored: only a company that has an idea on file (not a withdrawn one) takes a close." | Pick a company with an idea. |
| "That day already has a close for this company from NSE's fetched file or from a file you uploaded, so the typed close was not stored and the earlier close stands." | Nothing to do. The earlier close is the one in use. |
| "That date is more than 400 days back. A close can be typed or dropped for a day in the last 400 days." | Choose a later date. |

#### Corporate actions (splits and bonuses)

A **split** or **bonus** changes a share's price without changing what it is worth. If one happened during an idea, the score must know. The Closes page flags a sharp move for you ("Was there a split or bonus?").

At the bottom of the Closes page, under **Splits, bonuses and other actions**, fill in:

- **Company**
- **What happened**: Split, Bonus, Other, or No action needed
- **Ex-date** (the first day the share trades at the new price base)
- **Factor (0.001 to 1000)**: new shares per old share. Enter 5 for a 1:5 split (one old share became five). Enter 2 for a 1:1 bonus. For "No action needed", leave it at 1 (it is not asked for). It must not be 1 for a split, bonus or other.
- **Note, optional (up to 500 characters)**

Press **Enter the action**. You see: "Action entered. It is marked on every score whose period it falls in." Choose **No action needed** when you looked at a sharp move and nothing explains it.

**To change an action,** press **Correct this entry** on it, fill in the form and press **Enter the correction**. The page explains: "You are correcting an earlier entry. The new entry replaces it; the earlier one stays listed as replaced." This screen has no way to edit or remove an entry. Errors: "The factor must be a number from 0.001 to 1000, and not 1 for a split, bonus or other action. For 'No action needed' leave it at 1.", "That action is already entered. To change it, choose 'Correct this entry' on the earlier one.", "That note is over 500 characters. Shorten it."

Any action with an ex-date between the day an idea opened and the day it is marked to adds the "Includes a split, bonus or note ..." mark to that idea's score.

#### The journal

Open **What I learned** from the Ledger page. It lists the lessons you wrote when you closed ideas, newest first, exactly as you typed them. Each shows the company (a link to the idea), when it was sealed, your process call and your mistake tags. It shows 25 at a time ("N more lessons not shown. Show more"). It has no numbers, charts or export. Before your first lesson: "No lessons yet. When you close an idea, write what you learned and it will be listed here."

#### Ledger messages you may see

| Message | What it means and what to do |
|---|---|
| "This company has no NSE symbol yet. Add it under Names first." | Open **Names** and settle the company. |
| "This company is still waiting for review, or has been merged into another. Settle it under Names, then record the idea on the company it became." | As it says. |
| "An open idea on this company expects the opposite. Close or withdraw it first." | You have an open idea on the same company with the opposite call. |
| "Write your own words first. An entry cannot be empty." | The text box is empty. |
| "That is over 10,000 characters. Shorten it." | Shorten it. |
| "Choose a horizon from 30 days to 10 years." | Fix the number of days. |
| "Check this idea's fields and try again." | Something was missing. |
| "This idea is not open, so that entry cannot be added." | It is closed or withdrawn. |
| "This idea is still open. Close it before writing what you learned." | Close it first. |
| "This idea can no longer be withdrawn, because its entry price is about to be fixed. Close it instead." | The withdraw window passed. |
| "This idea was withdrawn, so nothing more can be added to it." | As it says. |
| "This idea or company could not be found." | Go back to the Ledger. |
| "That file is about a different company. Open the idea from the company's own file, or without a link to a file." | As it says. |
| "The ledger failed its own check. Nothing was saved. Run the integrity check on the Ledger page." | Open the Ledger page, read the box, and tell Shlok. |

### 4.7 What a visitor sees on the public side

Anyone can open these pages without signing in. The bar along the top (or bottom, on a phone) has **Desk**, **Files**, **Notes** and **About**. **Process** and **Mistakes** pages also exist.

- **Case files (the home page).** A line says what a file is: "Each file says what Aksh expected, what would prove him wrong, and every revision since. For learning, not advice." Below it are four count tiles: **Files**, **Tests**, **Revisions** and **Logged** ("N of 30 days"). They are counts only. The Logged tile shows how many of the last 30 days you captured something, and never what you wrote. Then a "What changed" list (the reason for each revision comes first) and a register of the files.
- **Files.** Every public file. You can search by symbol.
- **A file.** The view, the tests, the facts with their sources, the revision history, and the disclosure. Under a filed figure's quote, if it has a record of where it came from: "Printed on p. N of <source>; matched by the desk and accepted by the analyst."
- **Notes** and **Process.** Your learning notes and process notes that you published, each listing the files that use it. Until you publish any, they say "No learning notes yet ..." and "No process notes yet ...".
- **Mistakes.** Closed cases in which you judged your own process flawed, or named a kind of mistake, with your review words and a link to the case (section 4.9). Until one is public the page shows its placeholder: "Nothing here yet. Closed cases in which Aksh judged his own process flawed, or named a kind of mistake, are listed here with his own words and a link to the case."
- **Closed cases** (`/cases`, no tab; linked from Process and Mistakes) and the **How this record is kept** section on Process. Both appear only while a case study from the ledger is public (section 4.9).
- **Videos** (`/videos`, no tab; linked from What changed on the home page, the feed and shared links). Each public video has its own page with a click-to-play box (no picture), your chapters and the transcript (section 4.12). The page does not exist until a video is listed.
- **About and disclosures.** Who you are, how a page gets published (the rules in section 5), and the standard disclosure.
- **On every page,** a disclosure line: "For learning · Aksh is not SEBI-registered · Figures 30+ days old."
- **On a file, a note, a process note and a closed case,** a **Save as PDF** button under the dates (section 4.11).

A file appears here only after it passed the checks and its **Figures to** date is 30 days old. A visitor never sees the desk, the inbox, your captures, or the Ledger.

### 4.8 Your model on the desk

**What it is.** Upload your valuation workbook (an Excel `.xlsx`) and the desk recalculates it with its own engine, so you can try other assumptions and see what changes, on your phone if you like. It is private: nothing on the model page is ever published (rule 9), and a visitor never sees it.

**Uploading.** In the Inbox, open **Company, filing date and link**, type the company as `$SYMBOL`, and drop the `.xlsx` file. A workbook needs a company and must be under 10 MB. Each new upload for the same company is the next version (version 1, version 2 and so on); the earlier versions stay as they were.

**What is read.** Every sheet's numbers, text, formulas and the values Excel saved, and each cell's number format. Pictures, charts and comments are ignored. The desk then works out every formula again and compares its answer with the one Excel saved. Nothing is sent to an AI.

**What it refuses, and how to fix it.** The card in **Needs attention** says exactly what to do. The usual ones:
- Macros (`.xlsm`, or a macro file renamed): save a copy as a plain `.xlsx`.
- Links to other workbooks: in Excel, **Data > Edit Links > Break Link**, then save.
- An Excel data table (What-If Analysis), often used for a sensitivity table: copy the table's cells and **Paste Special > Values**, then save. The desk draws its own sensitivity grid.
- Password protection, or the old `.xls` format: save as `.xlsx` without a password.
- Too large or too slow to read in one go: remove sheets the valuation does not use.

Press **Upload a fixed workbook** to go back to the drop bar. If a read simply stopped, **Try again** starts it once more.

**Choosing inputs and results.** When the read is done the card says, for example, "Model read: 4 sheets, 3,912 cells, 1,204 formulas. Choose its inputs and results." Press **Open model**. The page first says how the check went ("All 1,204 formulas give Excel's answers", or how many differ and why). Then it lists the cells it suggests:
- **Inputs** are plain numbers your formulas read (cost of equity, growth, margins).
- **Results** are cells the workbook calculates (equity value, per-share figure).

Nothing is ticked for you. Each row shows what the sheet says next to the cell ("sheet says: Cost of equity"), the value and the address (`DCF!B13`). Tick the ones you want; you may type your own label, or leave it empty to keep the sheet's. A cell the list missed can be added with **Add a cell**, by address (`DCF!C42`) or by searching the sheet's labels. Press **Use 4 inputs and 2 results** (the button counts for you). Nothing is calculated before that press, and the choice is fixed for that version: to change it, upload the workbook again.

**Trying scenarios.** Change an input and the results update: each shows the **Workbook value**, the **Scenario output** and the **Change**. A percentage is typed as a percentage: 11.5 means 11.5%. **Reset** puts one input back to the workbook's value. **Save as scenario** keeps your input values under a name (with a note if you like); pick it again from **Scenario** later. **Workbook values** is always there and never changes. A saved scenario can be deleted, not edited: save a new one instead. The sensitivity grid shows one result for a range of two inputs around your current scenario (5 x 5 on a computer, 3 x 3 on a phone); press **Fill the grid**, which takes a few seconds.

**Why a result can be unavailable.** The desk only offers a result it can reproduce exactly. A result cannot be chosen (it is greyed, with the reason) when it depends on a cell that:
- gives a different answer from Excel;
- uses a function the desk cannot compute yet (the page names it, for example `CUBEVALUE`);
- is part of a loop that Excel solves by repeating (iterative calculation);
- had no value saved by Excel, or uses a random number.

A cell that reads `TODAY()` is counted in the report as differing from Excel, because its value moves from day to day. It does not stop a result being chosen.

If a chosen result shows **Not available** after a change, the new inputs made the formula fail (for example a division by zero); the engine's error is shown beside it.

**How to break an Excel loop or link.** A loop is usually interest that depends on a debt balance that depends on interest. Calculate interest on the opening balance instead of the average, or paste last period's figure as a value; then turn iterative calculation off (**File > Options > Formulas**) and save. For a link to another workbook, use **Data > Edit Links > Break Link**; Excel replaces the linked cells with their values.

**If the calculator does not load.** The page says "The calculator did not load. Check the connection and reload. Your saved scenarios are safe." The workbook values stay on the page meanwhile.

**Where to find it again.** The inbox card's **Open model**, the **Model** button in a company file's header (once a version is confirmed), or `/desk/models` for every company's newest model.

### 4.9 Case studies

**What it is.** When an idea is closed and you have written the lesson, you can turn it into a case study: a public page that shows what you expected, what happened and what you learned, in the words you sealed at the time. Each entry carries its fingerprint and a button that lets any reader check, in their own browser, that the fingerprint comes from the text shown. The page prints no result: no return, no rupee price, no "ended ahead". It is a past case, not a view on the share today.

**It is off until Shlok switches it on.** Nothing is public unless the site owner has switched case studies on (and the chart on, for the chart) and the case passes the publishing checks. You can draft and write a case study at any time. If it is off, the checks say so: "Case studies from the ledger are switched off by the site owner." Shlok's two switches are in `docs/runbooks/case-study-switches.md`.

**What is shown.** Your opening entry, every change of period, your closing entry and each lesson, with the dates the desk set. Never your notes, and never an entry about adding to or trimming a position. You do not pick entries; the desk takes those and no others.

**How to write one.**

1. Close the idea and write the lesson (section 4.6). The exit price must be fixed.
2. Open the idea. On a closed idea the **Case study** block says what is missing: "A case study shows what you learned. Write the lesson first." or "The exit price is not fixed yet. A case study can be drafted once it is." When it is ready it says when it can go public at the earliest, and whether case studies are switched on now. Press **Draft a case study**. Pressing it twice makes one case study, not two. You land on its page.
3. The page shows **From the ledger (sealed; cannot be edited)**: your entries exactly as sealed, with the dates and the entry and exit closes. You cannot change them here. There is no facts sheet for this kind of page.
4. Fill in **Learning objective** (what a reader should learn from the case) and **Holds position**, and press **Save details**.
5. If you want to, write what you see looking back in the body. It is shown under "Looking back" on the page, and it can stay empty. A price or a return in your words ("down 18% since I opened it", "trades at Rs 450") is refused by the check: this site prints no result. Press **Save revision**.
6. On the publish checklist, read the line "Case studies from the ledger: On (site owner)." or "Off (site owner)." If the company is not public yet, press **Make <company> public**. Tick the box about your stance on the company, and press **Run the publishing gate**.

**When it can go public.**

- At least 30 days after the latest entry it shows (the "Figures to" date it carries is that entry's date, and the desk sets it).
- No idea on that company is open. The gate says: "The ledger has an open idea on this company. A closed case can be published once no idea on the company is open."
- One page per idea. "Another published case study already shows this idea."
- The wording lint applies to your sealed words like any text. While you write an idea, a change of period, a close or a lesson, a hint can say: "If this idea is ever shown as a case study, this sentence would keep it off the site (<rule>). Sealed words cannot be changed later." It never stops you saving.

**If the ledger changes.** A new lesson on a closed idea changes what the case study should show. The case page says: "The ledger has changed since this revision (a new lesson, or a day listed in the public file)." Press **Refresh from the ledger**; it makes a new revision with your body kept, then run the gate again. If the case is already public and the new lesson moves its "Figures to" date, the date is fixed while it is public and the page says: "Figures to is fixed while a case study is public. To use the ledger's date, <date>: Unpublish it, then Refresh from the ledger, then Publish." Do those three in that order. The page is down in between.

**What a visitor sees.** The case at `/cases/<name>` with three sections (what you expected, what happened, what you learned), your "Looking back", and "How to check these entries"; a list at `/cases` (there is no tab for it); the cases in which you judged your own process flawed, or named a kind of mistake, on **Mistakes**; and a section "How this record is kept" on **Process**. While the public copy of the fingerprints is off, the page says what the check shows (that the text is the one the desk sealed at that place in its chain) and what it does not (when it was written).

**Turning it off does not take pages down.** Switching a switch off stops new case studies and new revisions. A case that is already public stays public until you press **Unpublish** on its page.

### 4.10 Concepts, reads and your month

**What it is for.** Every `#name` you write becomes a concept. A concept has a page on the desk that gathers what you wrote about it: your learnings, your files, your process notes and what you read. The desk also keeps a reading log and puts your month together for you. All of this is private unless you choose to show a concept, and a read is never shown.

**A concept comes from a `#name`.** Write `#capital-cycle` in a capture. The first time the site sees a name, it waits on the **Names** tab. Press **New concept**, type the name as you want it read, and press **Yes, add it**. Until you do, the concept says "Not checked yet. Check it on Names." You can link up to 8 concepts to one note, and the first one counts as its main concept.

**The concepts page.** On the **Items** tab, press **Concepts** at the top. The list says, for each concept, whether it is Private or Public and how much you have under it. Press one to open it. The page has:

- **In your words**: a box headed "What you mean by <the concept>". Write what the word means to you. Only you see it ("Private. Only you see this."). The desk never writes in it and never changes it.
- Your notes and files that use the concept, in groups: **Learnings**, **Files and case studies**, **Process**, **Reads** and **Notes**, newest first.
- **Related concepts**: links you make yourself. Under **Link a concept**, choose one and press **Link**. Press **Remove** next to one to take the link away. Pressing **Link** twice makes one link.
- **Seen together in your notes**: when two concepts turn up in at least two of the same notes and are not linked yet, the desk lists them here, with the line "The desk found these in the same notes. Link one only if you see a connection." The desk only suggests. Nothing is linked until you press **Link**.

**Change the concepts on a note.** On a note's page, the **Concepts** row shows its concepts. Press **Change**, find a concept, tap it to choose it, and press **Save concepts**. The order you tap is the order they are kept in. Saving makes a new version of the note with the same words. If the note is already public, that version waits for the publishing gate, like any edit, and the public page keeps showing the old one. While a version is waiting, you cannot change the concepts again. The page says: "A newer version of this note is waiting to be published. Publish it before changing the concepts."

**The reason the desk writes.** A change of concepts gets a fixed change reason, for example "Concepts: added Capital cycle; removed Moats." Readers see a reason with the version, so it names only concepts that are public. Any other concept is counted, not named: "Concepts: added Capital cycle and 2 other concepts." A concept you have not made public never appears in a reason.

**Showing a concept.** A concept is shown on the site only when both of these are true: you pressed **Make public** on it (on its own page, or on the note's publish checklist), and a published note or file uses it. Making a concept public shows nothing by itself.

If a note uses a concept that is not public, the publish checklist says so. It reads "Concept "<name>" is not public yet." with the button **Make <name> public**, or "Concept "<name>" is not checked yet." with the link **Check it on Names**. If you run the gate anyway, it stops with one line for each such concept.

Once the note passes, a visitor can open **/concepts**, which lists each public concept, and a concept's own page, which lists the published notes and files that use it, each with "Since" and a date. Each of those notes and files also shows a line headed **Concepts** with links to those pages. Nothing else about a concept is shown: not the words in your box, not your links between concepts, not your reads. A concept's page does not exist until a published note or file uses it.

**Log a read.** Start a capture with `r:` and write what you read, for example `r: Marks, the Sea Change memo. Rates regime over #interest-rates`. The first line is the title, without the `#names` that end it (they link the concepts and stay in the text; you can edit the title on the note's page). A web address stays in the text. The receipt says "Reading log, private". A read is never published: its page says "A read stays private. It is not published." and has no publish checklist. A read is listed under **Reads** on its concept's page, on the **Items** tab (press **Reads** to see only reads) and on the month page.

**Your month.** On the **Items** tab, press **This month**. The desk's home page also says "This month: n learnings, m reads" and links there. The page "What I learned in <Month Year>" is put together by the desk from your notes that start with `l:` and from your reads. Learnings are grouped under their first concept, with "No concept" last. Each line is your own title, word for word, with its date, and links to the note. The **Reads** come after. The desk counts and groups. It does not shorten, reword or rank anything. **Earlier month** and **Later month** move between months. The page is private, and it leaves out the lessons you wrote in the Ledger.

**Messages you may see**

| Message | What it means and what to do |
|---|---|
| "Concept "<name>" is not public yet." | A note you want to publish uses a concept you have not made public. Press **Make <name> public**, then run the gate again. |
| "Concept "<name>" is not checked yet." | The name still waits on the Names tab. Press **Check it on Names** and add it as a concept. |
| "A newer version of this note is waiting to be published. Publish it before changing the concepts." | Run the gate on the waiting version first. |
| "Only the first 8 concepts were linked." | A capture had more than 8 `#names`. The rest stay in the text. |
| "That is over 2,000 characters. Shorten it." | The box under **In your words** holds up to 2,000 characters. |
| "A concept cannot be linked to itself." | Choose a different concept in **Link a concept**. |

### 4.11 Sharing your work: PDFs, links and the feed

**Save a page as a PDF.** A public file, learning note, process note and closed case each has a **Save as PDF** button under its dates. Press it and the browser opens its print window. Choose "Save as PDF" as the printer (on an iPhone, use Share, then Save to Files). The PDF is a dated document:

- At the top: "Aksh Agrawal · Case files", the page's address, and "This copy shows revision R2 of 15 Oct 2026. Figures to 31 Aug 2026. The current version is at the address above." A note has no "Figures to" part.
- At the end: the full disclosure, with your position in the share. A file, a case and a note about a company already show it on the page. A note about no company, the register and the other list pages get it on paper only, and it reads "Position in the security discussed: stated on each file."
- A link in the source list prints its address after its name, so the PDF still says where the figure came from.
- Left out: the menus, the tabs, the buttons, the sentence-by-sentence comparison of revisions, and anything that is folded shut on the screen. The list of revisions stays.
- Always light, on white, even if your phone or laptop is set to dark.

The result differs a little between browsers. A PDF is a copy. If you change or unpublish the page later, a PDF already saved or sent stays as it was; its top says which revision it shows. A copy cannot be called back.

**Printing a desk page.** You can. The desk's menus and buttons stay off the paper, the first page begins with a boxed line, and every later page repeats it at the top: "Private desk copy. Not for sharing: it has not passed the publish gate and may show figures less than 30 days old."

**What a shared link looks like.** When someone pastes a page's address into a chat or a social site, it shows the page's title, your learning objective word for word, and a card with the kind of page ("Learning note", "Process note", "Closed case" or "Concept"), the title and a date. A closed case never shows a number or a result, on the card or anywhere else a link is shown.

**The feed.** The site has a feed at `/feed.xml` that a feed reader can follow. It has one entry for each published version of a file, a note, a process note or a closed case, newest first, up to 50. An entry gives your reason for the change, the version and its date, what it teaches, and the line "For learning, not advice. Figures on the page are at least 30 days old." It holds nothing else: no figure from a file, no price, no result.

**Search engines.** The site lists its public pages for search engines. Only pages that are already public are listed. A test copy of the site (not the real address) tells search engines to list nothing.

**How soon it changes.** The feed, the page list and the cards follow what you publish or unpublish within an hour. A page you unpublish leaves them in that time. A copy a reader, a social site or a printer already took stays with them.

### 4.12 Videos

**What it is for.** A video of yours on YouTube can have a page on the site: the video itself (it loads only when a visitor presses play), your chapters, and a transcript of what you say, so a reader can search and skim. The desk only reads YouTube. It never uploads, edits or deletes anything there.

**Switched off until Shlok sets a key.** Until Shlok adds a YouTube key (section 7), the desk says "Video listing is not set up yet (Shlok adds a YouTube key)." and nothing is read from YouTube. A `v:` capture still saves; it waits.

**The steps**

1. **Upload to YouTube as Unlisted.** Not Public yet (see the last step).
2. **Capture the link.** In the Capture box type `v:` and paste the link, for example `v: https://youtu.be/AbCdEfGhIjK`. Links of the shape youtu.be/..., youtube.com/watch?v=..., /shorts/... and /live/... work; anything else says "That is not a YouTube link." The receipt says "Video, private". Open **Items**, then **Videos**, and open the video. Its first title is "Video" and the link's code.
3. **Let the desk read YouTube.** Within about 15 minutes it reads the title, length, channel and description. Or press **Fetch again** on the video page. The box "From YouTube" shows what YouTube answered, in the machine's type. It is not your words.
4. **Download the caption file in YouTube Studio.** Open YouTube Studio, choose **Content**, open the video, choose **Subtitles**, open the menu on the language row (the three dots) and choose **Download**, then **.vtt** or **.srt**. YouTube changes its menus now and then; the desk's own message says the same: "In YouTube Studio choose Subtitles, then Download, then .vtt or .srt." If the automatic captions have a wrong word, fix it in Studio first and download again.
5. **Drop the file.** On the video page, under **Transcript**, choose the file and press **Store transcript**. The first 20 lines show, the rest behind **Show all**. Then press **Use this transcript**; it goes into a new revision. The transcript is the machine's record of what was said. There is no box to edit it, here or anywhere, on purpose.
6. **Your own words.** Press **Use this title** if you want YouTube's title as the title (you can also type your own in **Details**). Press **Use chapters from the description** to take the chapter lines you wrote in the YouTube description (at least 3 lines that start with a time, the first at 0:00). Those titles are copied exactly as you typed them. Write the **Learning objective** and press **Save details**.
7. **Run the publishing gate** as for any file (section 4.4). Read the checklist first; it says which row fails and why.
8. **Make it Public on YouTube only after the desk lists it.** Until then leave it Unlisted. The desk accepts a video that is Unlisted or Public, so nothing is lost by waiting, and the spoken words are checked before anyone is sent to them. If a video is Public on YouTube and not listed on the site, the status line says so.

**What the gate checks for a video (rule 12)**

- The video is on **your channel** and is Unlisted or Public on YouTube, not private or gone.
- The YouTube facts were read **in the last 7 days** (while the key is on, the desk re-reads them every day).
- The revision names **the same video** the link points to.
- A **transcript** is in the revision, and it is exactly the stored one. The gate checks every sentence of it, word by word, with the same rule 1 as for a note.
- If the video **names a company**, the **Figures to** date is at least 30 days old.
- The **chapters** (if any) are 3 to 100, start at 0:00, rise in time, and each title is 1 to 100 characters.

**What it refuses, and why.** The transcript is what a visitor reads, so a spoken "you should buy this" is refused exactly as a written one would be: "Rule 1: no actionable language", pointing at the sentence in the transcript. You cannot edit the transcript to hide it, because it must match the stored one. You have three ways out. Say it differently in a new video. Or, if the sentence is you explaining your process (for example, a lesson on what not to say), allow that one sentence with a reason, as in section 4.4 (the reason is kept with the gate decision). Or leave the video unlisted on the site. A spoken performance claim (rule 2) has no allowance; that video cannot be listed.

**What a visitor sees.** A page with the title, what it teaches, a plain box with the title and the length and a **Play video (loads YouTube)** button, your chapters, the transcript with the line "Typed by machine from the video's captions and not edited. If it differs from the video, the video is the record.", and the usual disclosure. Nothing from YouTube or Google loads, not even a picture, until the visitor presses play. A chapter starts the video at that time. The page is also in the feed, the page list and the shared-link card, and it prints (without the player).

**Taking it down.** Press **Unpublish** on the video page. The page, the card, the feed entry and the page-list line leave within the hour (section 4.11). The video on YouTube is not touched.

**Messages you may see**

| What you see | What it means |
|---|---|
| "Video listing is not set up yet (Shlok adds a YouTube key)." | The key is not set. Nothing is read from YouTube. |
| "Waiting for YouTube" | The desk has not read the video yet. Press **Fetch again**. |
| "This is not a caption file. In YouTube Studio choose Subtitles, then Download, then .vtt or .srt." | The file is not a caption file. |
| "This file is too big for a caption file (1 MB at most)." or "This caption file is too long (5,000 cues at most)." | Download the captions for one language only. |
| "There is no transcript yet. Drop the caption file from YouTube Studio first." | Do step 5 first. |
| "The YouTube description has no chapter list that YouTube would accept: at least 3 lines that start with a time, the first at 0:00." | Fix the chapter lines in the YouTube description, then press **Fetch again**. |
| "A video needs its transcript before it is listed." | Do step 5, then run the gate. |
| "YouTube data is more than 7 days old. Fetch it again." | Press **Fetch again**, then run the gate. |
| "This video is not from your channel." or "This video is private or gone on YouTube." | The gate lists only your own Unlisted or Public videos. |
| "YouTube's daily limit is used up. The desk tries again tomorrow." | Wait. Nothing is lost. |

### 4.13 Letters

**What it is for.** A letter is an email that lists what changed on the site since your last one: the files, closed cases, notes and videos that went public. Readers ask for it on a public page, and each letter also sits on a public archive. The letter is your words (the subject, one sentence, an optional short note). The list of changes is copied from the site by the desk, with your own titles and reasons exactly as they are there. Nothing is written for you, and nothing is sent until you press.

**Switched off until Shlok sets up the email service.** Until then the desk says "Email is not set up yet. Letters still publish to the archive." You can make and publish letters, but the sign-up form stays shut and no email goes out. Real sending needs three things from Shlok (section 7; open questions Q9, Q36 and Q42): a domain that Resend has checked as his, a sender address on it, and a separate Resend key for letters. Until the domain is checked, Resend delivers only to its owner's own address, so a letter could not reach a reader anyway. Nothing is sent from a test or from a preview copy of the site.

**What a reader sees.** On the letters page (`/letters`): the plain notice (what is kept, that it goes through Resend in the United States, that they must be 18 or older, how to stop), an email field, an "I am 18 or older" tick and **Ask to subscribe**. Whatever happens the page answers: "Thanks. Aksh sends confirmation emails by hand, usually within a day. Open the link in it to start receiving letters." Below it are the letters already published. Every letter carries the standard disclosure and a stop link, and `/letters/leave` stops letters in one step (one field; the address is deleted at once). The stop page works even when sign-ups are shut.

**The two presses.** Nothing leaves the site without one of these, and each is yours.

1. **Send confirmation emails.** Open **Items**, then **Letters**, then **Readers**. **Waiting** counts people who asked. Press **Send confirmation emails (n)** (at most 50 a day; the page shows how many are left). Each person gets one plain email with a link. Opening the link shows a button; they press it to confirm. Only then are they a reader. Nobody is emailed because they signed up, so a reader may wait up to a day. **Bin** deletes a request and emails nobody; use it for any request you do not want.
2. **Send the letter.** On the letter page, after it has passed the gate, press **Send to n subscribers**. A box shows the subject and the exact number ("This emails n people. An email cannot be called back."), and asks you to tick "I have read the preview". Press **Send**. The press records your approval (who, when, which version, how many) and cannot be undone. The desk sends it within 15 minutes, usually at once. A second press, from another tab or later, sends nothing more: the page says "Sent to n on {date}".

**Making a letter**

1. Open **Letters**, then **What changed**. On a Monday in India the desk home also says how many changes there are. The list shows every public change since your last sent letter (the last 14 days for the first one), each ticked. Untick anything you do not want and press **Make this letter**. A letter holds at most 20 entries.
2. The letter opens with the subject "Untitled letter, {date}". That is only a label the desk gave. Replace it with your own subject. **Send stays off while the subject is still a label.**
3. Write the **one sentence: what a reader learns** (the gate needs it), and a short note if you want. Press **Save**.
4. Read the **Preview**. It is the email as it will arrive, with the standard disclosure and the stop link.
5. Run the **publishing gate**, as for any page (section 4.4). A letter goes onto the archive only if it passes, and a letter that has been sent cannot be published again. While it is public its subject and sentence are locked; **Unpublish** to change them.
6. **Send me a test copy** sends one email to you only (up to 5 a day). It is not a send to readers; use it to read the real email in your inbox.

**Readers: what you see and do not see.** The Readers page shows counts and the people still waiting (address and day asked). It never lists confirmed readers and has no export, on purpose: the fewer addresses the desk shows, the fewer can leak. **Open sign-ups** and **Close sign-ups** switch the form. It closes itself at 950 readers (the free list holds 1,000).

**When a reader leaves.** The stop link in every email (Resend's own) and the stop page both remove them, and the next letter is not sent to them. A letter already on its way may still arrive. The desk makes Resend's list match its own before every send and once a day. An email that has been sent cannot be recalled.

**Answering a reader's data request (the Q41 default).** A reader may write to ask what you hold, or to have their address deleted. The desk keeps only their address, the day they asked and confirmed, and that they ticked 18 or older. It keeps a record that a person asked, in a scrambled form that cannot be turned back into an address. To erase: open **Letters**, **Readers**, **Erase an address**, type the address from their email and press **Erase**. The page says "Erased." whether or not the address was on the list, so it cannot tell you; reply that any address you held has been deleted. To answer "what do you hold": their address and the dates above, nothing else (no name, no tracking, no reading history). The desk shows no list of readers, so it cannot show you one address; if you need that, ask Shlok. The notice names no contact address for complaints until Shlok gives you one to publish (Q41).

**Messages you may see**

| What you see | What it means |
|---|---|
| "Email is not set up yet. Letters still publish to the archive." | Shlok has not set up the email service. Nothing is emailed and the form is shut. |
| "The subject is still a label. Replace it with your own subject, save, and run the gate again." | Type your own subject, press **Save**, run the gate. |
| "There are no confirmed readers yet, so there is nobody to send this to." | Nobody has confirmed. Press **Send confirmation emails** first. |
| "Approved. The letter goes out within 15 minutes." | Your press is recorded. The page then shows "Sending" and, when done, "Sent to n on {date}". |
| "This letter has already been sent to subscribers, or its send is waiting." | You pressed a second time. Nothing more was sent. |
| "Another letter is being sent. Wait until it has gone." | One letter at a time. |
| "50 confirmation emails sent today. The rest can go tomorrow." | The daily limit. Nothing is lost. |
| "Some confirmation emails could not be sent. Those readers are waiting again." | Press again later. |
| "Not sent: the approval ran out after 24 hours." | An approval lasts a day. Press **Approve again**. |

**Taking it down.** **Unpublish** removes the letter from the archive, its page, its card, the feed and the page list within the hour. It does not call back an email that was already sent.

---

## 5. The publishing rules in plain words

**What this is.** What the site will and will not let you publish, and why.

**Why the rules exist.** You are not a SEBI-registered Research Analyst. An unregistered person may publish investor education. An unregistered person may not publish research reports, meaning anything that reads as a recommendation or opinion on a specific security that a reader could act on. A May 2026 circular adds a 30-day lag on price data in educational content. The site checks the rules in code, so a tired late-night publish cannot break them. These are engineering rules, not legal advice. You should confirm them with a lawyer or a NISM-certified research analyst, and again if you ever register.

**The one rule behind all rules.** There is no way around the checks. There is no override, no "publish anyway", no admin switch. The only publish route runs the checks every time, on every revision of a public file, not only the first.

**What the checks look for**

1. **No actionable language (rule 1).** Words and phrases such as "buy", "sell", "accumulate", "add on dips", "exit", "book profit", "target price", "stop loss", "upside of", "multibagger", "will rally", "will fall", and "undervalued by X%" when attached to a named company. It reads the title, the body, the learning objective and the structured data. If a flagged sentence is you explaining your process (for example "why I avoid target prices"), you may allow that one sentence, with a reason (section 4.4). Quotations from third-party documents, shown as source text, are not flagged.
2. **No performance claims (rule 2).** Phrases such as "returned X%", "my calls", "hit rate", "beat the Nifty", "CAGR of my ideas". Your private Ledger may show these. Public pages may not. No allowance exists for this rule: rewrite the sentence as what you expected and what happened, without a return figure.
3. **The 30-day lag (rule 3).** Figures about a named company must be at least 30 days old. In practice: set **Figures to** to the date your newest figure runs to. Every dated figure in the file must be on or before it. The whole file then goes public once that date is 30 days old. A file with dated figures and no **Figures to** date is refused. No allowance exists for this rule.
4. **No recent change of stance (rule 4).** A file about a company cannot be published within 30 days of your last Ledger entry on that company that changes your stance: opening an idea, closing it, buying more or selling some. Notes, revisions and lessons do not count. Details:
   - The site reads this from the Ledger. It applies to every revision of every item that names the company, and also to an item linked to an idea on it.
   - Days are counted on the India calendar. An entry dated 2 March blocks publishing on 2 March itself and every day up to 31 March. You can publish from 1 April. The checklist says "Rule 4: clear from <date>".
   - A withdrawn idea (inside its short window) counts for nothing.
   - It never takes down something already public. A file that is already public stays public.
   - The tick box ("I have not changed my stance on <company> in my private notes in the last 30 days.") stays, because the Ledger can only know what you recorded. If the Ledger already blocks the publish, the box is not offered.
   - If the Ledger fails its own check (section 4.6), every file that names a company is refused until it is looked at: "The ledger failed its own check, so nothing about this company can be published until it is looked at. Run the integrity check on the Ledger page."
5. **A disclosure is mandatory (rule 5).** Every public file ends with the standard disclosure, taken from your **Holds position** setting. You never type it. It reads: "Educational content only. Aksh Agrawal is not a SEBI-registered Research Analyst or Investment Adviser. Nothing here is a recommendation, offer or solicitation to buy or sell any security. Figures are shown with a minimum 30-day lag. Position in the security discussed: **{holds position}**. Investments in securities are subject to market risk; consult a SEBI-registered adviser before acting. Last reviewed {date}." Because of the Ledger, a "No" is refused if the Ledger shows you hold an open position in that company: "The ledger shows a position in this company; the disclosure cannot say no." Checklist row: "Position matches the ledger".
6. **A learning objective (rule 6).** One sentence on what the reader learns. It is what makes a page education rather than a view on a stock.
7. **Every revision is checked (rule 7).** A new revision of a public file stays hidden until it passes again.
8. **Everything public is checked (rule 8).** Title, address, learning objective, body, structured data and share-card text.
9. **No interactive valuation model is ever public (rule 9).** A valuation model's output is a price target by another name. A static table of scenario outputs, lagged and labelled, may be public if it passes.
10. **Videos (rule 12).** A video is listed only if it is on your channel, YouTube was read in the last 7 days, its transcript is in the revision and passed rule 1, a company video meets the 30-day lag, and the chapters are well formed. Section 4.12 has the steps. A spoken line cannot be edited away: the transcript is the machine's record.

**What stays private**

The whole Ledger, the counts of ideas that ended as expected, returns, target ranges, position sizes, the document inbox and its text, and your captures. This is on purpose: performance figures and live numbers are exactly what the rules keep off the public side while you are unregistered.

**Writing so the checks pass**

- Write "what I expected and why", not "what you should do".
- Write "the market priced X; I thought Y because Z", not "undervalued".
- Write the tests that would change your mind: "I would have been wrong if ...".
- Prefer ranges and scenarios to point targets, and call them inputs to a learning exercise.
- Publish your mistakes. They are the most credible content on the site.

**One case to remember.** If you open, close or resize an idea on a company, any file about that company waits 30 days. If you plan to publish a file on a company, publish it before you record an idea on it, or accept the wait.

---

## 6. When something looks wrong

Find the symptom, read what it means, do the step. If the last step is "tell Shlok", copy the exact words on screen.

| What you see | What it means | What to do |
|---|---|---|
| Red strip: "Background jobs are late: the daily job last ran 2 days ago. Your notes are safe; documents wait until the jobs run." | A scheduled job has not run on time. Captures are safe. Documents will not be read until the jobs run. | Wait a little, reload. If it stays, tell Shlok. |
| Red strip: "Background jobs are late: the closing prices' last run failed 10 min ago: <reason>" (or "the scores' ...", or "the public copy's ...") | The daily job that fetches closing prices (or scores the ideas) failed. The reason is the job's own words. | Your scores may be a day behind. Go to the Closes page: press **Fetch closes now**. If it still fails, drop NSE's file (section 4.6) and tell Shlok. |
| Red strip: "Documents have not moved for ...; your uploads are safe" | The document queue is stuck. | Tell Shlok. Nothing is lost. |
| Red strip: "The database cannot be reached right now. New captures stay saved on this device and sync when it is back." | The desk cannot reach its database. | Keep capturing. Try again later. |
| Red strip text adds: "The uptime monitor has emailed Shlok and Aksh." | The strip says this whenever it shows. | See note 3 in section 9. |
| A grey line: "The latest closing-prices run found no row for 1 of 3 companies in NSE's file." | One of your companies has no closing price in a day's file. This is a note, not a failure. | Look at **Recent days** on the Closes page. If a company keeps missing, type its close. |
| A grey line: "the public copy's last failed run was 3 days ago: ..." | The public copy of the ledger's fingerprints failed once in the last 30 days. | Ignore for now. Tell Shlok if the public copy is switched on (it is not, in this version). |
| Ledger page: "Could not check: the integrity check did not run just now. This says nothing about the ledger either way. Reload to try again." | The consistency check did not run. It did not find a problem either. | Reload. If it repeats, tell Shlok. |
| Ledger page: red box "The ledger failed its own check" | The entries and the sealed days do not agree. | Do not try to fix it. Tell Shlok. Scoring, sealing and publishing a file about a company are stopped until it is looked at; you can still record ideas and entries. |
| Ledger page: "Could not read how current the closes are." / "Could not read the public copy's state." | The page could not read that item. | Reload. |
| A score line: "Includes a close that was entered by hand." | A typed or dropped price is in use. | Nothing to do. It is replaced when the official fetch arrives. |
| A score line: "Includes a split, bonus or note about a price move that you entered by hand." | An action you entered falls inside this idea. | Nothing to do. |
| A score line: "Needs a check: the price moved sharply. Was there a split or bonus?" | The price jumped. A split or bonus may explain it. | Enter the action (or "No action needed"). |
| A day with no close: "Not decided yet" | The daily run has not stored the day. | Press **Fetch closes now**. If NSE does not answer, drop the day's file. |
| A day with no close: "No close yet for <company>" | NSE's file had no row for that company on an open day. | Type the close, or wait for the official one. |
| "Closes to 9 Oct 2026." and today is much later | The prices are behind. | Press **Fetch closes now**. |
| An idea shows "No result yet: waiting for a close." | There is no price yet. | Wait for the next morning's run. |
| A document card says "Queued. Starts within 15 minutes, sooner while this page is open." | It has not started. | Keep the Inbox tab open. |
| A document card says "Paused" and "Today's free AI allowance is used up ..." | A free daily limit. | Wait. It carries on by itself. |
| A document card says "Pages 142-147 could not be read." | Some pages failed. | Press **Try again**, then **Skip** or **Enter manually**. |
| A document stays on "Waiting" for hours | The reader is not running. | Open the Inbox tab and wait a few minutes. If it stays, tell Shlok. |
| Publish refused: "Publish stopped" card in "Needs you" ("N checks failed on <date>. Each flagged sentence has a note beside it.") | The gate refused. | Press **Open the gate notes**. Fix the flagged sentences and run the gate again. |
| Publish refused: "Rule 4: clear from <date>" | You have a recent entry on that company. | Wait until the date. |
| Publish refused: "The ledger shows a position in this company; the disclosure cannot say no." | The Ledger shows you hold it. | Change **Holds position**. |
| Publish refused: "Set "Figures to" in Details." | The file has dated figures and no **Figures to**. | Set it (section 4.4). |
| A capture appears as "Saved, but not filed as an item yet." | The filing step failed. | Press **File it now**. |
| Sign-in link does not work | Wrong browser, expired, used. | Section 2. |

---

## 7. For Shlok: running the site

This section is short. For depth see the runbook (`docs/runbooks/backup-and-restore.md`), `docs/progress.md`, and the architecture notes under `docs/architecture/`.

### Where it runs

| Part | Where | What it does |
|---|---|---|
| The app | Vercel (Hobby). Production: `https://aksh-research-desk.vercel.app` | Serves the public site and the private desk. A Vercel cron calls `/api/cron/daily` at 00:30 UTC (06:00 India). |
| Database, sign-in, files | Supabase (free) | Postgres, the email sign-in, and the private `documents` bucket. |
| Scheduled work | GitHub Actions | Three workflows, below. |

The daily cron runs independent steps, each writing its own heartbeat row: `heartbeat:daily`, `ledger:prices` (fetch NSE's closes), `ledger:score`, `ledger:anchor` (seal days; publish only if the public copy is on), then `ingestion:sweep`.

### The three workflows (`.github/workflows/`)

| Workflow | When | What |
|---|---|---|
| `ci.yml` | Every pull request, and every push to `main` | Three jobs. `app`: lint, typecheck, unit tests, build. `db`: start a local Supabase, reset it, run the database tests. `e2e`: the browser tests against a local Supabase. |
| `backup.yml` | Nightly at 21:00 UTC (02:30 India), and by hand | Dumps the hosted database (roles, schema, data), adds a manifest, encrypts the bundle with GPG (AES-256), uploads only the encrypted file as an artifact kept for 90 days. Needs repository secrets `SUPABASE_DB_URL` and `BACKUP_PASSPHRASE`. |
| `pump.yml` | Every 15 minutes, and by hand | POSTs `/api/jobs/run` with the bearer secret, which drains the document queue for up to about 240 s. Needs repository secrets `DESK_URL` and `CRON_SECRET`. GitHub disables schedules after 60 days without repository activity, so check that it is still enabled. |

### The database clock (the third 15-minute clock)

GitHub's schedule was not firing reliably and Vercel's free plan runs a cron only once a day, so the 15-minute pump also has a clock inside Supabase (pg_cron and pg_net, both free). A job called `desk-pump` runs at minutes 4, 19, 34 and 49 of every hour. Each time it makes a one-use ticket that is good for two minutes and posts it to your site at `/api/jobs/tick`; the site checks the ticket with the database and then runs the same steps as `/api/jobs/run`. No secret is stored in SQL. It does nothing until the site address is registered, and it registers itself: the first pump or daily run on the production site (for example the manual "Run workflow" of `pump.yml`) writes the line `clock:register` in the heartbeat log, `registered https://...`. Preview deploys and local runs write `not production` and register nothing. To check that the clock is ticking, open the Supabase SQL editor and run `select * from cron.job_run_details order by start_time desc limit 5;` (a row every 15 minutes, status `succeeded`), and `select status_code, created from net._http_response order by created desc limit 5;` (status 202 means the site accepted the ticket; 401 means it was too late or already used). If the site moves to a new address, the next production run re-registers it. `pump.yml` stays as a spare clock: if two clocks fire close together the queue's leases keep them from reading the same page twice.

### The health address and its six checks

`GET /api/health` is public and needs no secret. It answers 200 when everything is healthy and 500 when not, with ages in seconds and a pass or fail for each check. Point the uptime monitor at it. The six checks:

| Check | Healthy when |
|---|---|
| `heartbeat:pump` (the 15-minute pump) | Last ran within 2 hours and did not fail. |
| `heartbeat:daily` (the daily job) | Last ran within 36 hours and did not fail. |
| `ledger:prices` (the closing prices) | Never run yet, or last ran within 36 hours and did not fail. |
| `ledger:score` (the scores) | Same rule. |
| `ledger:anchor` (the public copy) | Same rule. |
| `queue` | No runnable document step has been waiting more than 6 hours. |

The three ledger checks are "never run is healthy", so a fresh deploy does not turn red before the first daily run. The desk's red strip uses the same rules and adds the failed run's own reason for the ledger steps.

### Turning on the alert email

The desk can email you once when something stops working, and once when it is fixed. It is off until you switch it on: on Vercel, Production, set `RESEND_API_KEY` (a key from resend.com/api-keys) and `ALERT_EMAIL` (the address that should get the emails; a comma-separated list also works), then redeploy. Until a domain is verified at Resend, `ALERT_EMAIL` must be your own Resend account address, because Resend delivers its test sender `onboarding@resend.dev` to that address only. Aksh is not emailed until a domain is verified (open question Q36). The step is called `alerts:email` and runs last in the 15-minute pump and in the daily job, so each clock also notices when the other has gone quiet. It writes a line in the heartbeat log each time: `no incident`, `opened incident 3, emailed`, `incident 3 still open`, `closed incident 3, emailed`, `email off: ...`, or the reason a send failed (a failed send is tried again on the next run). It is not one of the health checks, so a broken mailer shows only in that log. One incident gets one "needs a look" email and, after everything has been healthy for 30 minutes, one "all clear" email.

### The nightly backup and restore

The runbook is `docs/runbooks/backup-and-restore.md`. It covers: what runs, what to do when the nightly run fails, where the artifacts are (Actions, then "backup", then a run, then Artifacts), how to run one by hand, how to open one, how to restore into a new project, and a section called "Restoring the ledger (events must not be re-sealed)". That section matters: never replay ledger events through the app's functions. Restore with the dump in the order the runbook gives, then run `public.verify_ledger_chain()` and `public.verify_ledger_anchors()` and compare the counts with the manifest. Uploaded PDFs live in Supabase Storage and are NOT in the backup. The passphrase is in your password manager; without it the backups cannot be opened. Run a backup by hand before any risky change.

### How a release goes out

1. Work on a branch. Open a pull request into `main`. CI must be green (all three jobs).
2. **Database migrations go BEFORE the app deploy.** Take a manual backup first (Actions, "backup", Run workflow). Then run the migrations yourself with the project's pinned CLI: `pnpm db:push` (it runs `supabase db push`, version 2.119.0). Do a dry run first. Never use a global Supabase CLI. Reason: the app and the migrations are tied. For example, the public "Printed on p. N" line shows nothing if migration 0009 is missing, and an empty answer is cached for up to an hour.
3. Merge the pull request using "Create a merge commit" (not squash), so a risky commit stays revertable by itself. Vercel deploys `main`.
4. After the deploy: open the production site, open `/api/health`, then redeploy or revalidate the public tag if public pages looked stale.
5. If you added environment variables, set them on Vercel for Production and Preview.

**The steps you do by hand:** the migration push, the merge click, the Vercel environment variables, the GitHub repository secrets, and anything in the Supabase or Vercel dashboards. In past releases Claude Code was refused permission to push to production and to merge, so you ran those yourself.

**For this release:** as of the last progress note, the hosted database is at migration 0009. The ledger migrations are `20261013000010_ledger.sql`, `...011_market.sql`, `...012_scores.sql`, `...013_ledger_anchors.sql`, `...014_ledger_gate.sql`. All five must be applied before the app that uses them. The last of them changes the publish function (`publish_revision()`).

### Environment variables (names only)

Set on Vercel (Production and Preview). The template with notes is `.env.example`. Never commit `.env.local`, and never print values.

| Name | What it does |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | The site's address. Used in sign-in links. |
| `ADMIN_EMAIL` | The one email allowed into the desk. |
| `CRON_SECRET` | The bearer secret for the daily cron and the pump. Also a GitHub secret. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The browser's connection to Supabase. |
| `SUPABASE_SECRET_KEY` | Server-only key used by the background jobs. |
| `GROQ_API_KEY` | Turns AI reading on. Without it, AI reading is off. |
| `GROQ_MODEL_TEXT`, `GROQ_MODEL_VISION`, `GROQ_MODEL_CLASSIFY`, `GROQ_MODEL_WHISPER` | Optional model overrides. |
| `OCRSPACE_API_KEY` | Turns scan reading on. Unset means "Scan reading is off". |
| `VOICE_NOTES` | Set to `on` to switch voice notes on. Left unset on purpose. |
| `LLM_ADAPTER` | Local testing only (`fixture`). Never set it on Vercel. It is refused there. |
| `NSE_BHAVCOPY_URL_TEMPLATE`, `NSE_INDEX_URL_TEMPLATE` | Optional. Change only the path of NSE's files; the host is fixed in code. Leave empty. Do not set on Vercel. |
| `GITHUB_GIST_TOKEN`, `LEDGER_ANCHOR_GIST_ID` | Switch the public copy of the ledger's fingerprints on. Left unset on purpose. |
| `RESEND_API_KEY`, `ALERT_EMAIL`, `RESEND_FROM` | Switch the alert email on (see "Turning on the alert email"). Left unset, nothing is sent. `RESEND_FROM` is optional. |
| `YOUTUBE_API_KEY`, `YOUTUBE_CHANNEL_ID` | Switch video listing on (see "What is switched off on purpose"). Both are needed; one alone keeps it off. Left unset, nothing is read from YouTube. |
| `RESEND_LETTERS_KEY`, `LETTERS_FROM`, `LETTERS_SEGMENT_ID` | Switch letters on (see "What is switched off on purpose"). All three are needed; with any missing, nothing is emailed. The key is a separate Resend key from the alert one. Production only. |
| `DISTRIBUTION_ADAPTER` | Local testing only (`fixture`): stands in for YouTube and for the email service. Never set it on Vercel. It is refused there. |
| `GOOGLE_VISION_API_KEY`, `ANTHROPIC_API_KEY`, `RESEND_AUDIENCE_ID` | In the template for later phases. Not used by this version. |

### The first live day: two things to check

1. **What NSE answers on a market holiday.** The closes step treats only a 404 ("no file") as a day with no trading. If NSE answers a holiday with something else (a 403, say), no holiday will ever be marked shut, and the run will stop each day. The note in the build ledger reads "check one past holiday from the production host before the first live run." Do this the first time a holiday passes. Watch the `ledger:prices` heartbeat for that day. The desk shows it on the Ledger page under **Daily steps**, and on the Closes page as a day stuck at "Not decided yet".
2. **Whether NSE answers the Vercel server at all.** The two file addresses were only tested from a home connection (open question Q29). Press **Fetch closes now** on the Closes page from the live site (it runs prices, then scores) and read the result lines. Watch the first three mornings' `ledger:prices` heartbeats. **Fallback:** if NSE refuses the server, each day Aksh downloads the day's bhavcopy zip and the indices CSV and drops them on the Closes page. The scores work from those. Tell Aksh this plainly if it happens.

### What is switched off on purpose

- **Voice notes.** `VOICE_NOTES` is unset. The drop bar hides voice notes and nothing is sent to Groq. To switch on you need Aksh's agreement (ADR-004 s8), and the open item about discarded transcript text staying in the database (Q22, debt M-4) needs its migration first. Its planned number, 0010, has since been taken by the ledger, so it will have a later number. Then set `VOICE_NOTES=on`.
- **The public copy of the ledger's daily fingerprints.** `GITHUB_GIST_TOKEN` and `LEDGER_ANCHOR_GIST_ID` are unset. Days are still sealed in the database and wait. To switch on you need the owner decision (Q26: which GitHub account owns the gist), a public gist created by hand, and a fine-grained token with only the "Gists: write" permission. The file is public and shows the number of entries per day and their fingerprints (no names, words or prices). Do not put either value on Vercel until the owner has agreed. **Once any line is published, switching it off again turns the `ledger:anchor` step red** ("the public copy is switched off, but lines were published before"). The file is dated by GitHub. Its owner can still edit or delete it. The run compares the whole public file with every sealed line each day.
- **Case studies from the ledger, and their chart.** Two rows in `private.settings`, `ledger_reveal` and `ledger_chart`, both absent (off). You turn them on in the Supabase SQL editor; the runbook `docs/runbooks/case-study-switches.md` has the exact SQL, what turning off does not do (it does not take a page down), and the checks to run before the first switch-on on the hosted project. Until Q27 is answered they stay off. Migrations 0017, 0018 and 0019 and the merge must land together, because every publish is refused in between.
- **Videos.** `YOUTUBE_API_KEY` and `YOUTUBE_CHANNEL_ID` are unset, so the desk reads nothing from YouTube and no video can be listed (a video publish is refused for want of YouTube facts). To switch on, only if Aksh will list videos: first push migrations 0022 and 0023 and merge the videos pull request back to back (between the two every publish is refused, because the app sends one policy version and the database wants the next). Then create a Google Cloud API key restricted to "YouTube Data API v3", set both variables on Vercel Production, and redeploy. Aksh's channel id is the `UC...` code that YouTube Studio shows under Settings, Channel, Advanced settings. The desk only reads; it never writes to YouTube. YouTube's developer policy lets data fetched with a key be kept for at most 30 days, so the daily check re-reads every video and deletes any YouTube data older than 30 days, also if the key is removed (Q51, built). Open questions Q47 (the gate sentences) and Q49 (answered: no allowance for a spoken performance claim) are the ones that still need Shlok's yes before the key is set.
- **Letters (email).** `RESEND_LETTERS_KEY`, `LETTERS_FROM` and `LETTERS_SEGMENT_ID` are unset, so the desk says "Email is not set up yet. Letters still publish to the archive.", the sign-up form cannot be opened, and no confirmation email or letter can be sent. Nothing is emailed from a test, a preview copy or a dev machine either (the local test runs use a stand-in that only keeps a file). To switch on, in this order (Q9, Q36, Q42): buy a domain and verify it in Resend (DNS records at the registrar); create a sender such as `letters@<domain>`, with open and click tracking switched OFF for the domain; create a segment and copy its id; create a full-access Resend key for letters (not the alert key); first run a hosted dry run (it must list exactly migrations 0024 and 0025), push them and merge the letters pull request together; then set the three variables on Vercel Production only and redeploy. Then press **Open sign-ups** on the Readers page. Open answers that you decide with Aksh: Q41 (a contact address for complaints in the notice; confirmation emails by hand is the default) and Q45 (no postal address in the footer is the default).
- **The pump workflow** needs `DESK_URL` and `CRON_SECRET` repository secrets to run. The last progress note says it was enabled on 14 October.

### Before the first real idea (read this before Aksh records anything)

- **No test ideas on the live site, ever.** An entry can never be removed. A withdrawn test idea stays in the chain and on the screen for good, and so does every note added to it. Try things on the local stack, not on the live site. Tell Aksh the same.
- **The public copy is off in this release.** While the public copy is off, the ledger is checked only against itself, so an owner with database access could change it without that being detectable from outside. Every idea recorded before the public copy is switched on can only ever be publicly dated to the day it is switched on. (The full note is the addendum at the end of `docs/architecture/ADR-005-ledger-integrity-and-price-source.md`.) Switching it on later is one-way and needs Q26 and Q35 settled first.
- **The first idea can wait up to three daily runs for its entry price.** Each daily run stores two trading dates, oldest first, and after the first idea the run first stores the days before it (closes no idea can use) and only then the entry day. Pressing **Fetch closes now** on the Closes page brings it forward; press it up to three times and read the result line.
- Publish any waiting revision of a public company file before recording an idea on that company: an idea on a company holds back new revisions of its file for 30 India days.

### Known open questions

They are in `docs/project-memory/unanswered-questions.md`. Do not copy them here. The ones that bear on go-live: Q22 (discarded transcript text, before voice notes), Q23, Q24 and Q25 (wording and one commit to keep or revert), Q26 (the gist owner), Q27 and Q28 (legal readings of the case-study and rule-4 rules), Q29 (does NSE answer Vercel), and Q35 (a rare overlap of two public-copy runs). Much of the Ledger wording is marked in the specs as "pending Shlok's approval".

---

## 8. Not in this version

- A public reading log, a public month page, and public links between concepts. These stay on the desk. A concept can be shown; a read cannot.
- A picture of how your concepts connect, joining two concepts into one, and renaming a concept.
- A public view of the Ledger, or any figure for how your ideas did. A closed idea can be written up as a case study (section 4.9) once the site owner has switched case studies on; the page prints no result.
- The spreadsheet valuation page (reading a model from a spreadsheet).
- A letter written for you, or sent on a schedule. Letters are made and sent only when you press (section 4.13).
- Reading a video's speech by machine. A video's transcript comes only from the caption file you download in YouTube Studio (section 4.12). Poor automatic captions have to be fixed in Studio first.
- A PDF made on the site's own server. **Save as PDF** uses the browser's print window, so the result differs a little from one browser to the next (section 4.11).
- Logins for clients or readers. Only you sign in.
- Voice notes (switched off).
- The public copy of the Ledger's fingerprints (switched off).
- Charts, exports and a mistakes grid on the journal page. It is a list.
- Editing or removing a corporate action. You correct it with a new entry.
- Linking an existing idea to a company file after the fact.

---

## 9. To verify before sharing

Each of these is something I could not confirm from the code, the specs or the tests I read. Please check them, or leave them out of what you send Aksh.

1. **How long a sign-in link lasts.** The local test settings say one hour. I could not see the hosted project's setting. Section 2 gives no time.
2. **Exactly which close is the entry price.** The screens say "the next close", and the example shows an idea recorded on one day getting an entry "close of 14 Oct". I did not confirm what happens when you save during market hours on a trading day versus after the close. Section 4.6 says only "the next close".
3. **The uptime monitor.** The red strip prints "The uptime monitor has emailed Shlok and Aksh." The progress notes say the external monitor (to poll `/api/health` and send those emails) was unverified. Confirm that a monitor is set up, or change the strip's wording. Section 6 does not promise emails.
4. **The ledger migrations are applied to the hosted database.** The last status I could read said the hosted database was at migration 0009 and the ledger migrations (0010 to 0014) were local. Confirm before go-live, and that the ledger code is on `main`.
5. **Wording pending approval.** The specs mark much of the Ledger, Closes and journal wording, and the public "Printed on p. N ..." line, as pending Shlok's approval. The guide quotes the code as it is today.
6. **The Ledger check runs when the page loads.** The unreadable-check message says "Reload to try again", which suggests it runs on each load. I did not read the code path to confirm.
7. **The exact withdraw window.** The page shows the time. The rules say at most 24 hours; the code mirrors a database function I did not read. Section 4.6 says "at most 24 hours; the form shows the exact time".
8. **Whether the Items "Create item" form can attach a company.** It has only Kind and Title. Section 4.4 sends you to a capture or the review screen to start a company file.
9. **The exact buttons for a few small screens** I read only through their code: the filed-figures tick boxes on the review screen (I describe them as ticks, by the "Tick at least one figure to file." message), the label of the save button on the "Type the value from the page" form, and the phone layout of the file page. I did not run the site.
10. **The public Mistakes page.** It now fills from published case studies (section 4.9). That is confirmed on the local stack only, with an invented company; nothing is public on the hosted site.
11. **Whether the production site is open to everyone today.** The last progress note says the production address is reachable without a Vercel bypass, so the public side is already visible. Confirm that is what you want on launch day.
12. **Videos against the real YouTube.** Everything in section 4.12 was tried on the local copy of the site with a stand-in for YouTube. No real YouTube address has been asked yet (the key is unset). The Studio menu names (Content, Subtitles, Download, .vtt or .srt) come from the desk's own message and from memory of Studio; check them once in Studio. The channel id's place in Studio is also from memory.
13. **Letters against the real Resend.** Section 4.13 was tried only on the local copy with a stand-in for the email service. No real email has been sent, no real Resend address has been asked, and the exact place of the Resend settings (tracking off, the segment id) is from the specification and memory; check them in the Resend dashboard once before the first real send. The wording of the notice and the confirmation email is pending Shlok's and Aksh's approval.
14. **Legal confirmation.** The publishing rules say they are not legal advice and should be confirmed with a lawyer or NISM-certified analyst. The official SEBI circular PDFs are still to be saved under `docs/compliance/`.
