import type { Workspace } from "../../../packages/contracts/index";
let csrfToken = "";
let workspaceRequest: Promise<Workspace> | undefined;
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}
export async function request(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.method && !["GET", "HEAD"].includes(init.method)
        ? { "X-CSRF-Token": csrfToken }
        : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(
      body.message ?? "Server není dostupný. Zkuste to znovu.",
      response.status,
      body.code,
    );
  }
  return response;
}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const data = await (await request(path, init)).json();
  if (typeof data.csrfToken === "string") csrfToken = data.csrfToken;
  return data;
}
/** Deduplicate bootstrap, including StrictMode, to avoid racing fresh cookies. */
export function loadWorkspace(): Promise<Workspace> {
  if (!workspaceRequest)
    workspaceRequest = api<Workspace>("/api/v1/workspace").finally(() => {
      workspaceRequest = undefined;
    });
  return workspaceRequest;
}
export async function downloadMaterials(
  view: "baseline" | "scenario",
  version: number,
) {
  const response = await request(
    `/api/v1/exports/materials.csv?view=${view}&version=${version}`,
  );
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = `materialy-${view}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
