import { findStoredChannel, MAX_STORED_MESSAGES, normalizeStoredRecord, upsertStoredChannel } from "../../shared/settings.js";
import { normalizeStoredChannel } from "../../shared/chat.js";
import {
  MAX_MESSAGES,
  MAX_SYNC_SHARE_MESSAGES,
  MAX_SYNC_TRACKED_IDS,
  SYNC_CHUNK_SIZE,
} from "../config.js";
import { dom } from "../dom.js";
import { currentDeviceId, currentSenderKey, persistSettings, persistSettingsDeferred } from "../persistence.js";
import { state } from "../state.js";
import { showBanner } from "../ui/notice.js";
import {
  applyCurrentChannelToInputs,
  renderMessages,
  updateButtonStates,
  updateChatHeader,
  updateStorageSummary,
} from "../ui/renderers.js";
import { buildStoredRecordFromPacket, storedRecordToRenderable } from "./packets.js";

let archiveActions = {
  onAddSystemMessage: null,
  onClearMessages: null,
  onPublishCurrentChatMeta: null,
};

export function configureArchiveActions(actions) {
  archiveActions = {
    ...archiveActions,
    ...actions,
  };
}

export function getChannelArchive(channelId) {
  return state.settings?.channelHistory?.[channelId] || null;
}

export async function updateCurrentChannelSettings(updates, { persist = true, publishMeta = false } = {}) {
  if (!state.currentChat?.channelId) {
    return null;
  }

  const nextChannel = normalizeStoredChannel(
    {
      ...state.currentChat,
      ...updates,
      lastJoinedAt: state.currentChat.lastJoinedAt || Date.now(),
    },
    findStoredChannel(state.settings.channels, state.currentChat.channelId) || state.currentChat,
  );

  applyChannelToState(nextChannel);

  if (persist) {
    await persistSettings();
  }

  if (publishMeta) {
    await archiveActions.onPublishCurrentChatMeta?.();
  }

  return nextChannel;
}

export function handleChatMetaMessage(packet) {
  const record = buildStoredRecordFromPacket(packet);

  if (!record || !state.currentChat) {
    return;
  }

  mergeStoredRecords(state.currentChat.channelId, [record], { renderIfActive: false });
  applyChatMetaToState(state.currentChat.channelId, record, {
    source: packet.source,
    persist: false,
  });
  updateStorageSummary();
}

export function hydrateStoredHistory(channelId) {
  const archive = getChannelArchive(channelId);

  if (!archive) {
    updateStorageSummary();
    return 0;
  }

  const sortedRecords = [...archive.messages].sort((left, right) => left.ts - right.ts);
  let renderedCount = 0;

  for (const record of sortedRecords) {
    if (record.type === "chat-meta") {
      applyChatMetaToState(channelId, record, { source: "storage", persist: false });
      continue;
    }

    const renderable = storedRecordToRenderable(record);

    if (!renderable || state.messageKeys.has(renderable.key)) {
      continue;
    }

    state.messageKeys.add(renderable.key);
    state.messages.push(renderable);
    renderedCount += 1;
  }

  sortMessagesInView();
  renderMessages(state.messages);
  updateStorageSummary();
  return renderedCount;
}

export function mergeStoredRecords(channelId, records, { renderIfActive = false } = {}) {
  const normalizedRecords = records.map(normalizeStoredRecord).filter(Boolean);

  if (normalizedRecords.length === 0) {
    return 0;
  }

  const existingArchive = getChannelArchive(channelId) || {
    channelId,
    chatName: "",
    accentColor: "",
    updatedAt: Date.now(),
    messages: [],
  };
  const recordMap = new Map(existingArchive.messages.map((record) => [record.messageId, record]));
  let addedCount = 0;

  for (const record of normalizedRecords) {
    if (!recordMap.has(record.messageId)) {
      addedCount += 1;
      recordMap.set(record.messageId, record);

      if (renderIfActive && state.currentChat?.channelId === channelId && record.type === "chat-message") {
        const renderable = storedRecordToRenderable(record);

        if (renderable && !state.messageKeys.has(renderable.key)) {
          state.messageKeys.add(renderable.key);
          state.messages.push(renderable);
        }
      }

      continue;
    }

    recordMap.set(record.messageId, {
      ...recordMap.get(record.messageId),
      ...record,
      ts: Math.max(recordMap.get(record.messageId).ts, record.ts),
    });
  }

  const nextMessages = Array.from(recordMap.values())
    .sort((left, right) => left.ts - right.ts)
    .slice(-MAX_STORED_MESSAGES);
  const latestMeta = [...nextMessages].reverse().find((record) => record.type === "chat-meta") || null;

  state.settings.channelHistory[channelId] = {
    channelId,
    chatName: latestMeta?.chatName || existingArchive.chatName || "",
    accentColor: latestMeta?.accentColor || existingArchive.accentColor || "",
    updatedAt: Date.now(),
    messages: nextMessages,
  };

  if (latestMeta) {
    applyChatMetaToState(channelId, latestMeta, {
      source: renderIfActive ? "sync" : "storage",
      persist: false,
    });
  }

  if (renderIfActive && state.currentChat?.channelId === channelId && addedCount > 0) {
    sortMessagesInView();
    trimMessages();
    renderMessages(state.messages);
  }

  persistSettingsDeferred();
  updateStorageSummary();
  return addedCount;
}

