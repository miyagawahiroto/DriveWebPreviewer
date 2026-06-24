// ポップアップ UI のロジック
// 認証状態の表示とサインインを行う（docs/UI.md）。

import { getToken, isSignedIn } from "../lib/auth.js";
import type { StartDemoMessage, StartPreviewResponse } from "../types/message.js";

const statusEl = document.getElementById("status") as HTMLDivElement;
const signinBtn = document.getElementById("signin") as HTMLButtonElement;
const demoBtn = document.getElementById("demo") as HTMLButtonElement;
const optionsLink = document.getElementById("open-options") as HTMLAnchorElement;

function renderStatus(signedIn: boolean): void {
  if (signedIn) {
    statusEl.innerHTML = '<span class="signed-in">サインイン済み</span>';
    signinBtn.style.display = "none";
  } else {
    statusEl.innerHTML = '<span class="signed-out">未サインイン</span>';
    signinBtn.style.display = "block";
  }
}

async function refresh(): Promise<void> {
  renderStatus(await isSignedIn());
}

signinBtn.addEventListener("click", async () => {
  signinBtn.disabled = true;
  try {
    await getToken(true); // 対話的サインイン
    await refresh();
  } catch (err) {
    statusEl.textContent = `サインインに失敗しました: ${String(err)}`;
  } finally {
    signinBtn.disabled = false;
  }
});

demoBtn.addEventListener("click", () => {
  const message: StartDemoMessage = { type: "start_demo" };
  chrome.runtime.sendMessage(message, (res: StartPreviewResponse | undefined) => {
    if (chrome.runtime.lastError || !res?.ok) {
      statusEl.textContent = `デモの起動に失敗しました: ${res?.error ?? chrome.runtime.lastError?.message ?? "不明なエラー"}`;
    }
  });
});

optionsLink.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

void refresh();
