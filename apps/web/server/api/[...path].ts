// Proxy genérico → Worker. O browser NUNCA fala com o Worker direto; o cookie de sessão
// é repassado como Authorization. Nenhum segredo de serviço chega ao browser.
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const session = getCookie(event, "finbot_session");
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: "unauthenticated" });
  }

  const path = (getRouterParam(event, "path") ?? "").replace(/^\/+/, "");
  const url = `${config.apiBaseUrl}/api/${path}`;
  const method = event.method;

  const body =
    method === "GET" || method === "HEAD" ? undefined : await readRawBody(event);

  const res = await $fetch.raw(url, {
    method,
    query: getQuery(event),
    body,
    headers: {
      Authorization: `Bearer ${session}`,
      "Content-Type": getHeader(event, "content-type") ?? "application/json",
    },
    ignoreResponseError: true,
  });

  setResponseStatus(event, res.status);
  for (const h of ["content-type", "content-disposition"]) {
    const v = res.headers.get(h);
    if (v) setResponseHeader(event, h, v);
  }
  return res._data;
});
