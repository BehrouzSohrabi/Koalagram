import {
  normalizeJoinDraft,
  normalizeColor,
  normalizeStoredChannel,
  normalizeUserIdentity,
  resolveAvatarValue,
} from "./chat.js";

export const MAX_STORED_CHANNELS = 8;
export const MAX_STORED_MESSAGES = 400;

export const DEFAULT_USER = {
  displayName: "",
  avatarUrl: "",
  color: "#4c8df6",
};

export function normalizeStoredRecord(record) {
  if (!record || typeof record !== "object") {
    return null;
  }

  const type = ["chat-meta", "room-meta"].includes(record.type) ? "chat-meta" : "chat-message";
  const messageId = String(record.messageId || "").trim();
  const ts = typeof record.ts === "number"
    ? (record.ts > 1_000_000_000_000 ? record.ts : record.ts * 1000)
    : Date.now();

  if (!messageId) {
    return null;
  }

  if (type === "chat-meta") {
    const chatName = String(record.chatName || "").trim().slice(0, 48);

    if (!chatName && !record.accentColor && !record.color) {
      return null;
    }

    return {
      type,
      messageId,
      chatName,
      accentColor: normalizeColor(record.accentColor || record.color),
      senderName: String(record.senderName || "").trim().slice(0, 32),
      senderKey: String(record.senderKey || "").trim().slice(0, 80),
      senderDeviceId: String(record.senderDeviceId || "").trim().slice(0, 80),
      avatar: resolveAvatarValue(record.avatarUrl || record.avatar, record.senderName),
      avatarUrl: String(record.avatarUrl || "").trim(),
      ts,
    };
  }

  const text = typeof record.text === "string" ? record.text.trim() : "";

  if (!text) {
    return null;
  }

  return {
    type,
    messageId,
    text,
    senderName: String(record.senderName || "Guest").trim().slice(0, 32) || "Guest",
    senderKey: String(record.senderKey || "").trim().slice(0, 80),
    senderDeviceId: String(record.senderDeviceId || "").trim().slice(0, 80),
    avatar: resolveAvatarValue(record.avatarUrl || record.avatar, record.senderName),
    avatarUrl: String(record.avatarUrl || "").trim(),
    color: normalizeColor(record.color),
    ts,
  };
}

export function normalizeChannelHistory(channelHistory) {
  if (!channelHistory || typeof channelHistory !== "object") {
    return {};
  }

  const normalized = {};

  for (const [channelId, archive] of Object.entries(channelHistory)) {
    if (!channelId) {
      continue;
    }

    const records = Array.isArray(archive?.messages)
      ? archive.messages.map(normalizeStoredRecord).filter(Boolean).slice(-MAX_STORED_MESSAGES)
      : [];
    const latestMeta = findLatestChatMeta(records);

    normalized[channelId] = {
      channelId,
      chatName: String(archive?.chatName || latestMeta?.chatName || "").trim().slice(0, 48),
      accentColor: normalizeColor(archive?.accentColor || latestMeta?.accentColor),
      updatedAt: typeof archive?.updatedAt === "number" ? archive.updatedAt : Date.now(),
      messages: records,
    };
  }

  return normalized;
}

export function normalizeSettings(rawSettings) {
  const channelHistory = normalizeChannelHistory(rawSettings?.channelHistory);
  const channels = normalizeStoredChannels(rawSettings, channelHistory);
  const lastOpenedChat = resolveLastOpenedChat(rawSettings, channels);
  const userSource = rawSettings?.user || rawSettings?.profileDraft || resolveLegacyProfile(rawSettings);

  return {
    installationId: typeof rawSettings?.installationId === "string" && rawSettings.installationId.trim()
      ? rawSettings.installationId.trim().slice(0, 80)
      : crypto.randomUUID(),
    user: normalizeUserIdentity(userSource || DEFAULT_USER),
    joinDraft: normalizeJoinDraft(rawSettings?.joinDraft || {}),
    lastOpenedChat,
    channels,
    channelHistory,
    preferences: {
      theme: rawSettings?.preferences?.theme === "dusk" ? "dusk" : "paper",
      mutePresenceNotes: Boolean(rawSettings?.preferences?.mutePresenceNotes),
    },
  };
}

export function upsertStoredChannel(existingChannels, channel) {
  const normalized = normalizeStoredChannel(channel);
  const withoutExisting = existingChannels.filter((item) => item.channelId !== normalized.channelId);
  return [normalized, ...withoutExisting]
    .sort((left, right) => right.lastJoinedAt - left.lastJoinedAt)
    .slice(0, MAX_STORED_CHANNELS);
}

export function findStoredChannel(channels, channelId) {
  return channels.find((item) => item.channelId === channelId) || null;
}

function normalizeStoredChannels(rawSettings, channelHistory) {
  const channels = new Map();
  const addChannel = (value, fallback = {}) => {
    const channel = normalizeStoredChannel(value, fallback);

    if (!channel.channelId) {
      return;
    }

    const existing = channels.get(channel.channelId) || {};
    channels.set(channel.channelId, normalizeStoredChannel(channel, existing));
  };

  if (Array.isArray(rawSettings?.channels)) {
    for (const channel of rawSettings.channels) {
      addChannel(channel);
    }
  }

  if (Array.isArray(rawSettings?.recentChats)) {
    for (const channel of rawSettings.recentChats) {
      addChannel(channel);
    }
  }

  if (rawSettings?.joinDraft?.channelId) {
    addChannel(rawSettings.joinDraft, { lastJoinedAt: Date.now() });
  }

  if (rawSettings?.lastOpenedChat?.channelId) {
    addChannel(rawSettings.lastOpenedChat, { lastJoinedAt: Date.now() });
  }

  for (const archive of Object.values(channelHistory)) {
    addChannel({
      channelId: archive.channelId,
      chatName: archive.chatName,
      accentColor: archive.accentColor,
      lastJoinedAt: archive.updatedAt,
    });
  }

  return Array.from(channels.values())
    .sort((left, right) => right.lastJoinedAt - left.lastJoinedAt)
    .slice(0, MAX_STORED_CHANNELS);
}

function resolveLastOpenedChat(rawSettings, channels) {
  if (!rawSettings?.lastOpenedChat?.channelId) {
    return null;
  }

  return findStoredChannel(channels, rawSettings.lastOpenedChat.channelId)
    || normalizeStoredChannel(rawSettings.lastOpenedChat);
}

function resolveLegacyProfile(rawSettings) {
  if (Array.isArray(rawSettings?.profilePresets) && rawSettings.profilePresets.length > 0) {
    const activeProfile = rawSettings.profilePresets.find((item) => item.id === rawSettings.activeProfileId)
      || rawSettings.profilePresets[0];

    return activeProfile || null;
  }

  return null;
}

function findLatestChatMeta(records) {
  return [...records].reverse().find((record) => record.type === "chat-meta") || null;
}
