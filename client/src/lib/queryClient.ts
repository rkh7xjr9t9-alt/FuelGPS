import { QueryClient } from "@tanstack/react-query";
import { getToken } from "./auth";

// Resolve the API base URL — in deployment the port proxy rewrites __PORT_5000__
const API_BASE = (import.meta as any).env?.VITE_API_BASE ?? "";

export async function apiRequest<T = unknown>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: async ({ queryKey }) => {
        const [path, ...rest] = queryKey as [string, ...unknown[]];
        // Build URL with extra params if any
        let url = `${API_BASE}${path}`;
        if (rest.length === 1 && typeof rest[0] === "object" && rest[0] !== null) {
          const params = new URLSearchParams(
            Object.entries(rest[0] as Record<string, string>).filter(([, v]) => v != null)
          );
          if (params.toString()) url += `?${params}`;
        }
        const token = getToken();
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      },
      staleTime: 30_000,
      retry: 1,
    },
  },
});
