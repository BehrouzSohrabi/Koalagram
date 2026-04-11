import { ScaledroneObservableRoom } from "../lib/scaledrone-client.js";
import { DEFAULT_CHANNEL_ROOM, PANEL_PORT_NAME, STORAGE_KEY } from "../shared/constants.js";
import {
  buildClientData,
  currentSenderKey,
  extractMessageText,
  isChatMetaMessage,
  isHistorySyncRequest,
  isHistorySyncResponse,
  normalizeColor,
  normalizeStoredChannel,
  normalizeUserIdentity,
  resolveAvatarValue,
  resolveMemberIdentity,
} from "../shared/chat.js";
import { findStoredChannel, normalizeSettings } from "../shared/settings.js";
import { readStoredSettings } from "../shared/storage.js";

const monitorState = {
  client: null,
  fingerprint: "",
  panelPorts: new Set(),
  refreshTimer: null,
  unreadCount: 0,
};

async function enableActionSidePanel() {
  await chrome.sidePanel.setPanelBehavior({
    openPanelOnActionClick: true,
  });
}

function initializeBackground() {
  void enableActionSidePanel().catch(() => {
    // Ignore setup failures here; Chrome will surface API issues in extension logs.
  });
  void syncMonitorFromStorage();
}

initializeBackground();

chrome.runtime.onInstalled.addListener(() => {
  initializeBackground();
});

chrome.runtime.onStartup.addListener(() => {
  initializeBackground();
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PANEL_PORT_NAME) {
    return;
  }

  monitorState.panelPorts.add(port);
  clearUnreadAttention();
  stopMonitor({ preserveUnread: false });

  port.onDisconnect.addListener(() => {
    monitorState.panelPorts.delete(port);

    if (monitorState.panelPorts.size === 0) {
      void syncMonitorFromStorage();
    }
  });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[STORAGE_KEY]) {
    return;
  }

  void syncMonitorFromStorage();
});

async function syncMonitorFromStorage() {
  if (monitorState.panelPorts.size > 0) {
    clearUnreadAttention();
    stopMonitor({ preserveUnread: false });
    return;
  }

  const rawSettings = await readStoredSettings().catch(() => null);
  const settings = normalizeSettings(rawSettings);
  const nextContext = normalizeMonitorContext(settings);

  if (!nextContext) {
    clearUnreadAttention();
    stopMonitor({ preserveUnread: false });
    return;
  }

  const nextFingerprint = buildFingerprint(nextContext);

  if (
    monitorState.client
    && monitorState.fingerprint === nextFingerprint
    && ["connecting", "connected", "reconnecting"].includes(monitorState.client.state)
  ) {
    return;
  }

  if (monitorState.fingerprint !== nextFingerprint) {
    clearUnreadAttention();
  }

  stopMonitor({ preserveUnread: true });

  const client = new ScaledroneObservableRoom({
    channelId: nextContext.channel.channelId,
    roomName: DEFAULT_CHANNEL_ROOM,
    clientData: buildClientData(nextContext.user),
    historyCount: 0,
  });

  monitorState.client = client;
  monitorState.fingerprint = nextFingerprint;
  attachMonitorClient(client, nextContext, nextFingerprint);

  try {
    await client.connect();
  } catch (_error) {
    if (client === monitorState.client) {
      scheduleMonitorRefresh();
    }
  }
}

function attachMonitorClient(client, context, fingerprint) {
  client.addEventListener("message", (event) => {
    if (client !== monitorState.client || monitorState.fingerprint !== fingerprint || monitorState.panelPorts.size > 0) {
      return;
    }

    const packet = event.detail.message;

    if (!shouldCountAsUnread(packet, context, client)) {
      return;
    }

    monitorState.unreadCount += 1;
    syncActionBadge();
  });

  client.addEventListener("error", (event) => {
    if (client !== monitorState.client || monitorState.panelPorts.size > 0) {
      return;
    }

    if (event.detail?.fatal) {
      scheduleMonitorRefresh();
    }
  });
}