export function persistIncomingPacket(packet) {
  if (!state.currentChat?.channelId) {
    return;
  }

  const record = buildStoredRecordFromPacket(packet);

  if (!record) {
    return;
  }

  mergeStoredRecords(state.currentChat.channelId, [record], { renderIfActive: false });
}

export function applyChatMetaToState(channelId, nextMeta, { source = "storage", persist = true } = {}) {
  const storedChannel = findStoredChannel(state.settings.channels, channelId);
  const nextChannel = normalizeStoredChannel(
    {
      ...storedChannel,
      ...state.currentChat,
      channelId,
      chatName: typeof nextMeta.chatName === "string" && nextMeta.chatName.trim()
        ? nextMeta.chatName
        : (state.currentChat?.channelId === channelId ? state.currentChat.chatName : storedChannel?.chatName),
      accentColor: nextMeta.accentColor || storedChannel?.accentColor || state.currentChat?.accentColor,
    },
    storedChannel || state.currentChat || { channelId },
  );

  applyChannelToState(nextChannel);
  state.syncedChatMeta = {
    chatName: nextChannel.chatName,
    accentColor: nextChannel.accentColor,
  };

  if (persist) {
    void persistSettings().catch((error) => {
      showBanner(error.message || "Unable to save channel settings.", "warning");
    });
  }

  if (
    source === "live"
    && state.currentChat?.channelId === channelId
    && nextMeta.chatName
    && nextMeta.chatName !== state.currentChat.chatName
  ) {
    archiveActions.onAddSystemMessage?.(`Channel settings were updated in this chat.`);
  }
}

export async function requestHistorySync(reason = "join") {
  if (!state.client || state.client.state !== "connected" || !state.currentChat?.channelId) {
    return;
  }

  const archive = getChannelArchive(state.currentChat.channelId);

  await state.client.publish({
    type: "history-sync-request",
    requestId: crypto.randomUUID(),
    channelId: state.currentChat.channelId,
    requesterKey: currentSenderKey(),
    requesterDeviceId: currentDeviceId(),
    requesterClientId: state.client.clientId || "",
    localCount: archive?.messages.length || 0,
    newestTs: archive?.messages.at(-1)?.ts || 0,
    reason,
    ts: Date.now(),
  });
}

export async function handleHistorySyncRequest(payload) {
  if (!state.client || state.client.state !== "connected" || !state.currentChat?.channelId) {
    return;
  }

  if (payload.channelId !== state.currentChat.channelId) {
    return;
  }

  if (payload.requesterClientId && payload.requesterClientId === state.client.clientId) {
    return;
  }

  if (payload.requesterDeviceId && payload.requesterDeviceId === currentDeviceId()) {
    return;
  }

  if (!payload.requesterClientId && !payload.requesterDeviceId && payload.requesterKey === currentSenderKey()) {
    return;
  }

  if (rememberSeenId(state.seenSyncRequestIds, payload.requestId)) {
    return;
  }

  const archive = getChannelArchive(payload.channelId);
  const messages = archive?.messages.slice(-MAX_SYNC_SHARE_MESSAGES) || [];

  if (messages.length === 0) {
    return;
  }

  const chunks = chunkRecords(messages, SYNC_CHUNK_SIZE);

  for (let index = 0; index < chunks.length; index += 1) {
    await state.client.publish({
      type: "history-sync-response",
      responseId: crypto.randomUUID(),
      requestId: payload.requestId,
      responderKey: currentSenderKey(),
      responderDeviceId: currentDeviceId(),
      responderClientId: state.client.clientId || "",
      channelId: payload.channelId,
      chunkIndex: index + 1,
      chunkCount: chunks.length,
      messages: chunks[index],
      ts: Date.now(),
    });
  }
}

