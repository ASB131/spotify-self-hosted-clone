"use client";

import { useEffect, useState } from "react";
import { api, artUrl, uploadFile, type Track } from "@/lib/api";
import { Field, Modal, TextInput } from "@/components/Modal";

type Props = {
  track: Track | null;
  onClose: () => void;
  onSaved: () => void;
};

export function TrackEditModal({ track, onClose, onSaved }: Props) {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!track) return;
    setTitle(track.title);
    setArtist(track.artist);
    setPreview(null);
    setError(null);
  }, [track]);

  if (!track) return null;

  async function save() {
    if (!track) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/v1/tracks/${track.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: title.trim(), artist: artist.trim() }),
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function onArt(file: File | null) {
    if (!file || !track) return;
    setBusy(true);
    setError(null);
    try {
      await uploadFile(`/api/v1/tracks/${track.id}/art`, file);
      setPreview(URL.createObjectURL(file));
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!track) return;
    const ok = window.confirm(
      `Remove “${track.title}” from your library?\n\nIf no other users have this song, the file is deleted from the server.`
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/v1/tracks/${track.id}`, { method: "DELETE" });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  const cover = preview || artUrl(track);

  return (
    <Modal open={!!track} title="Edit song" onClose={onClose}>
      <div className="flex gap-4 mb-4">
        <label className="relative w-28 h-28 shrink-0 rounded overflow-hidden bg-black/40 cursor-pointer group">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="flex w-full h-full items-center justify-center text-muted">Art</span>
          )}
          <span className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs font-semibold">
            Change
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => onArt(e.target.files?.[0] || null)}
          />
        </label>
        <div className="flex-1 min-w-0">
          <Field label="Title">
            <TextInput value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Artists (comma-separated)">
            <TextInput value={artist} onChange={(e) => setArtist(e.target.value)} />
          </Field>
        </div>
      </div>
      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
      <div className="flex items-center gap-3 justify-between">
        <button type="button" onClick={remove} disabled={busy} className="text-sm text-red-400 hover:underline">
          Remove from library
        </button>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-full text-sm text-muted hover:text-white">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !title.trim() || !artist.trim()}
            onClick={save}
            className="px-5 py-2 rounded-full text-sm font-bold bg-spotify text-black disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}
