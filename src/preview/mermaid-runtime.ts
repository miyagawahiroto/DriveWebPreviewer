// プレビュータブ内で動く Mermaid 描画ランタイム（docs/MERMAID.md）
// Markdown→HTML 変換（lib/markdown.ts）が出力した <pre class="mermaid"> を図に置換する。
// 拡張オリジン（chrome-extension://）の同梱スクリプトとして assets/ から読み込まれる。
// SW には DOM が無いためサーバー側描画はできず、描画はここ（ブラウザ側）で行う。

import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  // 拡張オリジンのページなので外部リンク等の副作用は抑えつつ通常描画する。
  securityLevel: "strict",
  theme: "default",
});

async function renderAll(): Promise<void> {
  const nodes = document.querySelectorAll<HTMLElement>("pre.mermaid");
  if (nodes.length === 0) return;
  try {
    // 失敗ブロックがあってもページ全体は壊さない（run は要素単位でエラー表示）。
    await mermaid.run({ nodes: Array.from(nodes) });
  } catch (err) {
    // 予期せぬ失敗時もプレースホルダ（図ソースの pre）はテキストとして残る。
    console.error("[mermaid] render failed:", err);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void renderAll());
} else {
  void renderAll();
}
