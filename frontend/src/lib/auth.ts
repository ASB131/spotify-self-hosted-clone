/** Browser auth token helpers. Prefer httpOnly cookies; keep a local backup for WS / Bearer. */

const TOKEN_KEY = "access_token";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const local = localStorage.getItem(TOKEN_KEY);
    if (local) return local;
    // Migrate older sessionStorage tokens so closing the tab does not log you out.
    const sess = sessionStorage.getItem(TOKEN_KEY);
    if (sess) {
      localStorage.setItem(TOKEN_KEY, sess);
      sessionStorage.removeItem(TOKEN_KEY);
      return sess;
    }
    return null;
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode */
  }
}

export function clearStoredToken() {
  setStoredToken(null);
}
