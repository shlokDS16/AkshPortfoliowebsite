import { describe, expect, it, vi } from "vitest";
import { createThumbHandler } from "./handler";

const ID = "0b6f3c1e-8a2d-4f5b-9c7e-1d2a3b4c5d6e";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 9]);
const admin = { userId: "a1", email: "a@x.test" };
const ask = (handler: ReturnType<typeof createThumbHandler>, id: string) => handler(new Request(`https://site.test/desk/sources/${id}/thumb`), { params: Promise.resolve({ id }) });

describe("GET /desk/sources/[id]/thumb", () => {
  it("is a 401 with no admin session, and reads nothing", async () => {
    const thumb = vi.fn();
    const res = await ask(createThumbHandler({ getAdmin: async () => null, thumb }), ID);
    expect(res.status).toBe(401);
    expect(thumb).not.toHaveBeenCalled();
  });

  it("serves the picture to the admin as a private, short-lived JPEG that no browser sniffs", async () => {
    const thumb = vi.fn(async () => JPEG);
    const res = await ask(createThumbHandler({ getAdmin: async () => admin, thumb }), ID);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toBe("private, max-age=300");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(JPEG);
    expect(thumb).toHaveBeenCalledWith(ID);
  });

  it("is a 404 for an id that is not a UUID (before any read), for no picture, and when the read fails", async () => {
    const thumb = vi.fn(async () => null);
    expect((await ask(createThumbHandler({ getAdmin: async () => admin, thumb }), "../x")).status).toBe(404);
    expect(thumb).not.toHaveBeenCalled();
    expect((await ask(createThumbHandler({ getAdmin: async () => admin, thumb }), ID)).status).toBe(404);
    const failing = createThumbHandler({ getAdmin: async () => admin, thumb: async () => Promise.reject(new Error("boom")) });
    expect((await ask(failing, ID)).status).toBe(404);
  });
});
