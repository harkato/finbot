import { SESSION_TTL_SECONDS, signToken, verifyToken } from "@finbot/shared";

// GET /auth?token=<magic> — valida o magic link do bot e grava o cookie de sessão (30 dias).
export default defineEventHandler(async (event) => {
  const token = getQuery(event).token as string | undefined;
  const config = useRuntimeConfig();

  if (token) {
    const payload = await verifyToken(config.sessionSecret, token, "magic");
    if (payload) {
      const session = await signToken(
        config.sessionSecret,
        { uid: payload.uid, typ: "session" },
        SESSION_TTL_SECONDS,
      );
      setCookie(event, "finbot_session", session, {
        httpOnly: true,
        secure: getRequestURL(event).protocol === "https:",
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_TTL_SECONDS,
      });
      return sendRedirect(event, "/");
    }
  }
  return sendRedirect(event, "/login?error=1");
});
