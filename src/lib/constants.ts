export const SCHOOL_NAME = process.env.NEXT_PUBLIC_SCHOOL_NAME || "TRƯỜNG TIỂU HỌC TRẦN VĂN ƠN";
export const TEAM_NAME = process.env.NEXT_PUBLIC_TEAM_NAME || "TỔ CHUYÊN MÔN 4";
export const SCHOOL_YEAR = process.env.NEXT_PUBLIC_SCHOOL_YEAR || "2026-2027";

export const BUCKET = "shcm-files";
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

export const ROLE_LABELS: Record<string, string> = {
  giao_vien: "Giáo viên",
  to_truong: "Tổ trưởng",
  quan_li: "Cán bộ quản lí",
  cum: "Đại diện cụm",
};

export const STATUS_LABELS: Record<string, string> = {
  pending: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Từ chối",
};

export const EDITORS_LABELS: Record<string, string> = {
  all: "Mọi thành viên",
  leader: "Tổ trưởng",
  assigned: "Người được phân công",
};

export const FILES_MODE_LABELS: Record<string, string> = {
  none: "Không có tệp",
  evidence: "Minh chứng (tệp, ảnh, clip)",
  viewer: "Tệp xem trực tiếp",
};

// Nhãn nút AI của tổ trưởng theo từng đề mục
export const AI_ACTION_LABELS: Record<string, string> = {
  tom_tat_gop_y: "AI tóm tắt góp ý thành điểm cần sửa",
  gom_y_kien: "AI gom và phân nhóm ý kiến",
  tong_hop_ket_qua: "AI tổng hợp kết quả áp dụng",
  du_thao_giai_phap: "AI soạn dự thảo nội dung thống nhất",
  du_thao_ket_luan: "AI gợi ý dự thảo kết luận",
};

export const DEFAULT_AI_DAILY_LIMIT_TEACHER = 30;
export const DEFAULT_AI_DAILY_LIMIT_LEADER = 150;

export const FORMAT_LABELS: Record<string, string> = {
  truc_tiep: "Sinh hoạt trực tiếp",
  truc_tuyen: "Sinh hoạt trực tuyến",
};
export const PLATFORMS = ["Google Meet", "Zoom", "Microsoft Teams", "Khác"];
