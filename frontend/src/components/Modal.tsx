"use client";

import { useEffect, useId, useState, type ReactNode } from "react";

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
};

export function Modal({ open, title, onClose, children, wide }: Props) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/70" aria-label="Close" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative w-full ${wide ? "max-w-lg" : "max-w-md"} rounded-lg bg-[#282828] shadow-2xl p-6`}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <h2 id={titleId} className="text-xl font-bold">
            {title}
          </h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-white text-2xl leading-none">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block mb-4">
      <span className="block text-xs font-bold uppercase tracking-wide text-muted mb-1.5">{label}</span>
      {children}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full bg-[#3e3e3e] rounded px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-white ${
        props.className || ""
      }`}
    />
  );
}
