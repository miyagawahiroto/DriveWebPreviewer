// 設定ページのロジック（docs/UI.md）。

import { clearAll } from "../lib/cache.js";
import { signOut } from "../lib/auth.js";

const clearBtn = document.getElementById("clear-cache") as HTMLButtonElement;
const clearMsg = document.getElementById("clear-msg") as HTMLSpanElement;
const signOutBtn = document.getElementById("sign-out") as HTMLButtonElement;
const signOutMsg = document.getElementById("signout-msg") as HTMLSpanElement;

clearBtn.addEventListener("click", async () => {
  clearBtn.disabled = true;
  try {
    await clearAll();
    clearMsg.hidden = false;
  } finally {
    clearBtn.disabled = false;
  }
});

signOutBtn.addEventListener("click", async () => {
  signOutBtn.disabled = true;
  try {
    await signOut();
    signOutMsg.hidden = false;
  } finally {
    signOutBtn.disabled = false;
  }
});
