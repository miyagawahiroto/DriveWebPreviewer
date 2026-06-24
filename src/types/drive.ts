// Google Drive API v3 関連の型

/** files.list / files.get で取得するファイル（必要項目のみ） */
export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  /** RFC 3339 形式の更新日時（同名解決に使用） */
  modifiedTime?: string;
  /** RFC 3339 形式の作成日時（同名解決のフォールバック） */
  createdTime?: string;
}

/** files.list のレスポンス */
export interface DriveListResponse {
  files: DriveFile[];
  nextPageToken?: string;
  incompleteSearch?: boolean;
}

/** getMedia の戻り値 */
export interface DriveMedia {
  bytes: ArrayBuffer;
  mimeType: string;
}

/** Drive のフォルダ mimeType */
export const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";
