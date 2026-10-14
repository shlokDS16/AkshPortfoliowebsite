import { z } from "zod";

// Zod -> the JSON Schema Groq's strict mode accepts (https://console.groq.com/docs/structured-outputs, checked
// 2026-10-07): every object closes (`additionalProperties: false`) and requires all its properties; a nullable
// field is a type array (`["string", "null"]`). Length, count, pattern and format limits are not documented for
// strict mode, so they are removed here and enforced by the Zod parse that follows every answer. That includes the
// minimum and maximum Zod writes for every integer (the safe-integer range): an integer field keeps its type only.

type Node = Record<string, unknown>;

const DROPPED = ["minItems", "maxItems", "minLength", "maxLength", "pattern", "format", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum"] as const;
/** Keys whose value is one subschema, a list of them, or a name -> subschema map. Nothing else is a schema. */
const ONE = ["items", "additionalProperties", "not"] as const;
const MANY = ["anyOf", "oneOf", "allOf", "prefixItems"] as const;
const MAP = ["properties", "$defs", "definitions"] as const;

const isNode = (v: unknown): v is Node => typeof v === "object" && v !== null && !Array.isArray(v);

/** `anyOf: [X, { type: "null" }]` with a single-typed X becomes X with `type: [X.type, "null"]`. */
function foldNullable(node: Node): Node {
  const options = node.anyOf;
  if (!Array.isArray(options) || options.length !== 2) return node;
  const nullAt = options.findIndex((o) => isNode(o) && o.type === "null" && Object.keys(o).length === 1);
  const other = options[1 - nullAt];
  if (nullAt === -1 || !isNode(other) || typeof other.type !== "string") return node;
  const folded: Node = { ...node, ...other, type: [other.type, "null"] };
  delete folded.anyOf;
  if (Array.isArray(other.enum)) folded.enum = [...other.enum, null];
  return folded;
}

function tighten(input: Node): Node {
  const node = foldNullable(input);
  const out: Node = {};
  for (const [key, value] of Object.entries(node)) {
    if ((DROPPED as readonly string[]).includes(key)) continue;
    if ((ONE as readonly string[]).includes(key) && isNode(value)) out[key] = tighten(value);
    else if ((MANY as readonly string[]).includes(key) && Array.isArray(value)) out[key] = value.map((v) => (isNode(v) ? tighten(v) : v));
    else if ((MAP as readonly string[]).includes(key) && isNode(value)) {
      out[key] = Object.fromEntries(Object.entries(value).map(([name, v]) => [name, isNode(v) ? tighten(v) : v]));
    } else out[key] = value;
  }
  if (isNode(out.properties)) {
    out.additionalProperties = false;
    out.required = Object.keys(out.properties);
  }
  return out;
}

export function strictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = { ...(z.toJSONSchema(schema) as Node) };
  delete json.$schema;
  return tighten(json);
}
