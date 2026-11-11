import { splitMarks } from "@/lib/markers";

/** Hiện nội dung, tô đỏ các ghi chú [Cần bổ sung: …] để tổ trưởng xem lại. */
export default function MarkedText({ text }: { text: string }) {
  return (
    <>
      {splitMarks(text).map((p, i) =>
        p.red ? <span key={i} className="font-semibold text-red-600">{p.t}</span> : <span key={i}>{p.t}</span>,
      )}
    </>
  );
}
