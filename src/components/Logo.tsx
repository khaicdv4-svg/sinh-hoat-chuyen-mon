/** Biểu tượng cuốn sách mở với ba bạn học sinh, vẽ bằng SVG nên đổi màu được theo giao diện. */
export default function Logo({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Sinh hoạt chuyên môn" className="shrink-0">
      <circle cx="20" cy="10" r="5" fill="#f4a63a" /><circle cx="32" cy="6" r="5.5" fill="#3b82d6" /><circle cx="44" cy="10" r="5" fill="#e0575b" />
      <path d="M32 22 C24 17 12 17 6 20 V50 C12 47 24 47 32 52 Z" fill="#fff" stroke="var(--brand)" strokeWidth="3" strokeLinejoin="round" />
      <path d="M32 22 C40 17 52 17 58 20 V50 C52 47 40 47 32 52 Z" fill="#fff" stroke="var(--brand)" strokeWidth="3" strokeLinejoin="round" />
      <path d="M12 26 C18 24 24 25 28 27 M12 32 C18 30 24 31 28 33 M36 27 C40 25 46 24 52 26 M36 33 C40 31 46 30 52 32" stroke="var(--brand)" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity=".55" />
      <path d="M4 52 C12 50 24 51 32 56 C40 51 52 50 60 52" stroke="var(--brand)" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}
