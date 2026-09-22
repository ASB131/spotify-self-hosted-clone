"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { setStoredToken } from "@/lib/auth";
import { fetchSetupStatus } from "@/lib/setup";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", display_name: "", password: "", invite_code: "" });
  const [error, setError] = useState("");

  useEffect(() => {
    fetchSetupStatus().then((s) => {
      if (s.needs_setup) router.replace("/setup");
    });
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/api/v1/auth/register", { method: "POST", body: JSON.stringify(form) });
      const login = await api<{ access_token: string }>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: form.email, password: form.password }),
      });
      setStoredToken(login.access_token);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-black">
      <form onSubmit={submit} className="w-full max-w-md bg-[#121212] p-8 rounded-lg space-y-4 border border-white/5">
        <h1 className="text-2xl font-bold">Register</h1>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        {(["email", "display_name", "password", "invite_code"] as const).map((key) => (
          <input
            key={key}
            className="w-full bg-black/30 rounded px-3 py-2"
            placeholder={key.replace("_", " ")}
            type={key === "password" ? "password" : "text"}
            value={form[key]}
            onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            required
          />
        ))}
        <button type="submit" className="w-full bg-spotify text-black font-semibold py-2 rounded-full">
          Create account
        </button>
      </form>
    </div>
  );
}
