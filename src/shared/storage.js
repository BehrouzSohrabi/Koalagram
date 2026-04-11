import { STORAGE_KEY } from "./constants.js";
import { hasExtensionStorage } from "./runtime.js";

export async function readStoredSettings({ allowLocalFallback = false } = {}) {
  if (allowLocalFallback && !hasExtensionStorage()) {
    const fallbackValue = window.localStorage.getItem(STORAGE_KEY);
    return fallbackValue ? JSON.parse(fallbackValue) : null;
  }

  return new Promise((resolve, reject) => {
    chrome.storage.local.get([STORAGE_KEY], (items) => {
      if (chrome.runtime?.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(items[STORAGE_KEY] || null);
    });
  });
}

export async function writeStoredSettings(value, { allowLocalFallback = false } = {}) {
  if (allowLocalFallback && !hasExtensionStorage()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    return;
  }

  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [STORAGE_KEY]: value }, () => {
      if (chrome.runtime?.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve();
    });
  });
}
