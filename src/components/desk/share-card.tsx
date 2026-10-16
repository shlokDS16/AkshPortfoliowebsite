import { formatDate } from "@/lib/format";
import { OG } from "@/lib/theme-colors";
import { cutWords, OBJECTIVE_BUDGET, TITLE_BUDGET, type ShareCardContent, type ShareCardModel } from "@/modules/showcase";

export type { ShareCardContent };

/** Rule 8: the card's text is the file's linted fields (company name, learning objective) plus fixed copy and dates, cut to the same slot budgets as the other cards (spec s4.4). */
export function fileCardContent(m: ShareCardModel): ShareCardContent {
  return {
    tag: "FILE",
    number: m.fileNo,
    sub: `R${m.revNo}`,
    title: cutWords(m.company, TITLE_BUDGET),
    standfirst: cutWords(m.learningObjective, OBJECTIVE_BUDGET),
    footerLeft: `Revised ${formatDate(m.revisedOn)} · figures to ${formatDate(m.dataAsOf)}`,
    footerRight: "For learning, not advice",
  };
}

export const HOME_CARD: ShareCardContent = {
  tag: "CASE",
  number: "AA",
  sub: "FILES",
  title: "Case files",
  standfirst: "Each file says what Aksh expected, what would prove him wrong, and every revision since.",
  footerLeft: "Indian listed companies · figures 30+ days old",
  footerRight: "For learning, not advice",
};

/** The main column is about 800 px wide: a title past 36 characters would take three lines at 78 px, so it steps down. */
const titleSize = (title: string) => (Array.from(title).length <= 36 ? 78 : Array.from(title).length <= 50 ? 60 : 48);

/**
 * design-dna 15, light theme fixed, 1200 x 630. Flex and inline styles only (Satori). The 46 px notch is a paper
 * triangle drawn with borders, so the card does not depend on clip-path support in the Satori that Next bundles.
 */
export function ShareCardImage({ c }: { c: ShareCardContent }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", background: OG.paper, fontFamily: "Plex Sans" }}>
      <div style={{ position: "relative", width: 270, height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "58px 32px", background: OG.geru, color: OG.onGeru }}>
        <div style={{ position: "absolute", top: 0, right: 0, width: 0, height: 0, borderTop: `46px solid ${OG.paper}`, borderLeft: "46px solid transparent" }} />
        <div style={{ display: "flex", fontFamily: "Plex Mono", fontSize: 23, letterSpacing: 2, textTransform: "uppercase" }}>{c.tag}</div>
        <div style={{ display: "flex", fontSize: 150, fontWeight: 600, lineHeight: 1 }}>{c.number}</div>
        <div style={{ display: "flex", fontFamily: "Plex Mono", fontSize: 23 }}>{c.sub}</div>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "58px 66px" }}>
        <div style={{ display: "flex", fontSize: 30 }}>
          <span style={{ fontWeight: 600, color: OG.ink }}>Aksh Agrawal</span>
          <span style={{ marginLeft: 12, color: OG.inkMuted }}>Case files</span>
        </div>
        {c.kicker ? <div style={{ display: "flex", marginTop: 34, fontSize: 28, color: OG.inkMuted }}>{c.kicker}</div> : null}
        <div style={{ display: "flex", marginTop: c.kicker ? 8 : 40, fontSize: titleSize(c.title), fontWeight: 600, lineHeight: 1.04, color: OG.ink }}>{c.title}</div>
        <div style={{ display: "flex", marginTop: 24, fontSize: 30, lineHeight: 1.38, color: OG.inkBody }}>{c.standfirst}</div>
        {c.aside ? <div style={{ display: "flex", marginTop: 14, fontSize: 24, color: OG.inkMuted }}>{c.aside}</div> : null}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "auto", paddingTop: 20, borderTop: `1px solid ${OG.ruleStrong}`, fontSize: 21 }}>
          <span style={{ color: OG.inkMuted }}>{c.footerLeft}</span>
          <span style={{ color: OG.ink }}>{c.footerRight}</span>
        </div>
      </div>
    </div>
  );
}