function shouldCountAsUnread(packet, context, client) {
  const payload = packet?.data;

  if (isChatMetaMessage(payload) || isHistorySyncRequest(payload) || isHistorySyncResponse(payload)) {
    return false;
  }

  const text = extractMessageText(payload);

  if (!text) {
    return false;
  }

  return !isOwnMessage(packet, payload, context, client);
}

function isOwnMessage(packet, payload, context, client) {
  if (payload?.senderDeviceId && payload.senderDeviceId === context.installationId) {
    return true;
  }

  if (packet?.clientId && packet.clientId === client.clientId) {
    return true;
  }

  if (payload?.senderKey && payload.senderKey === currentSenderKey(context.user)) {
    return true;
  }

  const memberIdentity = resolveMemberIdentity(packet?.member);
  const senderName = payload?.senderName?.trim() || memberIdentity.displayName;
  const avatar = resolveAvatarValue(payload?.avatarUrl || payload?.avatar, senderName, memberIdentity.avatarUrl || memberIdentity.avatar);
  const color = normalizeColor(payload?.color || memberIdentity.color);

  return (
    senderName === context.user.displayName &&
    avatar === resolveAvatarValue(context.user.avatarUrl, context.user.displayName) &&
    color === normalizeColor(context.user.color)
  );
}

function stopMonitor({ preserveUnread } = { preserveUnread: true }) {
  clearMonitorRefresh();

  if (monitorState.client) {
    const activeClient = monitorState.client;
    monitorState.client = null;
    monitorState.fingerprint = "";
    activeClient.close();
  } else {
    monitorState.fingerprint = "";
  }

  if (!preserveUnread) {
    monitorState.unreadCount = 0;
  }

  syncActionBadge();
}

function scheduleMonitorRefresh(delayMs = 4000) {
  if (monitorState.refreshTimer || monitorState.panelPorts.size > 0) {
    return;
  }

  monitorState.refreshTimer = globalThis.setTimeout(() => {
    monitorState.refreshTimer = null;
    void syncMonitorFromStorage();
  }, delayMs);
}

function clearMonitorRefresh() {
  if (!monitorState.refreshTimer) {
    return;
  }

  globalThis.clearTimeout(monitorState.refreshTimer);
  monitorState.refreshTimer = null;
}

function clearUnreadAttention() {
  monitorState.unreadCount = 0;
  syncActionBadge();
}

function syncActionBadge() {
  const text = monitorState.unreadCount > 0
    ? (monitorState.unreadCount > 99 ? "99+" : String(monitorState.unreadCount))
    : "";
  const title = monitorState.unreadCount > 0
    ? `Koalagram (${monitorState.unreadCount} unread)`
    : "Open Koalagram";

  void chrome.action.setBadgeBackgroundColor({ color: "#d93025" }).catch(() => {});
  void chrome.action.setBadgeText({ text }).catch(() => {});
  void chrome.action.setTitle({ title }).catch(() => {});
}

function normalizeMonitorContext(settings) {
  const user = normalizeUserIdentity(settings?.user);
  const lastOpenedChannel = settings?.lastOpenedChat?.channelId
    ? (findStoredChannel(settings.channels, settings.lastOpenedChat.channelId) || settings.lastOpenedChat)
    : null;
  const channel = normalizeStoredChannel(lastOpenedChannel || {});
  const installationId = typeof settings?.installationId === "string"
    ? settings.installationId.trim().slice(0, 80)
    : "";

  if (!user.displayName || !channel.channelId || !installationId) {
    return null;
  }

  return {
    installationId,
    user,
    channel,
  };
}

function buildFingerprint(context) {
  return [
    context.installationId,
    context.channel.channelId,
    context.channel.chatName,
    context.user.displayName,
    context.user.avatarUrl,
    context.user.color,
  ].join("|");
}
