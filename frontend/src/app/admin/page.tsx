"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";

type UserRow = {
  id: number;
  email: string;
  display_name: string;
  storage_used_bytes: number;
  storage_quota_bytes: number;
  is_active: boolean;
};

type StorageRow = {
  user_id: number;
  display_name: string;
  storage_used_bytes: number;
  storage_quota_bytes: number;
  tracks: number;
};

type Invite = { code: string; max_uses: number; uses: number };

export default function AdminPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [storage, setStorage] = useState<StorageRow[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);

  const load = () => {
    api<UserRow[]>("/api/v1/admin/users").then(setUsers).catch(() => setUsers([]));
    api<StorageRow[]>("/api/v1/admin/storage-overview").then(setStorage).catch(() => setStorage([]));
    api<Invite[]>("/api/v1/admin/invite-codes").then(setInvites).catch(() => setInvites([]));
  };

  useEffect(() => {
    load();
  }, []);

  async function createInvite() {
    await api("/api/v1/admin/invite-codes", {
      method: "POST",
      body: JSON.stringify({ max_uses: 1, expires_in_days: 30 }),
    });
    load();
  }

  async function setQuota(userId: number, gb: number) {
    await api(`/api/v1/admin/users/${userId}/quota`, {
      method: "PATCH",
      body: JSON.stringify({ storage_quota_bytes: gb * 1024 ** 3 }),
    });
    load();
  }

  return (
    <AppShell>
      <h2 className="text-2xl font-bold mb-4">Admin</h2>
      <section className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">Invite codes</h3>
          <button type="button" onClick={createInvite} className="text-spotify text-sm">
            + New code
          </button>
        </div>
        <ul className="text-sm space-y-1">
          {invites.map((i) => (
            <li key={i.code} className="font-mono bg-panel p-2 rounded">
              {i.code} ({i.uses}/{i.max_uses})
            </li>
          ))}
        </ul>
      </section>
      <section className="mb-8">
        <h3 className="font-semibold mb-2">Server configuration</h3>
        <p className="text-sm text-muted mb-2">
          Spotify keys, YouTube cookies, and CORS are configured in the host <code className="text-white">.env</code>.
          See the in-app{" "}
          <a href="/setup-guide" className="text-spotify underline">
            Setup guide
          </a>{" "}
          for status badges and steps.
        </p>
      </section>
      <section>
        <h3 className="font-semibold mb-2">Storage by user</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted text-left">
                <th className="p-2">User</th>
                <th className="p-2">Tracks</th>
                <th className="p-2">Used</th>
                <th className="p-2">Quota (GB)</th>
              </tr>
            </thead>
            <tbody>
              {storage.map((s) => (
                <tr key={s.user_id} className="border-t border-white/10">
                  <td className="p-2">{s.display_name}</td>
                  <td className="p-2">{s.tracks}</td>
                  <td className="p-2">{(s.storage_used_bytes / 1024 ** 3).toFixed(2)} GB</td>
                  <td className="p-2">
                    <input
                      type="number"
                      className="w-20 bg-black/30 rounded px-2"
                      defaultValue={Math.round(s.storage_quota_bytes / 1024 ** 3)}
                      onBlur={(e) => setQuota(s.user_id, Number(e.target.value))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
