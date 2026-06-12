// Cliente da API via proxy do Nitro (/api/* → Worker). Usa useRequestFetch p/ repassar
// o cookie de sessão também no SSR.
export function useApi() {
  const request = useRequestFetch();
  return {
    get: <T>(path: string) => request<T>(`/api/${path}`),
    post: <T>(path: string, body: unknown) =>
      request<T>(`/api/${path}`, { method: "POST", body }),
    patch: <T>(path: string, body: unknown) =>
      request<T>(`/api/${path}`, { method: "PATCH", body }),
    del: <T>(path: string) => request<T>(`/api/${path}`, { method: "DELETE" }),
  };
}
