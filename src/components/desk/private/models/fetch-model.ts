import type { ModelObject } from "@/modules/valuation/client";

// Fetches the model object through the 10-minute link modelUrlAction signs (the only way the page reaches it; spec s7.4). Used by "Add a
// cell" on the main thread and by the calculator's worker. The object is the server's own output; the shape is still checked before use.

export class ModelFetchError extends Error {
  constructor() {
    super("model object not loaded");
    this.name = "ModelFetchError";
  }
}

function isModel(x: unknown): x is ModelObject {
  const m = x as Partial<ModelObject> | null;
  return typeof m === "object" && m !== null && m.modelVersion === 1 && Array.isArray(m.index?.sheets) && Array.isArray(m.taint) && typeof m.engineBytes === "string";
}

export async function fetchModel(url: string): Promise<ModelObject> {
  let body: unknown;
  try {
    const response = await fetch(url, { cache: "no-store", credentials: "omit" });
    if (!response.ok) throw new ModelFetchError();
    body = await response.json();
  } catch {
    throw new ModelFetchError();
  }
  if (!isModel(body)) throw new ModelFetchError();
  return body;
}

/** The engine bytes the server stored as base64. */
export function engineBytes(model: ModelObject): Uint8Array {
  const text = atob(model.engineBytes);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}
