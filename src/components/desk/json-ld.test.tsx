import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { JsonLd } from "./json-ld";

const scripts = (html: string) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);

describe("JsonLd", () => {
  it("renders one script that parses back to the value, whatever a title says", () => {
    const data = [{ "@type": "Article", headline: "</script><script>alert(1)</script> & more" }];
    const html = renderToStaticMarkup(<JsonLd data={data} />);
    expect(scripts(html)).toHaveLength(1);
    expect(html.match(/<script/g)).toHaveLength(1);
    expect(JSON.parse(scripts(html)[0])).toEqual(data);
  });

  it("renders nothing for a page with no structured data", () => {
    expect(renderToStaticMarkup(<JsonLd data={[]} />)).toBe("");
  });
});
