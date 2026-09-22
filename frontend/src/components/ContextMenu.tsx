"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type ContextMenuItem = {
  id: string;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  submenu?: { id: string; label: string; onClick: () => void; disabled?: boolean }[];
};

type Props = {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
};

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [openSub, setOpenSub] = useState<string | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    let left = x;
    let top = y;
    if (left + rect.width > window.innerWidth - pad) left = Math.max(pad, window.innerWidth - rect.width - pad);
    if (top + rect.height > window.innerHeight - pad) top = Math.max(pad, window.innerHeight - rect.height - pad);
    setPos({ left, top });
  }, [x, y, items]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onScroll = () => onClose();
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={ref}
      role="menu"
      className="fixed z-[200] min-w-[200px] rounded-md bg-[#282828] shadow-2xl py-1 text-sm text-white border border-white/5"
      style={{ left: pos.left, top: pos.top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item) => {
        const hasSub = !!item.submenu?.length;
        return (
          <div
            key={item.id}
            className="relative"
            onMouseEnter={() => setOpenSub(hasSub ? item.id : null)}
            onMouseLeave={() => setOpenSub((cur) => (cur === item.id ? null : cur))}
          >
            <button
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className={`w-full flex items-center justify-between gap-6 px-4 py-2.5 text-left ${
                item.disabled
                  ? "text-muted cursor-default"
                  : item.danger
                    ? "text-red-300 hover:bg-white/10"
                    : "hover:bg-white/10"
              }`}
              onClick={() => {
                if (item.disabled || hasSub) return;
                item.onClick?.();
                onClose();
              }}
            >
              <span>{item.label}</span>
              {hasSub && <span className="text-muted text-xs">›</span>}
            </button>
            {hasSub && openSub === item.id && item.submenu && (
              <div className="absolute left-full top-0 ml-0.5 min-w-[180px] max-h-72 overflow-y-auto rounded-md bg-[#282828] shadow-2xl py-1 border border-white/5">
                {item.submenu.map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    role="menuitem"
                    disabled={sub.disabled}
                    className={`w-full text-left px-4 py-2.5 truncate ${
                      sub.disabled ? "text-muted cursor-default" : "hover:bg-white/10"
                    }`}
                    onClick={() => {
                      if (sub.disabled) return;
                      sub.onClick();
                      onClose();
                    }}
                  >
                    {sub.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>,
    document.body
  );
}
