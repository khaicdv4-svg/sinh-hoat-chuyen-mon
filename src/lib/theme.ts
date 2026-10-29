export type Theme = { bg: string; surface: string; ink: string; brand: string; size: number };

export const THEME_KEY = "shcm-theme";

export const DEFAULT_THEME: Theme = { bg: "#e6f3ee", surface: "#ffffff", ink: "#16283a", brand: "#0f6049", size: 17 };

export const PRESETS: { name: string; theme: Theme }[] = [
  { name: "Xanh ngọc (mặc định)", theme: DEFAULT_THEME },
  { name: "Chữ to, tương phản cao", theme: { bg: "#f4f1ea", surface: "#ffffff", ink: "#0b0b0b", brand: "#0b5d3b", size: 18 } },
  { name: "Xanh dương", theme: { bg: "#e1ecf8", surface: "#ffffff", ink: "#0f1f33", brand: "#1d5fa8", size: 17 } },
  { name: "Màu ấm", theme: { bg: "#f6ead8", surface: "#fffaf2", ink: "#2b1d10", brand: "#a4491a", size: 17 } },
  { name: "Nền tối", theme: { bg: "#111a17", surface: "#1d2a25", ink: "#eaf3ee", brand: "#1c9a74", size: 17 } },
];

/* Chạy ngay khi trang vừa tải (trước khi vẽ giao diện) để không bị nháy màu.
   Cũng đặt sẵn window.__applyTheme cho nút "Giao diện" gọi lại. */
export const THEME_SCRIPT = `(function(){
function lum(h){var n=parseInt(h.slice(1),16),r=(n>>16)&255,g=(n>>8)&255,b=n&255;return(0.2126*r+0.7152*g+0.0722*b)/255}
window.__applyTheme=function(t){
  var s=document.documentElement.style;
  if(!t){["--bg","--surface","--ink","--brand","--sh-dark","--sh-light"].forEach(function(k){s.removeProperty(k)});s.removeProperty("font-size");return}
  s.setProperty("--bg",t.bg);s.setProperty("--surface",t.surface);s.setProperty("--ink",t.ink);s.setProperty("--brand",t.brand);
  var dark=lum(t.bg)<0.4;
  s.setProperty("--sh-dark",dark?"rgba(0,0,0,.5)":"rgba(20,70,60,.14)");
  s.setProperty("--sh-light",dark?"rgba(255,255,255,.05)":"rgba(255,255,255,.9)");
  s.setProperty("font-size",(t.size||17)+"px");
};
try{var v=localStorage.getItem("${THEME_KEY}");if(v)window.__applyTheme(JSON.parse(v))}catch(e){}
})();`;
