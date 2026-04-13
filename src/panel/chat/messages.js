import { isChatMetaMessage, isHistorySyncRequest, isHistorySyncResponse } from "../../shared/chat.js";
import {
  clearUnreadNotifications,
  syncUnreadAttention,
  showUnreadNotification,
} from "../../shared/attention.js";
import { MAX_MESSAGES } from "../config.js";
import { state } from "../state.js";
import { renderMessages, updateStorageSummary } from "../ui/renderers.js";
import { normalizeRenderableMessage } from "./packets.js";

let messageHandlers = {
  onHistorySyncRequest: null,
  onHistorySyncResponse: null,
  onPersistIncomingPacket: null,
  onChatMetaMessage: null,
};

export function configureMessageHandlers(handlers) {
  messageHandlers = {
    ...messageHandlers,
    ...handlers,
  };
}

export function flushQueuedLiveMessages() {
  const queuedMessages = [...state.pendingLiveMessages];
  state.pendingLiveMessages = [];

  for (const message of queuedMessages) {
    processIncomingMessage(message);
  }
}

export function processIncomingMessage(packet) {
  const payload = packet?.data;

  if (isHistorySyncRequest(payload)) {
    void messageHandlers.onHistorySyncRequest?.(payload);
    return;
  }

  if (isHistorySyncResponse(payload)) {
    messageHandlers.onHistorySyncResponse?.(payload);
    return;
  }

  if (isChatMetaMessage(payload)) {
    messageHandlers.onChatMetaMessage?.(packet);
    return;
  }

  const renderedMessage = normalizeRenderableMessage(packet);

  if (!renderedMessage || state.messageKeys.has(renderedMessage.key)) {
    return;
  }

  state.messageKeys.add(renderedMessage.key);
  state.messages.push(renderedMessage);
  sortMessagesInView();
  messageHandlers.onPersistIncomingPacket?.(packet);
  updateStorageSummary();
  renderMessages(state.messages);

  if (packet?.source === "live" && !renderedMessage.own) {
    handleIncomingUnreadMessage(renderedMessage);
  }
}

export function addSystemMessage(text) {
  state.messages.push({
    key: `system:${crypto.randomUUID()}`,
    kind: "system",
    text,
    timestamp: Date.now(),
  });
  trimMessages();
  renderMessages(state.messages);
}

export function clearMessages() {
  state.messages = [];
  state.messageKeys = new Set();
  renderMessages([]);
}

export function clearUnreadAttention() {
  if (state.unreadCount === 0) {
    void syncUnreadAttention(state.unreadCount);
    void clearUnreadNotifications();
    return;
  }

  state.unreadCount = 0;
  void syncUnreadAttention(state.unreadCount);
  void clearUnreadNotifications();
}

function isPanelActive() {
  return document.visibilityState === "visible" && document.hasFocus();
}

function handleIncomingUnreadMessage(message) {
  if (isPanelActive()) {
    clearUnreadAttention();
    return;
  }

  state.unreadCount += 1;
  void syncUnreadAttention(state.unreadCount);
  void showUnreadNotification({
    unreadCount: state.unreadCount,
    channelId: state.currentChat?.channelId || "",
    chatName: state.currentChat?.chatName || "",
    senderName: message?.senderName || "Guest",
    text: message?.text || "",
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

function sortMessagesInView() {
  state.messages.sort((left, right) => {
    if (left.timestamp !== right.timestamp) {
      return left.timestamp - right.timestamp;
    }

    return left.key.localeCompare(right.key);
  });
}
