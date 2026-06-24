// 各 Content-Type の読み込みを検証する
function mark(id, ok, text) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = (ok ? "✓ " : "✗ ") + text;
  el.className = ok ? "ok" : "ng";
}

function checkImage(id, selector, label) {
  const img = document.querySelector(selector);
  if (!img) return;
  const check = () => mark(id, img.naturalWidth > 0, label);
  if (img.complete) check();
  else {
    img.addEventListener("load", check);
    img.addEventListener("error", () => mark(id, false, label + "（失敗）"));
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  mark("js", true, "JS が実行された（app.js）");

  const marker = getComputedStyle(document.body).getPropertyValue("--css-marker").trim();
  mark("css", marker.includes("loaded"), "CSS が適用された（style.css）");

  checkImage("svg", 'img[src="icon.svg"]', "SVG が表示された（icon.svg）");
  checkImage("png", 'img[src="pixel.png"]', "PNG が表示された（pixel.png・バイナリ）");

  // JSON を fetch して内容を表示（Content-Type: application/json の検証）
  try {
    const res = await fetch("data.json");
    const data = await res.json();
    mark("json", true, `JSON 取得成功（data.json）: ${data.message}`);
  } catch (e) {
    mark("json", false, "JSON 取得失敗（data.json）");
  }
});
