"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
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
      <div className="min-h-screen flex items-center justify-center bg-black text-muted">Checking server…</div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-black">
      <form onSubmit={submit} className="w-full max-w-md bg-[#121212] p-8 rounded-lg space-y-4 border border-white/5">
        <div className="flex flex-col items-center gap-3 mb-2">
          <Image src="/logo.png" alt="Media player" width={72} height={72} className="rounded-full" priority />
          <h1 className="text-2xl font-bold text-white">Media player</h1>
        </div>
        <p className="text-sm text-muted text-center">
          First time? If no admin exists yet, go to{" "}
          <Link href="/setup" className="text-spotify underline">
            admin setup
          </Link>
          .
        </p>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <input
          className="w-full bg-[#242424] rounded-md px-3 py-2.5 text-white outline-none focus:ring-1 focus:ring-white"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="w-full bg-[#242424] rounded-md px-3 py-2.5 text-white outline-none focus:ring-1 focus:ring-white"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit" className="w-full bg-spotify text-black font-semibold py-2.5 rounded-full">
          Log in
        </button>
        <p className="text-sm text-muted text-center">
          Have an invite?{" "}
          <Link href="/register" className="text-spotify underline">
            Register
          </Link>
        </p>
      </form>
    </div>
  );
}
