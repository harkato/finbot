// Gate de acesso: sem sessão válida, manda pro /login. /login e /auth são públicos.
export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === "/login" || to.path === "/auth") return;
  const request = useRequestFetch();
  try {
    await request("/api/me");
  } catch {
    return navigateTo("/login");
  }
});
