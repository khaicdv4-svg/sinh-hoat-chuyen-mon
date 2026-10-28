const TZ = "Asia/Ho_Chi_Minh";

export function todayVN(): string {
  // en-CA cho ra dạng YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

export function fmtWeekday(d: string | null | undefined): string {
  if (!d) return "";
  const date = new Date(`${d}T00:00:00+07:00`);
  const names = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
  const dow = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(date);
  const idx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(dow);
  return names[idx] ?? "";
}

export function fmtTime(t: string | null | undefined): string {
  if (!t) return "";
  return t.slice(0, 5).replace(":", " giờ ").replace(/ giờ 00$/, " giờ");
}

export function fmtDateTime(ts: string): string {
  const d = new Date(ts);
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function fmtSize(bytes: number | null | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function roman(n: number): string {
  const map: [number, string][] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
    [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let out = "";
  let rest = n;
  for (const [v, s] of map) {
    while (rest >= v) {
      out += s;
      rest -= v;
    }
  }
  return out;
}

export function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export function safeFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) : "";
  const slug = slugify(base) || "tep";
  return ext ? `${slug}.${ext}` : slug;
}

/** Thay {tuan}, {truoc} trong tên phần bằng tuần thật của buổi họp. */
export function partLabel(part: string | null | undefined, weekFrom: number | null, weekTo: number | null): string {
  if (!part) return "";
  const tuan = weekFrom != null && weekTo != null ? `TUẦN ${weekFrom} + ${weekTo}` : "";
  const truoc =
    weekFrom != null && weekFrom > 2 ? `TUẦN ${weekFrom - 2} + ${weekFrom - 1}` : weekFrom != null ? "ĐẦU NĂM HỌC" : "";
  return part.replace("{tuan}", tuan).replace("{truoc}", truoc).replace(/\s+$/, "");
}

export const memberName = (m: { honorific: string; full_name: string } | null | undefined) =>
  m ? `${m.honorific} ${m.full_name}` : "";

/** Nhóm các đề mục theo phần, giữ thứ tự; trả về số thứ tự trong phần. */
export function groupByPart<T extends { part: string | null; layout?: string; numbered?: boolean }>(sections: T[]) {
  const groups: { part: string | null; items: { s: T; no: number }[] }[] = [];
  for (const s of sections) {
    let g = groups[groups.length - 1];
    if (!g || g.part !== s.part) {
      g = { part: s.part, items: [] };
      groups.push(g);
    }
    const no = s.numbered === false ? 0 : g.items.filter((x) => x.no > 0).length + 1;
    g.items.push({ s, no });
  }
  return groups;
}
