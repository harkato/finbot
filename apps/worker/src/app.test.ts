import { describe, expect, it } from "bun:test";
import { app } from "./app";

describe("GET /api/health", () => {
  it("responde 200 com status ok", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "ok",
      service: "finbot-worker",
      phase: 0,
    });
  });

  it("responde 404 em rota desconhecida", async () => {
    const res = await app.request("/api/nope");
    expect(res.status).toBe(404);
  });
});
