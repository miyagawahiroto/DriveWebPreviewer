// デモモード用のバンドル同梱サンプルサイト（docs/DEMO.md）
// OAuth 不要で、fetch インターセプト → パス解決 → Content-Type 付与の経路を確認するための小さな資産。
// 相対パス・サブフォルダ解決を確認できるよう、ルートと assets/ にファイルを置く。

const INDEX_HTML = `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>DriveWebPreviewer デモ</title>
    <link rel="stylesheet" href="style.css" />
  </head>
  <body>
    <main>
      <img src="assets/logo.svg" alt="logo" width="72" height="72" />
      <h1>デモプレビュー成功 🎉</h1>
      <p>このページは Service Worker が仮想 Web サーバーとして配信しています。</p>
      <ul>
        <li><code>style.css</code>（相対パス）が当たっています</li>
        <li><code>assets/logo.svg</code>（サブフォルダ）が解決されています</li>
        <li><code>app.js</code> が <code>text/javascript</code> で実行されています</li>
      </ul>
      <p id="js-status">JS 未実行</p>
    </main>
    <script src="app.js"></script>
  </body>
</html>
`;

const STYLE_CSS = `:root { color-scheme: light; }
body {
  font-family: system-ui, sans-serif;
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, #e8f0fe, #fff);
  color: #202124;
}
main {
  text-align: center;
  padding: 2rem 2.5rem;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 8px 30px rgba(26, 115, 232, 0.15);
  max-width: 480px;
}
h1 { color: #1a73e8; }
code { background: #f1f3f4; padding: 2px 6px; border-radius: 4px; }
ul { text-align: left; display: inline-block; }
#js-status { font-weight: 600; }
`;

const APP_JS = `document.addEventListener("DOMContentLoaded", () => {
  const el = document.getElementById("js-status");
  if (el) {
    el.textContent = "JS 実行 OK（app.js が text/javascript で配信されました）";
    el.style.color = "#137333";
  }
});
`;

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72" width="72" height="72">
  <rect width="72" height="72" rx="16" fill="#1a73e8" />
  <path d="M20 36 L32 48 L52 24" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
</svg>
`;

/** パス（正規化済み: 先頭スラッシュ無し）→ ファイル内容 */
const DEMO_FILES: Record<string, string> = {
  "index.html": INDEX_HTML,
  "style.css": STYLE_CSS,
  "app.js": APP_JS,
  "assets/logo.svg": LOGO_SVG,
};

/** デモファイルの内容を返す。無ければ null。 */
export function getDemoFile(relativePath: string): string | null {
  const key = relativePath === "" ? "index.html" : relativePath;
  return DEMO_FILES[key] ?? null;
}
