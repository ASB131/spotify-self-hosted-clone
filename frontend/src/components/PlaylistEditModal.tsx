"use client";

import { useEffect, useState } from "react";
import { api, getApiUrl, uploadFile, type Playlist } from "@/lib/api";
import { Field, Modal, TextInput } from "@/components/Modal";

type Props = {
  playlist: Playlist | null;
  fallbackArts?: string[];
  onClose: () => void;
  onSaved: () => void;
};

export function PlaylistEditModal({ playlist, fallbackArts = [], onClose, onSaved }: Props) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!playlist) return;
    setName(playlist.name);
    setPreview(null);
    setError(null);
  }, [playlist]);

  if (!playlist) return null;

  const cover =
    preview ||
    (playlist.cover_url ? `${getApiUrl()}${playlist.cover_url}` : null) ||
    (fallbackArts[0]
      ? fallbackArts[0].startsWith("http")
        ? fallbackArts[0]
        : `${getApiUrl()}${fallbackArts[0]}`
      : null);

  async function save() {
    if (!playlist) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/v1/playlists/${playlist.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: name.trim() }),
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function onCover(file: File | null) {
    if (!file || !playlist) return;
    setBusy(true);
    setError(null);
    try {
      await uploadFile(`/api/v1/playlists/${playlist.id}/cover`, file);
      setPreview(URL.createObjectURL(file));
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!playlist} title="Edit playlist details" onClose={onClose}>
      <div className="flex gap-4 mb-4">
        <label
          className={`relative w-36 h-36 shrink-0 rounded overflow-hidden bg-black/40 ${
            playlist.is_liked_songs ? "cursor-default" : "cursor-pointer group"
          }`}
        >
          {playlist.is_liked_songs ? (
            <div className="w-full h-full bg-gradient-to-br from-[#450af5] to-[#8e8ee5] flex items-center justify-center text-white text-5xl">
              ♥
            </div>
          ) : cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="flex w-full h-full items-center justify-center text-4xl font-black text-muted">
              {name.charAt(0).toUpperCase() || "?"}
            </span>
          )}
          {!playlist.is_liked_songs && (
            <>
              <span className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs font-semibold text-center px-2">
                Choose photo
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => onCover(e.target.files?.[0] || null)}
              />
            </>
          )}
        </label>
        <div className="flex-1 min-w-0 self-end">
          <Field label="Name">
            <TextInput
              value={name}
              disabled={playlist.is_liked_songs}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
        </div>
      </div>
      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-4 py-2 rounded-full text-sm text-muted hover:text-white">
          Cancel
        </button>
        <button
          type="button"
          disabled={busy || !name.trim() || playlist.is_liked_songs}
          onClick={save}
          className="px-5 py-2 rounded-full text-sm font-bold bg-spotify text-black disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </Modal>
  );
}
