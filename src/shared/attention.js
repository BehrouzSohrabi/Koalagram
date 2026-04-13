import { shortChannelId } from "./chat.js";
import { canSetExtensionActionBadge, getRuntimeMode } from "./runtime.js";

const APP_NAME = "Koalagram";
const APP_ICON_URL = new URL("../assets/icon.png", import.meta.url).href;
const APP_BADGE_ICON_URL = new URL("../assets/web-app-manifest-192x192.png", import.meta.url).href;
const WEB_NOTIFICATION_TAG = "koalagram:unread";
const WEB_NOTIFICATION_WORKER_URL = new URL("../../webapp-service-worker.js", import.meta.url);

let webNotificationRegistrationPromise = null;
let activeWindowNotification = null;

export function buildUnreadAttentionTitle(unreadCount) {
  return unreadCount > 0
    ? `${APP_NAME} (${unreadCount} unread)`
    : `Open ${APP_NAME}`;
}

export async function syncUnreadAttention(unreadCount) {
  syncDocumentTitle(unreadCount);
  syncExtensionBadge(unreadCount);
  await syncWebAppBadge(unreadCount);
}

export async function prepareWebNotifications({ promptIfNeeded = false } = {}) {
  if (getRuntimeMode() !== "web") {
    return "unsupported";
  }

  if (typeof globalThis.Notification !== "function") {
    return "unsupported";
  }

  if (promptIfNeeded && Notification.permission === "default") {
    try {
      const permission = await Notification.requestPermission();
      await getWebNotificationRegistration();
      return permission;
    } catch (_error) {
      return Notification.permission;
    }
  }

  await getWebNotificationRegistration();
  return Notification.permission;
}

export async function showUnreadNotification({ unreadCount = 0, channelId = "", chatName = "", senderName = "Guest", text = "" } = {}) {
  if (getRuntimeMode() !== "web" || typeof globalThis.window === "undefined" || typeof globalThis.Notification !== "function") {
    return false;
  }

  if (Notification.permission !== "granted") {
    return false;
  }

  const registration = await getWebNotificationRegistration();
  const title = chatName || (channelId ? shortChannelId(channelId) : APP_NAME);
  const body = buildNotificationBody({ unreadCount, senderName, text });
  const options = {
    badge: APP_BADGE_ICON_URL,
    body,
    data: {
      url: globalThis.location?.href || "./",
    },
    icon: APP_ICON_URL,
    renotify: true,
    tag: WEB_NOTIFICATION_TAG,
  };

  try {
    if (registration?.showNotification) {
      await registration.showNotification(title, options);
      return true;
    }

    if (activeWindowNotification) {
      activeWindowNotification.close();
    }

    const notification = new Notification(title, options);
    notification.onclick = () => {
      notification.close();
      void globalThis.window.focus?.();
    };
    activeWindowNotification = notification;
    return true;
  } catch (_error) {
    return false;
  }
}

export async function clearUnreadNotifications() {
  if (activeWindowNotification) {
    activeWindowNotification.close();
    activeWindowNotification = null;
  }

  const registration = await getWebNotificationRegistration();

  if (!registration?.getNotifications) {
    return;
  }

  try {
    const notifications = await registration.getNotifications({ tag: WEB_NOTIFICATION_TAG });

    for (const notification of notifications) {
      notification.close();
    }
  } catch (_error) {
    // Ignore notification cleanup failures.
  }
}

async function getWebNotificationRegistration() {
  if (getRuntimeMode() !== "web" || typeof globalThis.window === "undefined" || !globalThis.navigator?.serviceWorker) {
    return null;
  }

  if (!webNotificationRegistrationPromise) {
    webNotificationRegistrationPromise = globalThis.navigator.serviceWorker
      .register(WEB_NOTIFICATION_WORKER_URL)
      .then(async (registration) => {
        try {
          return await globalThis.navigator.serviceWorker.ready;
        } catch (_error) {
          return registration;
        }
      })
      .catch(() => null);
  }

  return webNotificationRegistrationPromise;
}

function syncDocumentTitle(unreadCount) {
  if (getRuntimeMode() !== "web" || typeof globalThis.document === "undefined") {
    return;
  }

  globalThis.document.title = unreadCount > 0
    ? `(${unreadCount}) ${APP_NAME}`
    : APP_NAME;
}

function syncExtensionBadge(unreadCount) {
  if (!canSetExtensionActionBadge()) {
    return;
  }

  const text = unreadCount > 0
    ? (unreadCount > 99 ? "99+" : String(unreadCount))
    : "";

  void chrome.action.setBadgeBackgroundColor({ color: "#d93025" }).catch(() => {});
  void chrome.action.setBadgeText({ text }).catch(() => {});
  void chrome.action.setTitle({ title: buildUnreadAttentionTitle(unreadCount) }).catch(() => {});
}

async function syncWebAppBadge(unreadCount) {
  if (getRuntimeMode() !== "web") {
    return;
  }

  const navigatorObject = globalThis.navigator;

  if (!navigatorObject) {
    return;
  }

  try {
    if (unreadCount > 0 && typeof navigatorObject.setAppBadge === "function") {
      await navigatorObject.setAppBadge(unreadCount);
      return;
    }

    if (unreadCount === 0 && typeof navigatorObject.clearAppBadge === "function") {
      await navigatorObject.clearAppBadge();
    }
  } catch (_error) {
    // Ignore unsupported or unavailable app badge APIs.
  }
}

function buildNotificationBody({ unreadCount, senderName, text }) {
  const prefix = unreadCount > 1 ? `${unreadCount} unread. ` : "";
  const sender = String(senderName || "Guest").trim() || "Guest";
  const message = String(text || "").trim().replace(/\s+/g, " ");
  const preview = message.length > 140 ? `${message.slice(0, 137)}...` : message;

  return `${prefix}${sender}: ${preview}`;
}
