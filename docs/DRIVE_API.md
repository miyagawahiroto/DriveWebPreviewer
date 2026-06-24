# DRIVE_API - Google Drive API 連携

`lib/drive-api.ts` の責務と、ファイル検索・取得・同名ファイル解決ルールを定義する。

## 1. 利用エンドポイント（Drive API v3）

| 用途 | エンドポイント |
|------|---------------|
| フォルダ内ファイル検索 | `GET https://www.googleapis.com/drive/v3/files` |
| ファイル本体取得 | `GET https://www.googleapis.com/drive/v3/files/{fileId}?alt=media` |

`Authorization: Bearer <token>`（`auth.getToken()` で取得）を付与する。

## 2. ファイル検索（findFile）

指定フォルダ直下の、指定名のファイルを検索する。

```
findFile(parentFolderId, name): Promise<DriveFile | null>
```

クエリ（`q` パラメータ）:

```
'<parentFolderId>' in parents and name = '<name>' and trashed = false
```

リクエストパラメータ:

| パラメータ | 値 | 意図 |
|-----------|----|------|
| `q` | 上記 | 親フォルダ＋名前で絞る |
| `fields` | `files(id,name,mimeType,modifiedTime,createdTime)` | 必要項目のみ |
| `orderBy` | `modifiedTime desc` | 同名重複時に最新を先頭へ |
| `pageSize` | `10` | 同名は通常少数。先頭を採用 |
| `spaces` | `drive` | |

### 同名ファイル解決ルール（CLAUDE.md 準拠）

Drive は同一フォルダに同名ファイルを複数作成できる。複数ヒット時は：

1. **`modifiedTime`（更新日時）が最新**のものを採用
2. `modifiedTime` が同一なら `createdTime`（作成日時）が最新のものを採用

`orderBy=modifiedTime desc` で先頭を採るのを基本とし、`createdTime` 比較はクライアント側フォールバックで担保する。

名前に含まれる `'`（シングルクォート）は `\'` にエスケープする。

## 3. ファイル本体取得（getMedia）

```
getMedia(fileId): Promise<{ bytes: ArrayBuffer; mimeType: string }>
```

- `files/{fileId}?alt=media` を `fetch` し `response.arrayBuffer()` を返す
- `mimeType` は検索時に得た値を渡す（無ければ別途 `files/{fileId}?fields=mimeType` で取得）
- テキスト・バイナリを問わず `ArrayBuffer` で扱い、文字化けを避ける

## 3.5 ファイルメタ取得（getFileMeta）

ファイルを開いた状態からのプレビューで、親フォルダ ID とエントリ名を逆引きする。

```
getFileMeta(fileId): Promise<{ name: string; parents: string[] }>
```

- `files/{fileId}?fields=id,name,parents` を取得
- `parents[0]` をプレビューのルートフォルダ、`name` をエントリファイル名として使う

## 4. フォルダ取得（listFolder）

パス解決で階層を辿るため、サブフォルダ ID を引く：

```
findFolder(parentFolderId, folderName): Promise<DriveFile | null>
```

クエリに `mimeType = 'application/vnd.google-apps.folder'` を加える。同名解決ルールは 2 と同じ。

## 5. エラーハンドリング

| HTTP | 意味 | 呼び出し側の扱い |
|------|------|----------------|
| 401 | トークン無効・失効 | `auth.invalidate()` → 1 度だけ再取得しリトライ。再失敗で 401 を上位へ |
| 403 | 権限なし / レート超過 | 上位で 403 を返す（レート超過は将来リトライ検討） |
| 404 | ファイルなし | `null` を返す |
| 5xx | サーバ側障害 | 上位で 502 を返す |

## 6. 関連

`AUTH.md` / `PATH_RESOLUTION.md` / `SERVICE_WORKER.md`
