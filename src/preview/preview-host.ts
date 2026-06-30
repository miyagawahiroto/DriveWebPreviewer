// ホストページのブートストラップ（docs/SANDBOX_PREVIEW.md）
// 拡張ページ（chrome-extension://）として動き、SW が埋め込んだ元 HTML を読み取り、
// サンドボックス iframe へ postMessage で渡して描画させる。
// 'self' の外部スクリプトとして読み込まれる（拡張ページ CSP で許可される唯一の形）。

const DOC_ELEMENT_ID = "dwp-doc";
const FRAME_ELEMENT_ID = "dwp-frame";

function bootstrap(): void {
  const docEl = document.getElementById(DOC_ELEMENT_ID);
  const frame = document.getElementById(FRAME_ELEMENT_ID) as HTMLIFrameElement | null;
  if (!docEl || !frame) return;

  // 元 HTML は JSON 文字列として埋め込まれている（<script type="application/json">）
  let html = "";
  try {
    html = JSON.parse(docEl.textContent ?? "\"\"");
  } catch {
    html = "";
  }

  // 二重描画（document.write の複数回実行）を防ぐ
  let posted = false;
  const post = (): void => {
    if (posted) return;
    posted = true;
    frame.contentWindow?.postMessage({ type: "dwp_render", html }, "*");
  };

  // サンドボックス iframe は不透明オリジンのため contentDocument を参照すると
  // SecurityError になる（?. でも throw は防げない）。参照せず load イベントで送る。
  // preview-host.js は module（defer 相当）で iframe より後に実行されるため、
  // この時点で iframe は未ロードが通常。load を待てば描画指示を確実に届けられる。
  frame.addEventListener("load", post, { once: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
} else {
  bootstrap();
}
