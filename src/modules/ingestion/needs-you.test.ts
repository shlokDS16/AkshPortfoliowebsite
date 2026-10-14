import { describe, expect, it } from "vitest";
import { doc, view } from "@/test/inbox-fixtures";
import { needsYouFrom } from "./needs-you";

describe("documents on the desk home's Needs you tray", () => {
  const ready = doc({ title: "Kaveri AR", pending: 24, view: view("ready", "24 figures ready to check.") });
  const quiet = doc({ title: "Notice", view: view("ready", "Read. No figures matched; open it beside your file.") });
  const stuck = doc({ title: "Sahyadri AR", view: view("attention", "Pages 142-147 could not be read.", { attentionPages: [142, 143, 144, 145, 146, 147] }) });
  const wholePdf = doc({ title: "Locked", view: view("attention", "This PDF could not be opened (it may be password-protected or damaged).") });
  const reading = doc({ title: "Busy", view: view("reading", "Reading page 88 of 312") });
  const done = doc({ title: "Old", status: "done", pending: 3, view: view("finished", "Done with this document.") });

  it("lists a ready document that has figures and any document with a step that needs attention, in order", () => {
    expect(needsYouFrom([reading, ready, stuck, quiet, wholePdf, done]).map((d) => [d.title, d.kind])).toEqual([
      ["Kaveri AR", "ready"], ["Sahyadri AR", "attention"], ["Locked", "attention"],
    ]);
  });

  it("carries the card's words and where it leads", () => {
    const [first, second, third] = needsYouFrom([ready, stuck, wholePdf]);
    expect(first).toMatchObject({ message: "24 figures ready to check.", href: `/desk/inbox/${ready.id}/review` });
    expect(second).toMatchObject({ message: "Pages 142-147 could not be read.", pagesUnread: true, href: `/desk/inbox#doc-${stuck.id}` });
    expect(third).toMatchObject({ pagesUnread: false });
  });

  it("counts figures the way the inbox does: its pending count already leaves out the repeats of a consolidated line", () => {
    expect(needsYouFrom([doc({ title: "Repeats only", pending: 0, view: view("ready", "Read. No figures matched; open it beside your file.") })])).toEqual([]);
  });
});
