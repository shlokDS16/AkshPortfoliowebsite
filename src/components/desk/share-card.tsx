import { formatDate } from "@/lib/format";
import { OG } from "@/lib/theme-colors";
import type { ShareCardModel } from "@/modules/showcase";

export type ShareCardContent = { tag: string; number: string; sub: string; title: string; standfirst: string; footerLeft: string; footerRight: string };

/** Rule 8: the card's text is the file's linted fields (company name, learning objective) plus fixed copy and dates. */
export function fileCardContent(m: ShareCardModel): ShareCardContent {
  return {
    tag: "FILE",
    number: m.fileNo,
    sub: `R${m.revNo}`,
    title: m.company,
    standfirst: m.learningObjective,
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

/**
 * design-dna 15, light theme fixed, 1200 x 630. Flex and inline styles only (Satori). The 46 px notch is a paper
 * triangle drawn with borders, so the card does not depend on clip-path support in the Satori that Next bundles.
 */
export function ShareCardImage({ c }: { c: ShareCardContent }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", background: OG.paper, fontFamily: "Plex Sans" }}>
      <div style={{ position: "relative", width: 270, height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "58px 32px", background: OG.geru, color: OG.onGeru }}>
        <div style={{ position: "absolute", top: 0, right: 0, width: 0, height: 0, borderTop: `46px solid ${OG.paper}`, borderLeft: "46px solid transparent" }} />
        <div style={{ display: "flex", fontFamily: "Plex Mono", fontSize: 23, letterSpacing: 2 }}>{c.tag}</div>
        <div style={{ display: "flex", fontSize: 150, fontWeight: 600, lineHeight: 1 }}>{c.number}</div>
        <div style={{ display: "flex", fontFamily: "Plex Mono", fontSize: 23 }}>{c.sub}</div>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "58px 66px" }}>
        <div style={{ display: "flex", fontSize: 30 }}>
          <span style={{ fontWeight: 600, color: OG.ink }}>Aksh Agrawal</span>
          <span style={{ marginLeft: 12, color: OG.inkMuted }}>Case files</span>
        </div>
        <div style={{ display: "flex", marginTop: 40, fontSize: 78, fontWeight: 600, lineHeight: 1.04, color: OG.ink }}>{c.title}</div>
        <div style={{ display: "flex", marginTop: 24, fontSize: 30, lineHeight: 1.38, color: OG.inkBody }}>{c.standfirst}</div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "auto", paddingTop: 20, borderTop: `1px solid ${OG.ruleStrong}`, fontSize: 21 }}>
          <span style={{ color: OG.inkMuted }}>{c.footerLeft}</span>
          <span style={{ color: OG.ink }}>{c.footerRight}</span>
        </div>
      </div>
    </div>
  );
}
