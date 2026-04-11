import {
  isChatMetaMessage,
  normalizeColor,
  resolveAvatarValue,
  resolveMemberIdentity,
} from "../../shared/chat.js";
import { normalizeStoredRecord } from "../../shared/settings.js";
import { currentDeviceId, currentSenderKey } from "../persistence.js";
import { state } from "../state.js";

export function normalizeRenderableMessage(packet) {
  const payload = packet?.data;

  if (typeof payload === "string") {
    return buildRenderableMessage(packet, payload, {});
  }

  if (!payload || typeof payload !== "object") {
    return null;
  }

  if (typeof payload.text === "string" && payload.text.trim()) {
    return buildRenderableMessage(packet, payload.text.trim(), payload);
  }

  return null;
}

export function buildRenderableMessage(packet, text, payload) {
  const memberIdentity = resolveMemberIdentity(packet.member);
  const senderName = payload.senderName?.trim() || memberIdentity.displayName;
  const avatarUrl = payload.avatarUrl || memberIdentity.avatarUrl;
  const avatar = resolveAvatarValue(payload.avatarUrl || payload.avatar, senderName, memberIdentity.avatarUrl || memberIdentity.avatar);
  const color = normalizeColor(payload.color || memberIdentity.color);
  const timestamp = resolveTimestamp(packet, payload);
  const key = buildMessageKey(packet);

  return {
    key,
    kind: "chat",
    text,
    senderName,
    avatar,
    avatarUrl,
    color,
    timestamp,
    own: isOwnMessage(packet, payload, senderName, avatar, color),
  };
}

export function buildMessageKey(packet) {
  const payload = packet?.data;

  if (payload?.messageId) {
    return `payload:${payload.messageId}`;
  }

  if (packet?.id) {
    return `history:${packet.id}`;
  }

  return `fallback:${packet?.clientId || "unknown"}:${packet?.timestamp || 0}:${JSON.stringify(payload)}`;
}

export function resolveTimestamp(packet, payload) {
  if (typeof payload.ts === "number") {
    return payload.ts > 1_000_000_000_000 ? payload.ts : payload.ts * 1000;
  }

  if (typeof packet.timestamp === "number") {
    return packet.timestamp * 1000;
  }

  return Date.now();
}

export function buildStoredRecordFromPacket(packet) {
  const payload = packet?.data;

  if (!payload) {
    return null;
  }

  if (isChatMetaMessage(payload)) {
    return normalizeStoredRecord({
      type: "chat-meta",
      messageId: payload.messageId || buildMessageKey(packet),
      chatName: payload.chatName,
      accentColor: payload.accentColor || payload.color,
      senderName: payload.senderName,
      senderKey: payload.senderKey,
      senderDeviceId: payload.senderDeviceId,
      avatar: payload.avatar,
      avatarUrl: payload.avatarUrl,
      ts: resolveTimestamp(packet, payload),
    });
  }

  if (typeof payload === "string") {
    const memberIdentity = resolveMemberIdentity(packet.member);
    return normalizeStoredRecord({
      type: "chat-message",
      messageId: buildMessageKey(packet),
      text: payload,
      senderName: memberIdentity.displayName,
      senderKey: "",
      avatar: memberIdentity.avatar,
      avatarUrl: memberIdentity.avatarUrl,
      color: memberIdentity.color,
      ts: resolveTimestamp(packet, {}),
    });
  }

  if (typeof payload?.text === "string" && payload.text.trim()) {
    return normalizeStoredRecord({
      type: "chat-message",
      messageId: payload.messageId || buildMessageKey(packet),
      text: payload.text,
      senderName: payload.senderName,
      senderKey: payload.senderKey,
      senderDeviceId: payload.senderDeviceId,
      avatar: payload.avatar,
      avatarUrl: payload.avatarUrl,
      color: payload.color,
      ts: resolveTimestamp(packet, payload),
    });
  }

  return null;
}

export function storedRecordToRenderable(record) {
  if (record.type !== "chat-message") {
    return null;
  }

  const payload = {
    type: "chat-message",
    messageId: record.messageId,
    text: record.text,
    senderName: record.senderName,
    senderKey: record.senderKey,
    senderDeviceId: record.senderDeviceId,
    avatar: record.avatar,
    avatarUrl: record.avatarUrl,
    color: record.color,
    ts: record.ts,
  };

  return buildRenderableMessage(
    {
      data: payload,
      timestamp: Math.floor(record.ts / 1000),
      clientId: null,
      member: null,
    },
    record.text,
    payload,
  );
}

function isOwnMessage(packet, payload, senderName, avatar, color) {
  if (payload.senderDeviceId && payload.senderDeviceId === currentDeviceId()) {
    return true;
  }

  if (packet.clientId && packet.clientId === state.client?.clientId) {
    return true;
  }

  const user = state.settings?.user;

  if (!user) {
    return false;
  }

  if (payload.senderKey && payload.senderKey === currentSenderKey()) {
    return true;
  }

  return (
    senderName === user.displayName &&
    avatar === resolveAvatarValue(user.avatarUrl, user.displayName) &&
    color === normalizeColor(user.color)
  );
}
