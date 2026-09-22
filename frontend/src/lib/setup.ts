/** Redirect helpers when the server has no admin user yet. */

import { getApiUrl } from "@/lib/api";

export async function fetchSetupStatus(): Promise<{ needs_setup: boolean }> {
  const res = await fetch(`${getApiUrl()}/api/v1/auth/setup-status`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error("Could not reach the API. Is the backend running?");
  }
  return res.json();
}
