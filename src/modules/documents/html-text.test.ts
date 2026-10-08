import { describe, expect, it } from "vitest";
import { htmlToText } from "./html-text";

describe("htmlToText: the visible text of a page", () => {
  it("drops script, style and the other things that are not text, with everything inside them", () => {
    const html = `<html><head><title>Results</title><style>p { color: red }</style><script>var x = "<p>not text</p>";</script></head>
      <body><noscript>Enable JS</noscript><p>Visible</p><SCRIPT type="x">alert(1)</SCRIPT><template><p>hidden</p></template><svg><text>icon</text></svg></body></html>`;
    expect(htmlToText(html).text).toBe("Visible");
  });

  it("drops comments, doctype and processing instructions", () => {
    expect(htmlToText("<!DOCTYPE html><!-- a <b>note</b> --><p>Text</p><?xml version='1.0'?>").text).toBe("Text");
  });

  it("keeps block structure as lines and a table row as one line with its cells separated by a space", () => {
    const html = `<h1>Statement of Profit and Loss</h1><table><tr><th>Particulars</th><th>FY26</th><th>FY25</th></tr>
      <tr><td>Revenue from operations</td><td>1,284.00</td><td>1,102.00</td></tr><tr><td>Finance costs</td><td>41.20</td><td>38.90</td></tr></table>
      <p>First<br>second</p><ul><li>one</li><li>two</li></ul>`;
    expect(htmlToText(html).text).toBe(
      ["Statement of Profit and Loss", "Particulars FY26 FY25", "Revenue from operations 1,284.00 1,102.00", "Finance costs 41.20 38.90", "First", "second", "one", "two"].join("\n"),
    );
  });

  it("keeps inline tags inside a sentence", () => {
    expect(htmlToText("<p>Profit <b>rose</b> by <a href='x'>12</a>%.</p>").text).toBe("Profit rose by 12%.");
  });

  it("decodes named, decimal and hex entities, once, and leaves unknown ones as written", () => {
    expect(htmlToText("<p>A &amp; B &lt;c&gt; &quot;d&quot; &#39;e&#39; &apos;f&apos;&nbsp;g &#x20B9;100 &rupee; &mdash; &ndash; &hellip; &copy;</p>").text).toBe(
      "A & B <c> \"d\" 'e' 'f' g ₹100 &rupee; — – … ©",
    );
    // &amp;lt; is the text "&lt;", not "<": decoded once.
    expect(htmlToText("<p>&amp;lt;</p>").text).toBe("&lt;");
  });

  it("does not turn an escaped tag into a tag", () => {
    expect(htmlToText("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>").text).toBe("<script>alert(1)</script>");
  });

  it("leaves nonsense numeric entities as written instead of producing control characters", () => {
    expect(htmlToText("<p>a&#0;b&#1114112;c&#xD800;d&#x1F600;e</p>").text).toBe("a&#0;b&#1114112;c&#xD800;d\u{1F600}e");
  });

  it("treats a lone < as text, and attributes with > inside quotes as part of the tag", () => {
    expect(htmlToText("<p>1 < 2 and <a title='a>b'>link</a></p>").text).toBe("1 < 2 and link");
  });

  it("collapses runs of spaces, removes blank lines, trims lines, and removes NUL", () => {
    expect(htmlToText("<p>  a \t b  </p>\n\n\n\n<p>c\u0000d</p>").text).toBe("a b\ncd");
  });

  it("returns the title separately, decoded and trimmed", () => {
    expect(htmlToText("<head><title> Q2 &amp; H1 Results \n</title></head><p>x</p>")).toEqual({ title: "Q2 & H1 Results", text: "x" });
    expect(htmlToText("<p>x</p>").title).toBeNull();
  });

  it("an unclosed script or comment swallows the rest, as a browser does, and stays fast on hostile input", () => {
    expect(htmlToText("<p>keep</p><script>never closed <p>gone</p>").text).toBe("keep");
    expect(htmlToText("<p>keep</p><!-- never closed <p>gone</p>").text).toBe("keep");
    const hostile = "<script ".repeat(200_000);
    const started = Date.now();
    htmlToText(hostile);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("reads text with no tags as it is", () => {
    expect(htmlToText("just words").text).toBe("just words");
  });

  it("returns nothing for a page with no text", () => {
    expect(htmlToText("<html><body><img src='a.png'><script>1</script></body></html>").text).toBe("");
  });
});
