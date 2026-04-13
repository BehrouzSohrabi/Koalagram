import { getRuntimeMode } from "./runtime.js";

const WEB_APP_VERSION_META_NAME = "koalagram-web-version";
const WEB_APP_SHELL_URL = new URL("../../index.html", import.meta.url);

let updateCheckPromise = null;

export const WEB_APP_UPDATE_CHECK_INTERVAL_MS = 60_000;

export function getCurrentWebAppVersion() {
  if (getRuntimeMode() !== "web" || typeof globalThis.document === "undefined") {
    return "";
  }

  return readVersionFromDocument(globalThis.document);
}

export async function detectWebAppUpdate() {
  if (getRuntimeMode() !== "web" || !getCurrentWebAppVersion()) {
    return null;
  }

  if (!updateCheckPromise) {
    updateCheckPromise = checkForUpdate().finally(() => {
      updateCheckPromise = null;
    });
  }

  return updateCheckPromise;
}

async function checkForUpdate() {
  const currentVersion = getCurrentWebAppVersion();
  const latestVersion = await fetchLatestWebAppVersion();

  if (!latestVersion || latestVersion === currentVersion) {
    return null;
  }

  return {
    currentVersion,
    latestVersion,
  };
}

async function fetchLatestWebAppVersion() {
  if (typeof globalThis.fetch !== "function") {
    return "";
  }

  const requestUrl = new URL(WEB_APP_SHELL_URL);
  requestUrl.searchParams.set("koalagram-update-check", String(Date.now()));

  try {
    const response = await globalThis.fetch(requestUrl, {
      cache: "no-store",
      headers: {
        Accept: "text/html",
      },
    });

    if (!response.ok) {
      return "";
    }

    return readVersionFromHtml(await response.text());
  } catch (_error) {
    return "";
  }
}

function readVersionFromHtml(html) {
  if (typeof globalThis.DOMParser !== "function") {
    return "";
  }

  const documentObject = new DOMParser().parseFromString(html, "text/html");
  return readVersionFromDocument(documentObject);
}

function readVersionFromDocument(documentObject) {
  const version = documentObject
    ?.querySelector(`meta[name="${WEB_APP_VERSION_META_NAME}"]`)
    ?.getAttribute("content");

  return String(version || "").trim();
}
