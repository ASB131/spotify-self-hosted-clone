"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { fetchSetupStatus } from "@/lib/setup";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetchSetupStatus()
      .then((s) => {
        if (s.needs_setup) {
          router.replace("/setup");
          return;
        }
        setChecking(false);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Server unreachable");
        setChecking(false);
      });
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const data = await api<{ access_token: string }>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      sessionStorage.setItem("access_token", data.access_token);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted">
        Checking server…
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-md bg-panel p-8 rounded-lg space-y-4">
        <h1 className="text-2xl font-bold">Log in</h1>
        <p className="text-sm text-muted">
          First time on this server? If no admin exists yet, you will be sent to{" "}
          <Link href="/setup" className="text-spotify underline">
            admin setup
          </Link>
          .
        </p>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <input
          className="w-full bg-black/30 rounded px-3 py-2"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="w-full bg-black/30 rounded px-3 py-2"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit" className="w-full bg-spotify text-black font-semibold py-2 rounded-full">
          Log in
        </button>
        <p className="text-sm text-muted">
          Have an invite?{" "}
          <Link href="/register" className="text-spotify underline">
            Register
          </Link>
        </p>
      </form>
    </div>
  );
}
