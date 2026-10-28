"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_THEME, PRESETS, THEME_KEY, type Theme } from "@/lib/theme";

declare global {
  interface Window { __applyTheme?: (t: Theme | null) => void }
}

const FIELDS: { key: keyof Omit<Theme, "size">; label: string }[] = [
  { key: "bg", label: "Nền trang" },
  { key: "surface", label: "Thẻ, khung" },
  { key: "ink", label: "Chữ" },
  { key: "brand", label: "Nút, nhấn" },
];

export default function ThemeSwitcher() {
  const [open, setOpen] = useState(false);
  const [t, setT] = useState<Theme>(DEFAULT_THEME);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem(THEME_KEY);
      if (v) setT({ ...DEFAULT_THEME, ...JSON.parse(v) });
    } catch { /* bỏ qua, dùng mặc định */ }
  }, []);

  // bấm ra ngoài thì đóng bảng
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  function apply(next: Theme) {
    setT(next);
    window.__applyTheme?.(next);
    try { localStorage.setItem(THEME_KEY, JSON.stringify(next)); } catch { /* bỏ qua */ }
  }
  function reset() {
    setT(DEFAULT_THEME);
    window.__applyTheme?.(null);
    try { localStorage.removeItem(THEME_KEY); } catch { /* bỏ qua */ }
  }

  return (
    <div className="relative" ref={box}>
      <button type="button" className="btn btn-sm" aria-expanded={open} onClick={() => setOpen(!open)}>
        🎨 Giao diện
      </button>
      {open && (
        <div className="theme-panel text-sm">
          <p className="mb-2 font-semibold">Chọn bộ màu có sẵn</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button key={p.name} type="button" className="btn btn-sm" onClick={() => apply(p.theme)}>
                <span className="inline-block h-3 w-3 rounded-full border border-black/20" style={{ background: p.theme.brand }} />
                {p.name}
              </button>
            ))}
          </div>

          <p className="mb-2 mt-4 font-semibold">Tự chỉnh từng màu</p>
          <div className="grid grid-cols-2 gap-3">
            {FIELDS.map((f) => (
              <label key={f.key} className="flex items-center gap-2">
                <input type="color" className="swatch" value={t[f.key]} onChange={(e) => apply({ ...t, [f.key]: e.target.value })} />
                {f.label}
              </label>
            ))}
          </div>

          <label className="mt-4 block">
            Cỡ chữ: {t.size}px
            <input type="range" min={15} max={22} step={1} value={t.size} className="mt-1 w-full"
              onChange={(e) => apply({ ...t, size: Number(e.target.value) })} />
          </label>

          <div className="mt-4 flex justify-between">
            <button type="button" className="btn btn-sm" onClick={reset}>Về màu ban đầu</button>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setOpen(false)}>Xong</button>
          </div>
          <p className="mt-2 text-xs text-gray-500">Máy này sẽ nhớ lựa chọn của thầy, các máy khác chỉnh riêng.</p>
        </div>
      )}
    </div>
  );
}
