# Turning on videos and letters

Both are built and live, and both are OFF until the settings below are set on Vercel. Nothing is read from YouTube and nothing
is emailed before that. Set values only in the Vercel dashboard, never in chat, a commit or a file in the repo.

Where settings go: Vercel > project `aksh-research-desk` > Settings > Environment Variables. Add each one for **Production** (and
Preview where noted), then Deployments > the latest production deployment > Redeploy, so the new values take effect.

## Videos (optional, any time)

**What the key can do.** A YouTube Data API key reads public and unlisted video details (title, length, channel). It cannot read
private videos, cannot upload or change anything, and does not open your Google account to anyone. The desk only accepts videos
whose channel matches `YOUTUBE_CHANNEL_ID`, so it works for Aksh's channel only, even though the key itself could read any public
video. Making the key with your own Google account is fine: it is a project key, not your password; its free quota (10,000 units a
day, about one unit per video read) counts against your Google Cloud project; no billing account is needed. If Aksh later wants
it under his own account, he makes a new key and you replace the value.

**Get the key**
1. Open https://console.cloud.google.com and sign in. Create a project (top bar > project picker > New project), e.g. `aksh-desk`.
2. APIs & Services > Library > search "YouTube Data API v3" > Enable.
3. APIs & Services > Credentials > Create credentials > API key. Copy it.
4. Edit the key: under "API restrictions" choose "Restrict key" and tick only "YouTube Data API v3". Leave "Application
   restrictions" at None (the calls come from Vercel's servers, whose addresses change). Save.

**Get the channel id**
1. Sign in to YouTube with the account that owns Aksh's channel.
2. Open https://www.youtube.com/account_advanced and copy "Channel ID" (starts with `UC`, 24 characters).

**Set them:** `YOUTUBE_API_KEY` and `YOUTUBE_CHANNEL_ID` on Production and Preview, then Redeploy.

**How Aksh publishes a video:** upload it to YouTube as **Unlisted** (the key cannot see Private videos) and do not share the link
until the desk has published it. In YouTube Studio download the subtitles file for the video and give it to the desk; guide
section on videos in `docs/guide/using-the-desk.md`.

## Letters and newsletter sign-ups (after a domain is bought)

A sign-up only counts once the reader confirms by email, and the desk cannot send that email without a verified domain. So
sign-ups stay closed until all of this is done.

1. **Buy a domain** (about Rs 700-1,000 a year for a `.in`), e.g. at Cloudflare Registrar, Namecheap or GoDaddy.
2. **Optional:** add it to Vercel (project > Settings > Domains) so the site lives at the domain.
3. **Verify it at Resend:** https://resend.com/domains > Add domain > copy the DNS records it shows (SPF, DKIM, the return-path
   MX) into the registrar's DNS page > Verify. It can take up to a few hours.
4. **Create a segment** at Resend (Audience > Segments), e.g. "Letters". Copy its id.
5. **Create a full-access key** at https://resend.com/api-keys, separate from the existing sending-only alert key.
6. **Set on Vercel, Production only:**
   - `RESEND_LETTERS_KEY` = the new key
   - `LETTERS_FROM` = `Aksh Agrawal <letters@your-domain>`
   - `LETTERS_SEGMENT_ID` = the segment id
   - `LETTERS_GRIEVANCE_EMAIL` = `contact@your-domain` (printed on the sign-up notice; set up forwarding to Aksh's inbox at the
     registrar or with Cloudflare Email Routing, both free)
   Then Redeploy.
7. **In the desk:** Letters > send yourself the self-test, then turn sign-ups on. Readers confirm by email after Aksh presses
   "Send confirmation emails"; a letter goes out only when he presses Send and confirms the count.

Never set the letters values on Preview: test sends stay on the fixture outbox.
