// 読み込み状況をチェックリストに反映する（CSS / JS / 画像）
function mark(id, ok, text) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = (ok ? "✓ " : "✗ ") + text;
  el.className = ok ? "ok" : "ng";
}

document.addEventListener("DOMContentLoaded", () => {
  // JS は実行された
  mark("js", true, "JS が実行された（app.js）");

  // CSS マーカーを読んで適用を判定
  const marker = getComputedStyle(document.body).getPropertyValue("--css-marker").trim();
  mark("css", marker.includes("loaded"), "CSS が適用された（style.css）");

  // 画像の読み込み判定
  const img = document.querySelector("img");
  if (img) {
    const check = () => mark("img", img.naturalWidth > 0, "画像が表示された（logo.svg）");
    if (img.complete) check();
    else {
      img.addEventListener("load", check);
      img.addEventListener("error", () => mark("img", false, "画像の読み込み失敗（logo.svg）"));
    }
  }
});