export function handleHistorySyncResponse(payload) {
  if (!state.currentChat?.channelId || payload.channelId !== state.currentChat.channelId) {
    return;
  }

  const chunkId = payload.responseId
    || `${payload.requestId}:${payload.responderClientId || payload.responderDeviceId || payload.responderKey || "unknown"}:${payload.chunkIndex}`;

  if (rememberSeenId(state.seenSyncChunkIds, chunkId)) {
    return;
  }

  const records = Array.isArray(payload.messages)
    ? payload.messages.map(normalizeStoredRecord).filter(Boolean)
    : [];

  if (records.length === 0) {
    return;
  }

  const addedCount = mergeStoredRecords(payload.channelId, records, { renderIfActive: true });

  if (addedCount > 0) {
    showBanner(`Synced ${addedCount} message${addedCount === 1 ? "" : "s"} from connected peers.`, "success");
  }
}

export async function removeChannelData(
  channelId,
  { removeChannel = true, removeLastOpened = true, clearCurrentView = false } = {},
) {
  delete state.settings.channelHistory[channelId];

  if (removeChannel) {
    state.settings.channels = state.settings.channels.filter((item) => item.channelId !== channelId);
  }

  if (removeLastOpened && state.settings.lastOpenedChat?.channelId === channelId) {
    state.settings.lastOpenedChat = null;
  }

  if (state.settings.joinDraft.channelId === channelId && !state.client) {
    state.settings.joinDraft = { channelId: "" };
    dom.channelIdInput.value = "";
  }

  if (clearCurrentView && state.currentChat?.channelId === channelId) {
    archiveActions.onClearMessages?.();

    if (!state.client) {
      state.currentChat = null;
    }
  }

  await persistSettings();
  applyCurrentChannelToInputs();
  updateStorageSummary();
  updateChatHeader();
  updateButtonStates();
}

function applyChannelToState(nextChannel) {
  state.settings.channels = upsertStoredChannel(state.settings.channels, nextChannel);

  if (state.currentChat?.channelId === nextChannel.channelId) {
    state.currentChat = {
      ...state.currentChat,
      ...nextChannel,
    };
  }

  if (state.settings.lastOpenedChat?.channelId === nextChannel.channelId) {
    state.settings.lastOpenedChat = {
      ...state.settings.lastOpenedChat,
      ...nextChannel,
    };
  }

  if (state.settings.channelHistory[nextChannel.channelId]) {
    state.settings.channelHistory[nextChannel.channelId] = {
      ...state.settings.channelHistory[nextChannel.channelId],
      chatName: nextChannel.chatName,
      accentColor: nextChannel.accentColor,
      updatedAt: Date.now(),
    };
  }

  applyCurrentChannelToInputs();
  updateChatHeader();
  updateStorageSummary();
}

function rememberSeenId(set, key) {
  if (!key) {
    return true;
  }

  if (set.has(key)) {
    return true;
  }

  set.add(key);

  if (set.size > MAX_SYNC_TRACKED_IDS) {
    const oldest = set.values().next().value;
    set.delete(oldest);
  }

  return false;
}

function chunkRecords(records, size) {
  const chunks = [];

  for (let index = 0; index < records.length; index += size) {
    chunks.push(records.slice(index, index + size));
  }

  return chunks;
}

function sortMessagesInView() {
  state.messages.sort((left, right) => {
    if (left.timestamp !== right.timestamp) {
      return left.timestamp - right.timestamp;
    }

    return left.key.localeCompare(right.key);
  });
}

function trimMessages() {
  if (state.messages.length <= MAX_MESSAGES) {
    return;
  }

  state.messages = state.messages.slice(state.messages.length - MAX_MESSAGES);
  state.messageKeys = new Set(
    state.messages.filter((message) => message.kind === "chat").map((message) => message.key),
  );
}
