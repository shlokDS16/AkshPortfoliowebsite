import { describe, expect, it } from "vitest";
import { confirmAdminSession, getAdmin, isAdminEmail, safeNextPath } from "./admin";
import type { AdminDb } from "./admin";

type ClaimsResult = { data: { claims: Record<string, unknown> } | null; error: Error | null };
type RoleResult = { data: { role: string } | null; error: { message: string } | null };

const ADMIN = "aksh@example.com";
const ADMIN_ROW: RoleResult = { data: { role: "admin" }, error: null };

/** Fake cookie-session client: auth.getClaims, auth.signOut and profiles select-by-id. */
function fakeDb(claims: ClaimsResult, role: RoleResult = ADMIN_ROW) {
  const calls = { signOut: 0, profileIds: [] as string[] };
  const db = {
    auth: {
      getClaims: async () => claims,
      signOut: async () => {
        calls.signOut++;
        return { error: null };
      },
    },
    from: (table: string) => {
      expect(table).toBe("profiles");
      return {
        select: () => ({
          eq: (_column: string, value: string) => {
            calls.profileIds.push(value);
            return { maybeSingle: async () => role };
          },
        }),
      };
    },
  } as unknown as AdminDb;
  return { db, calls };
}

const adminClaims: ClaimsResult = { data: { claims: { sub: "u-1", email: "Aksh@Example.com" } }, error: null };

describe("isAdminEmail", () => {
  it("matches case- and space-insensitively", () => {
    expect(isAdminEmail(" Aksh@Example.COM ", ADMIN)).toBe(true);
    expect(isAdminEmail("someone@example.com", ADMIN)).toBe(false);
    expect(isAdminEmail(null, ADMIN)).toBe(false);
    expect(isAdminEmail(undefined, ADMIN)).toBe(false);
  });

  it("rejects lookalikes of different length or one differing character", () => {
    expect(isAdminEmail("aksh@example.co", ADMIN)).toBe(false);
    expect(isAdminEmail("aksh@example.comm", ADMIN)).toBe(false);
    expect(isAdminEmail("aksi@example.com", ADMIN)).toBe(false);
    expect(isAdminEmail("", ADMIN)).toBe(false);
  });
});

describe("safeNextPath", () => {
  it.each([
    ["/desk/items", "/desk/items"],
    ["/desk/items/abc", "/desk/items/abc"],
    ["/desk?x=1", "/desk?x=1"],
    [null, "/desk"],
    [undefined, "/desk"],
    ["", "/desk"],
    ["https://evil.example", "/desk"],
    ["//evil.example", "/desk"],
    ["/\\evil.example", "/desk"],
    ["/\t/evil.example", "/desk"],
    ["/\n/evil.example", "/desk"],
    ["/ /evil.example", "/desk"],
    ["/desk/../..//evil.example", "/desk"],
    ["/desk/%2e%2e/%2e%2e//evil.example", "/desk"],
    ["/login", "/desk"],
    ["/deskevil", "/desk"],
    ["desk/items", "/desk"],
  ])("safeNextPath(%j) = %j", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it("uses the caller's fallback", () => {
    expect(safeNextPath("//evil.example", "/desk/items")).toBe("/desk/items");
  });
});

describe("getAdmin", () => {
  it("returns the identity when the database role is admin and the email matches", async () => {
    const { db, calls } = fakeDb(adminClaims);
    await expect(getAdmin({ db, adminEmail: ADMIN })).resolves.toEqual({ userId: "u-1", email: ADMIN });
    expect(calls.profileIds).toEqual(["u-1"]);
  });

  it("returns null when the database says non-admin even though the email matches", async () => {
    const { db } = fakeDb(adminClaims, { data: { role: "client" }, error: null });
    await expect(getAdmin({ db, adminEmail: ADMIN })).resolves.toBeNull();
  });

  it("returns null when RLS hides the profile row (non-admin caller)", async () => {
    const { db } = fakeDb(adminClaims, { data: null, error: null });
    await expect(getAdmin({ db, adminEmail: ADMIN })).resolves.toBeNull();
  });

  it("returns null when the profile read fails", async () => {
    const { db } = fakeDb(adminClaims, { data: null, error: { message: "boom" } });
    await expect(getAdmin({ db, adminEmail: ADMIN })).resolves.toBeNull();
  });

  it("returns null when the database says admin but the email differs", async () => {
    const { db } = fakeDb({ data: { claims: { sub: "u-2", email: "x@example.com" } }, error: null });
    await expect(getAdmin({ db, adminEmail: ADMIN })).resolves.toBeNull();
  });

  it.each([
    ["no session", { data: null, error: null }],
    ["an auth error", { data: null, error: new Error("jwt expired") }],
    ["claims without sub", { data: { claims: { email: ADMIN } }, error: null }],
    ["claims without email", { data: { claims: { sub: "u-1" } }, error: null }],
  ])("returns null for %s", async (_label, result) => {
    const { db, calls } = fakeDb(result as ClaimsResult);
    await expect(getAdmin({ db, adminEmail: ADMIN })).resolves.toBeNull();
    expect(calls.profileIds).toEqual([]);
  });
});

describe("confirmAdminSession", () => {
  it("keeps a session that is the admin's", async () => {
    const { db, calls } = fakeDb(adminClaims);
    await expect(confirmAdminSession(db, ADMIN)).resolves.toBe(true);
    expect(calls.signOut).toBe(0);
  });

  it("signs out a session whose email is not the admin's", async () => {
    const { db, calls } = fakeDb({ data: { claims: { sub: "u-2", email: "x@example.com" } }, error: null });
    await expect(confirmAdminSession(db, ADMIN)).resolves.toBe(false);
    expect(calls.signOut).toBe(1);
  });

  it("signs out a session the database does not call admin", async () => {
    const { db, calls } = fakeDb(adminClaims, { data: { role: "client" }, error: null });
    await expect(confirmAdminSession(db, ADMIN)).resolves.toBe(false);
    expect(calls.signOut).toBe(1);
  });
});
