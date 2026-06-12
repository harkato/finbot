import { describe, expect, it } from "bun:test";
import { signToken, verifyToken } from "./tokens";

const SECRET = "test-secret-123";

describe("tokens", () => {
  it("roundtrip válido", async () => {
    const t = await signToken(SECRET, { uid: 7, typ: "session" }, 60);
    const p = await verifyToken(SECRET, t, "session");
    expect(p?.uid).toBe(7);
    expect(p?.typ).toBe("session");
  });

  it("rejeita tipo errado", async () => {
    const t = await signToken(SECRET, { uid: 7, typ: "magic" }, 60);
    expect(await verifyToken(SECRET, t, "session")).toBeNull();
  });

  it("rejeita expirado", async () => {
    const t = await signToken(SECRET, { uid: 7, typ: "magic" }, -1);
    expect(await verifyToken(SECRET, t, "magic")).toBeNull();
  });

  it("rejeita segredo errado", async () => {
    const t = await signToken(SECRET, { uid: 7, typ: "session" }, 60);
    expect(await verifyToken("outro-segredo", t, "session")).toBeNull();
  });

  it("rejeita token adulterado", async () => {
    const t = await signToken(SECRET, { uid: 7, typ: "session" }, 60);
    const [body, sig] = t.split(".");
    // troca o uid no payload mantendo a assinatura antiga
    const forged = `${btoa(JSON.stringify({ uid: 999, typ: "session", exp: 9999999999 }))}.${sig}`;
    void body;
    expect(await verifyToken(SECRET, forged, "session")).toBeNull();
  });
});
