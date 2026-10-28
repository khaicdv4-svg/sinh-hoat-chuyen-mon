export type Theme = { bg: string; surface: string; ink: string; brand: string; size: number };

export const THEME_KEY = "shcm-theme";

export const DEFAULT_THEME: Theme = { bg: "#dfe7e2", surface: "#eaf0ec", ink: "#10201a", brand: "#14634d", size: 17 };

export const PRESETS: { name: string; theme: Theme }[] = [
  { name: "Xanh lá (mặc định)", theme: DEFAULT_THEME },
  { name: "Giấy sáng, chữ đen", theme: { bg: "#f1eee6", surface: "#ffffff", ink: "#0b0b0b", brand: "#0b5d3b", size: 18 } },
  { name: "Xanh dương", theme: { bg: "#dce7f2", surface: "#eef4fa", ink: "#0f1f33", brand: "#1d5fa8", size: 17 } },
  { name: "Màu ấm", theme: { bg: "#eee2d0", surface: "#f8f1e6", ink: "#2b1d10", brand: "#a4491a", size: 17 } },
  { name: "Nền tối", theme: { bg: "#141d19", surface: "#22302a", ink: "#eaf3ee", brand: "#14805f", size: 17 } },
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
  s.setProperty("--sh-dark",dark?"rgba(0,0,0,.55)":"rgba(98,122,111,.42)");
  s.setProperty("--sh-light",dark?"rgba(255,255,255,.06)":"rgba(255,255,255,.95)");
  s.setProperty("font-size",(t.size||17)+"px");
};
try{var v=localStorage.getItem("${THEME_KEY}");if(v)window.__applyTheme(JSON.parse(v))}catch(e){}
})();`;
