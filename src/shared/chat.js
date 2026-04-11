import { DEFAULT_ACCENT_COLOR } from "./constants.js";

export function normalizeUserIdentity(user) {
  return {
    displayName: String(user?.displayName || user?.name || "").trim().slice(0, 32),
    avatarUrl: normalizeAvatarUrl(user?.avatarUrl || user?.avatar),
    color: normalizeColor(user?.color),
  };
}

export function normalizeStoredChannel(channel, fallback = {}) {
  return {
    channelId: String(channel?.channelId || fallback.channelId || "").trim().replace(/\s+/g, ""),
    chatName: String(channel?.chatName || fallback.chatName || "").trim().slice(0, 48),
    accentColor: normalizeColor(channel?.accentColor || channel?.color || fallback.accentColor),
    historyCount: clampHistory(channel?.historyCount ?? fallback.historyCount),
    lastJoinedAt: typeof channel?.lastJoinedAt === "number"
      ? channel.lastJoinedAt
      : (typeof fallback.lastJoinedAt === "number" ? fallback.lastJoinedAt : Date.now()),
  };
}

export function normalizeJoinDraft(joinDraft) {
  return {
    channelId: String(joinDraft?.channelId || "").trim().replace(/\s+/g, ""),
  };
}

export function clampHistory(value) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 50;
  }

  return Math.min(parsed, 100);
}

export function buildClientData(user) {
  const identity = normalizeUserIdentity(user);

  return {
    name: identity.displayName,
    avatarUrl: identity.avatarUrl,
    avatar: resolveAvatarValue(identity.avatarUrl, identity.displayName),
    color: identity.color,
  };
}

export function currentSenderKey(user) {
  const identity = normalizeUserIdentity(user);

  if (!identity.displayName) {
    return "";
  }

  return [
    identity.displayName.trim().toLowerCase(),
    resolveAvatarValue(identity.avatarUrl, identity.displayName),
    identity.color,
  ].join("|");
}

export function resolveMemberIdentity(member) {
  const source = member?.client_data || member?.clientData || {};
  const displayName = String(source.name || "Guest").trim() || "Guest";
  const avatarUrl = normalizeAvatarUrl(source.avatarUrl || source.avatar);

  return {
    displayName,
    avatarUrl,
    avatar: resolveAvatarValue(avatarUrl || source.avatar, displayName),
    color: normalizeColor(source.color),
  };
}

export function normalizeAvatarUrl(value) {
  const url = String(value || "").trim();

  if (/^https?:\/\//i.test(url) || /^data:image\//i.test(url)) {
    return url;
  }

  return "";
}

export function isAvatarUrl(value) {
  return Boolean(normalizeAvatarUrl(value));
}

export function avatarLetter(text) {
  const trimmed = String(text || "").trim();
  return trimmed ? trimmed[0].toUpperCase() : "K";
}

export function resolveAvatarValue(primaryAvatar, displayName, fallbackAvatar = "") {
  const avatarUrl = normalizeAvatarUrl(primaryAvatar) || normalizeAvatarUrl(fallbackAvatar);

  if (avatarUrl) {
    return avatarUrl;
  }

  return avatarLetter(displayName || fallbackAvatar);
}

export function normalizeColor(color) {
  return /^#[0-9a-f]{6}$/i.test(String(color || "")) ? color : DEFAULT_ACCENT_COLOR;
}

export function shortChannelId(channelId) {
  if (!channelId) {
    return "";
  }

  if (channelId.length <= 10) {
    return channelId;
  }

  return `${channelId.slice(0, 4)}...${channelId.slice(-4)}`;
}

export function isChatMetaMessage(payload) {
  return ["chat-meta", "room-meta"].includes(payload?.type)
    && (typeof payload?.chatName === "string" || typeof payload?.accentColor === "string" || typeof payload?.color === "string");
}

export function isHistorySyncRequest(payload) {
  return payload?.type === "history-sync-request" && typeof payload?.requestId === "string";
}

export function isHistorySyncResponse(payload) {
  return payload?.type === "history-sync-response" && typeof payload?.requestId === "string";
}

export function extractMessageText(payload) {
  if (typeof payload === "string") {
    return payload.trim();
  }

  if (!payload || typeof payload !== "object") {
    return "";
  }

  return typeof payload.text === "string" ? payload.text.trim() : "";
}

export function normalizeProfileDraft(profile) {
  return normalizeUserIdentity(profile);
}

export function resolveMemberProfile(member) {
  const identity = resolveMemberIdentity(member);

  return {
    name: identity.displayName,
    avatar: identity.avatar,
    avatarUrl: identity.avatarUrl,
    color: identity.color,
  };
}

export function resolvedAvatar(primaryAvatar, displayName, fallbackAvatar = "") {
  return resolveAvatarValue(primaryAvatar, displayName, fallbackAvatar);
}

export function initials(text) {
  return avatarLetter(text);
}

export function isRoomMetaMessage(payload) {
  return isChatMetaMessage(payload);
}
