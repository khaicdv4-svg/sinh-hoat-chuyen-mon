/**
 * Ghi chú "cần bổ sung" do AI để lại trong nội dung biên bản.
 * Dạng: [Cần bổ sung: ...]. Giao diện và bản xem trước tô đỏ; khi hoàn chỉnh biên bản thì bỏ hẳn.
 */
export const MARK_RE = /\[\s*cần bổ sung\s*:?\s*([^\]]*)\]/gi;

export function hasMarks(text: string | null | undefined): boolean {
  return !!text && new RegExp(MARK_RE.source, "i").test(text);
}

/** Tách đoạn chữ thành các phần thường và phần ghi chú đỏ. */
export function splitMarks(text: string): { t: string; red: boolean }[] {
  const out: { t: string; red: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(new RegExp(MARK_RE.source, "gi"))) {
    const i = m.index ?? 0;
    if (i > last) out.push({ t: text.slice(last, i), red: false });
    out.push({ t: m[0], red: true });
    last = i + m[0].length;
  }
  if (last < text.length) out.push({ t: text.slice(last), red: false });
  return out;
}

/** Bỏ ghi chú, bỏ chuỗi chấm chừa trống, bỏ dòng chỉ còn gạch đầu dòng. */
export function stripMarks(text: string): string {
  return text
    .replace(new RegExp(MARK_RE.source, "gi"), "")
    .replace(/[.…]{4,}/g, "")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").replace(/\s+([,.;:])/g, "$1").trim())
    .filter((l) => l && !/^[-–•*·,.;:\s]*$/.test(l))
    .join("\n");
}

/** Phần biểu quyết và kết luận (trước đây là C, nay là V). */
export const isVotePart = (part: string | null | undefined) => !!part && /^(C|V)\.\s*BIỂU QUYẾT/i.test(part.trim());

/** Các mục lớn I–IV: ý kiến của thành viên gom ở cuối mục. */
export const isOpinionPart = (part: string | null | undefined) => !!part && /^(I|II|III|IV)\./.test(part.trim());

export const PART_OPINION_LABEL = "Ý kiến đóng góp của các thành viên";
export const NO_OPINION_TEXT = "Các thành viên thống nhất, không có ý kiến bổ sung.";
