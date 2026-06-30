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

/** ある選択要素から Drive ファイル ID（data-id）を、自身・子孫・祖先の順に探す。 */
function extractDataId(el: Element): string | null {
  if (el.matches("[data-id]")) return el.getAttribute("data-id");
  const child = el.querySelector("[data-id]");
  if (child) return child.getAttribute("data-id");
  const ancestor = el.closest("[data-id]");
  if (ancestor) return ancestor.getAttribute("data-id");
  return null;
}

/**
 * 一覧で「選択中」のアイテムの Drive ファイル ID を DOM から推定する（best-effort）。
 * Drive はビュー（マイドライブ / フォルダ / ホーム / 履歴 / 共有アイテム）ごとに
 * 選択行のマークアップが異なるため、複数のセレクタ・祖先/子孫探索でフォールバックする。
 * Drive の DOM 構造は変化しうるため、取得できなければ null を返す（壊れたらここを直す）。
 */
function selectedFileIdFromDom(): string | null {
  const folderId = folderIdFromUrl();
  // 選択状態を表しうるセレクタ群（ビューにより異なる）を順に試す。
  const selectors = [
    '[aria-selected="true"]',
    '[data-is-selected="true"]',
    ".a-s-fa-Ha-pa", // グリッド表示の選択クラス（壊れやすい）
    '[jsname][aria-selected="true"]',
  ];
  for (const selector of selectors) {
    const candidates = document.querySelectorAll(selector);
    for (const el of candidates) {
      const id = extractDataId(el);
      // フォルダ自身の id（URL の folderId）と一致する場合は選択ではないので除外
      if (id && id !== folderId) return id;
    }
  }
  return null;
}

/**
 * プレビュー対象を取得する。優先順位：
 * 1. ファイルを開いている（URL: /file/d/<id>）→ そのファイル
 * 2. 一覧で特定ファイルを選択中（DOM）→ その選択ファイル（index.html 以外でも可）。
 *    ホーム（/drive/home）・履歴（/drive/recent）など URL にフォルダ ID が無いビューでも、
 *    選択さえ取れれば単体プレビューできる（親フォルダ ID は background が逆引きする）。
 * 3. フォルダのみ → index.html を既定エントリ
 * 親フォルダ ID・ファイル名は、fileId がある場合は background が Drive API で逆引きする。
 */
function collectTarget(): { fileId: string; parentId: string; fileName: string } | null {
  const openedFileId = fileIdFromUrl();
  if (openedFileId) {
    return { fileId: openedFileId, parentId: "", fileName: "" };
  }

  const folderId = folderIdFromUrl();
  const selectedFileId = selectedFileIdFromDom();
  if (selectedFileId) {
    return { fileId: selectedFileId, parentId: folderId ?? "", fileName: "" };
  }

  if (folderId) {
    // fileName は空にして、エントリ（index.html → html → md → txt）は background に判定させる
    return { fileId: "", parentId: folderId, fileName: "" };
  }
  return null;
}

function startPreview(): void {
  // 拡張をリロード／更新すると、開いたままのタブに残った古いコンテンツスクリプトは
  // 拡張コンテキストを失い chrome.runtime が undefined になる。再読込を促して終了する。
  if (!chrome.runtime?.id) {
    alert(
      "拡張機能が更新されました。\nこの Drive のページを再読み込み（F5）してから、もう一度お試しください。",
    );
    return;
  }
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
