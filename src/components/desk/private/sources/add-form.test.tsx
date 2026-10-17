// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { errorText } from "@/lib/messages";
import { AddForm } from "./add-form";

const companies = [{ id: "c1", label: "Kaveri Pumps", hint: "KAVPUMP" }];
const concepts = [{ id: "t1", label: "Moats", hint: null }];
const fields = (fd: FormData) => ({ url: fd.get("url"), note: fd.get("note"), companyId: fd.getAll("companyId"), themeId: fd.getAll("themeId") });

describe("the add-a-source form", () => {
  it("has the link, his note, the pickers and one button, each with a visible label", () => {
    render(<AddForm action={vi.fn()} companies={companies} concepts={concepts} />);
    expect(screen.getByRole("textbox", { name: "Link" })).toBeRequired();
    expect(screen.getByRole("textbox", { name: "My note" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Find a company" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Find a concept" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save source" })).toBeInTheDocument();
  });

  it("sends the link, his note and the attachments under the names the action reads, and shows the receipt", async () => {
    const action = vi.fn(async () => ({ ok: true as const, id: "s1", answer: "Source saved. Reading its title." }));
    render(<AddForm action={action} companies={companies} concepts={concepts} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Link" }), "https://youtu.be/abcdefghijk");
    await userEvent.type(screen.getByRole("textbox", { name: "My note" }), "why the bull case is thin");
    await userEvent.type(screen.getByRole("textbox", { name: "Find a company" }), "kav{Enter}");
    await userEvent.type(screen.getByRole("textbox", { name: "Find a concept" }), "moa{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "Save source" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(fields((action.mock.calls[0] as unknown as [FormData])[0])).toEqual({ url: "https://youtu.be/abcdefghijk", note: "why the bull case is thin", companyId: ["c1"], themeId: ["t1"] });
    expect(await screen.findByRole("status")).toHaveTextContent("Source saved. Reading its title.");
    // The form is empty again for the next link.
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Link" })).toHaveValue(""));
  });

  it("says what it found when the link was saved before", async () => {
    const answer = "You saved this link on 3 Oct 2026. Your note was added to it.";
    render(<AddForm action={async () => ({ ok: true as const, id: "s1", answer })} companies={[]} concepts={[]} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Link" }), "https://youtu.be/abcdefghijk");
    await userEvent.click(screen.getByRole("button", { name: "Save source" }));
    expect(await screen.findByRole("status")).toHaveTextContent(answer);
  });

  it("shows a refusal in its fixed words, keeps what he typed and offers no second sentence of the machine's", async () => {
    render(<AddForm action={async () => ({ ok: false as const, error: "source-no-link" as const })} companies={[]} concepts={[]} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Link" }), "not a link");
    await userEvent.click(screen.getByRole("button", { name: "Save source" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(errorText("source-no-link")!);
    expect(screen.getByRole("textbox", { name: "Link" })).toHaveValue("not a link");
  });

  it("limits the pickers to 5 companies and 8 concepts, as the database does", () => {
    render(<AddForm action={vi.fn()} companies={companies} concepts={concepts} />);
    expect(screen.getByText("0 of 5")).toBeInTheDocument();
    expect(screen.getByText("0 of 8")).toBeInTheDocument();
  });
});
