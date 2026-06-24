// Drive 画面に注入されるコンテンツスクリプト
// 責務は docs/UI.md を参照。
// 注意: Drive の DOM 構造は変化しうるため、fileId / parentId の取得は
// 複数手段のフォールバックで行い、壊れたらこのファイルを直す。

import type { StartPreviewMessage, StartPreviewResponse } from "../types/message.js";

const BUTTON_ID = "dwp-preview-button";

/** 現在の URL から fileId を推定する（/file/d/<id>/ 形式）。 */
function fileIdFromUrl(): string | null {
  const m = location.pathname.match(/\/file\/d\/([^/]+)/);
  return m ? m[1] : null;
}

/** 現在の URL から開いているフォルダ ID を推定する（/folders/<id> 形式）。 */
function folderIdFromUrl(): string | null {
  const m = location.pathname.match(/\/folders\/([^/?#]+)/);
  return m ? m[1] : null;
}

/**
 * プレビュー対象の情報を取得する。
 * - フォルダを開いている場合: 親フォルダ ID を URL から取得し、エントリは index.html と仮定
 * - ファイルを開いている場合: ファイル ID のみ渡し、親フォルダ・ファイル名は background が
 *   Drive API（files.get の parents/name）で逆引きする
 * いずれも空文字は「未取得」を表す。
 */
function collectTarget(): { fileId: string; parentId: string; fileName: string } | null {
  const folderId = folderIdFromUrl();
  if (folderId) {
    return { fileId: "", parentId: folderId, fileName: "index.html" };
  }
  const fileId = fileIdFromUrl();
  if (fileId) {
    return { fileId, parentId: "", fileName: "" };
  }
  return null;
}

function startPreview(): void {
  const target = collectTarget();
  if (!target) {
    alert(
      "プレビュー対象を特定できませんでした。\nファイルを開いた状態、またはフォルダ内で実行してください。",
    );
    return;
  }
  const message: StartPreviewMessage = {
    type: "start_preview",
    fileId: target.fileId,
    parentId: target.parentId,
    fileName: target.fileName,
  };
  chrome.runtime.sendMessage(message, (res: StartPreviewResponse | undefined) => {
    if (chrome.runtime.lastError || !res?.ok) {
      alert(`プレビューの開始に失敗しました: ${res?.error ?? chrome.runtime.lastError?.message ?? "不明なエラー"}`);
    }
  });
}

/** 画面右下にプレビュー起動ボタンを注入する（最小実装）。 */
function injectButton(): void {
  if (document.getElementById(BUTTON_ID)) return;
  const btn = document.createElement("button");
  btn.id = BUTTON_ID;
  btn.textContent = "Web プレビュー";
  Object.assign(btn.style, {
    position: "fixed",
    right: "16px",
    bottom: "16px",
    zIndex: "2147483647",
    padding: "10px 16px",
    borderRadius: "8px",
    border: "none",
    background: "#1a73e8",
    color: "#fff",
    fontSize: "13px",
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
  } satisfies Partial<CSSStyleDeclaration>);
  btn.addEventListener("click", startPreview);
  document.body.appendChild(btn);
}

injectButton();
