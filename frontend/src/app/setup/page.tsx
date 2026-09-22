"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { fetchSetupStatus } from "@/lib/setup";

export default function SetupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetchSetupStatus()
      .then((s) => {
        if (!s.needs_setup) router.replace("/login");
        else setReady(true);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Server unreachable"));
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const data = await api<{ access_token: string }>("/api/v1/auth/bootstrap", {
        method: "POST",
        body: JSON.stringify({ email, display_name: displayName, password }),
      });
      sessionStorage.setItem("access_token", data.access_token);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed");
    }
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-muted">
        {error || "Loading…"}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-black">
      <form onSubmit={submit} className="w-full max-w-md bg-[#121212] p-8 rounded-lg space-y-4 border border-white/5">
        <h1 className="text-2xl font-bold">Admin setup</h1>
        <p className="text-sm text-muted">Create the first administrator account for this Media player server.</p>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <input
          className="w-full bg-black/30 rounded px-3 py-2"
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="w-full bg-black/30 rounded px-3 py-2"
          placeholder="Display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
        />
        <input
          className="w-full bg-black/30 rounded px-3 py-2"
          placeholder="Password (min 12 chars)"
          type="password"
          minLength={12}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit" className="w-full bg-spotify text-black font-semibold py-2 rounded-full">
          Create admin
        </button>
      </form>
    </div>
  );
}
