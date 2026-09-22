"use client";

import { useEffect, useState } from "react";
import { AdminIntegrations } from "@/components/AdminIntegrations";
import { api } from "@/lib/api";

type StorageRow = {
  user_id: number;
  display_name: string;
  storage_used_bytes: number;
  storage_quota_bytes: number;
  tracks: number;
};

type Invite = { code: string; max_uses: number; uses: number };

export default function AdminPage() {
  const [storage, setStorage] = useState<StorageRow[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);

  const load = () => {
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
    <div className="max-w-3xl space-y-8 pb-10">
      <header>
        <h2 className="text-2xl font-bold">Admin</h2>
        <p className="text-sm text-muted mt-1">Invites, storage quotas, and optional YouTube cookies.</p>
      </header>

      <AdminIntegrations />

      <section className="bg-panel rounded-lg p-5 border border-white/5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Invite codes</h3>
          <button
            type="button"
            onClick={createInvite}
            className="text-sm font-semibold bg-spotify text-black px-3 py-1.5 rounded-full"
          >
            New code
          </button>
        </div>
        {invites.length === 0 ? (
          <p className="text-sm text-muted">No invite codes yet.</p>
        ) : (
          <ul className="text-sm space-y-1.5">
            {invites.map((i) => (
              <li key={i.code} className="font-mono bg-black/30 px-3 py-2 rounded-md flex justify-between">
                <span>{i.code}</span>
                <span className="text-muted">
                  {i.uses}/{i.max_uses}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-panel rounded-lg p-5 border border-white/5">
        <h3 className="font-semibold mb-3">Storage by user</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted text-left text-xs uppercase tracking-wide">
                <th className="pb-2">User</th>
                <th className="pb-2">Tracks</th>
                <th className="pb-2">Used</th>
                <th className="pb-2">Quota (GB)</th>
              </tr>
            </thead>
            <tbody>
              {storage.map((s) => (
                <tr key={s.user_id} className="border-t border-white/10">
                  <td className="py-2.5">{s.display_name}</td>
                  <td className="py-2.5">{s.tracks}</td>
                  <td className="py-2.5 tabular-nums">{(s.storage_used_bytes / 1024 ** 3).toFixed(2)} GB</td>
                  <td className="py-2.5">
                    <input
                      type="number"
                      className="w-20 bg-[#242424] rounded px-2 py-1 outline-none focus:ring-1 focus:ring-white"
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
    </div>
  );
}
