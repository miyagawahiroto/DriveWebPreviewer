// プレビューセッションの型

/**
 * 1 回のプレビューを表すセッション。
 * Service Worker のスリープをまたいで必要なため chrome.storage.session に保存する。
 */
export interface PreviewSession {
  /** セッション識別子（プレビュー URL・キャッシュキーに含める） */
  sessionId: string;
  /** 配信元。drive は Drive API、demo はバンドル同梱サンプル（docs/DEMO.md） */
  source: "drive" | "demo";
  /** エントリ HTML が属する親フォルダの Drive フォルダ ID（demo は "__demo__"） */
  rootFolderId: string;
  /** エントリとなるファイル名（例: index.html） */
  entryFileName: string;
  /** セッション作成時刻（epoch ミリ秒） */
  createdAt: number;
}

/** デモセッションの rootFolderId */
export const DEMO_ROOT = "__demo__";
