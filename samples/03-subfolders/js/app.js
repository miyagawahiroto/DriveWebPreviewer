// 読み込み状況をチェックリストに反映する（サブフォルダ参照版）
function mark(id, ok, text) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = (ok ? "✓ " : "✗ ") + text;
  el.className = ok ? "ok" : "ng";
}

document.addEventListener("DOMContentLoaded", () => {
  mark("js", true, "JS が実行された（js/app.js）");

  const marker = getComputedStyle(document.body).getPropertyValue("--css-marker").trim();
  mark("css", marker.includes("loaded"), "CSS が適用された（css/style.css）");

  const img = document.querySelector("img");
  if (img) {
    const check = () => mark("img", img.naturalWidth > 0, "画像が表示された（assets/logo.svg）");
    if (img.complete) check();
    else {
      img.addEventListener("load", check);
      img.addEventListener("error", () => mark("img", false, "画像の読み込み失敗（assets/logo.svg）"));
    }
  }
});
