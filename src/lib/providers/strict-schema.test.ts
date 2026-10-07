import { describe, expect, it } from "vitest";
import { z } from "zod";
import { strictJsonSchema } from "./strict-schema";

type Json = Record<string, unknown>;

const schema = z.object({
  label: z.string().min(1).max(200).nullable(),
  kind: z.enum(["income", "balance", "other"]),
  basis: z.enum(["consolidated", "standalone"]).nullable(),
  url: z.url(),
  rows: z
    .array(
      z.object({
        name: z.string().regex(/^[A-Z]/).max(80),
        value: z.number().nullable(),
        // A property NAMED like a stripped keyword must survive (only keywords are removed).
        format: z.string(),
      }),
    )
    .min(1)
    .max(40),
});

/** Every object node in the tree, with its path. */
function objects(node: unknown, path = "$", out: [string, Json][] = []): [string, Json][] {
  if (Array.isArray(node)) node.forEach((n, i) => objects(n, `${path}[${i}]`, out));
  else if (node && typeof node === "object") {
    const o = node as Json;
    if (o.type === "object" || (Array.isArray(o.type) && o.type.includes("object"))) out.push([path, o]);
    for (const [k, v] of Object.entries(o)) objects(v, `${path}.${k}`, out);
  }
  return out;
}

describe("strictJsonSchema (Groq strict mode, structured-outputs docs)", () => {
  const out = strictJsonSchema(schema) as Json;
  const props = out.properties as Record<string, Json>;
  const row = (props.rows.items as Json).properties as Record<string, Json>;

  it("drops $schema", () => {
    expect(out).not.toHaveProperty("$schema");
  });

  it("closes every object and requires all of its properties", () => {
    const found = objects(out);
    expect(found.length).toBe(2);
    for (const [, o] of found) {
      expect(o.additionalProperties).toBe(false);
      expect(o.required).toEqual(Object.keys(o.properties as Json));
    }
  });

  it("writes nullable fields as a type array, keeping enums with null", () => {
    expect(props.label).toEqual({ type: ["string", "null"] });
    expect(row.value).toEqual({ type: ["number", "null"] });
    expect(props.basis).toEqual({ type: ["string", "null"], enum: ["consolidated", "standalone", null] });
    expect(props.kind).toEqual({ type: "string", enum: ["income", "balance", "other"] });
  });

  it("removes limits strict mode does not document (enforced by Zod after parsing)", () => {
    const text = JSON.stringify(out);
    for (const key of ["minItems", "maxItems", "minLength", "maxLength", "pattern"]) expect(text).not.toContain(`"${key}"`);
    expect(props.url).toEqual({ type: "string" });
    expect(row.format).toEqual({ type: "string" });
  });

  it("removes the minimum and maximum zod writes for an integer, keeping the type (Task 9 carry)", () => {
    const ints = strictJsonSchema(z.object({ n: z.number().int(), m: z.number().int().min(1).max(5).nullable(), minimum: z.string() })) as Json;
    const p = ints.properties as Record<string, Json>;
    expect(p.n).toEqual({ type: "integer" });
    expect(p.m).toEqual({ type: ["integer", "null"] });
    expect(p.minimum).toEqual({ type: "string" }); // a property NAMED minimum survives
    expect(JSON.stringify(ints)).not.toMatch(/"(?:minimum|maximum|exclusiveMinimum|exclusiveMaximum)":-?\d/);
  });

  it("does not change the Zod schema it was given", () => {
    expect(schema.safeParse({ label: null, kind: "other", basis: null, url: "https://x.in", rows: [] }).success).toBe(false);
  });
});
