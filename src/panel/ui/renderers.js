import { DEFAULT_USER, findStoredChannel } from "../../shared/settings.js";
import {
  normalizeStoredChannel,
  resolveMemberIdentity,
  shortChannelId,
} from "../../shared/chat.js";
import { dom } from "../dom.js";
import { state } from "../state.js";
import { renderNotice } from "./notice.js";
import { formatMessageDate, formatTime, messageDayKey } from "./formatters.js";
import { renderButtonContent, renderCollection, renderIconLabel } from "./helpers.js";
import { applyAvatar } from "./avatars.js";

let uiHandlers = {
  onDeleteStoredChannel: null,
  onOpenStoredChannel: null,
};

export function configureUiHandlers(handlers) {
  uiHandlers = {
    ...uiHandlers,
    ...handlers,
  };
}

export function applyUserIdentityToInputs() {
  const user = state.settings.user;
  dom.displayNameInput.value = user.displayName;
  dom.avatarInput.value = user.avatarUrl;
  dom.accentColorInput.value = user.color;
  updateUserPreview();
}

export function applyJoinDraftToInputs() {
  dom.channelIdInput.value = state.settings.joinDraft.channelId || "";
  updateChatHeader();
  updateButtonStates();
}

export function applyCurrentChannelToInputs() {
  const channel = state.currentChat || buildPendingChannel();

  dom.currentChannelIdInput.value = channel?.channelId || "";
  dom.currentChatNameInput.value = channel?.chatName || "";
  dom.currentChatAccentInput.value = channel?.accentColor || DEFAULT_USER.color;
  dom.currentHistoryCountInput.value = String(channel?.historyCount || 50);
}

export function updateUserPreview() {
  const user = state.settings.user;
  applyAvatar(dom.profileAvatarPreview, {
    imageUrl: user.avatarUrl,
    label: user.displayName,
    color: user.color,
  });
  dom.profileNamePreview.textContent = user.displayName || "Unnamed user";
  dom.profileMetaPreview.textContent = !user.displayName
    ? "Tap to add your identity"
    : user.avatarUrl
      ? "Image avatar"
      : "Letter avatar";
}

export function applyPreferences() {
  const { theme, mutePresenceNotes } = state.settings.preferences;
  document.body.dataset.theme = theme;
  dom.themeToggle.checked = theme === "paper";
  dom.muteToggle.checked = mutePresenceNotes;
}

export function renderStatus(status) {
  const labels = {
    idle: "Ready",
    connecting: "Connecting",
    connected: "Online",
    reconnecting: "Retrying",
    error: "Error",
    closed: "Offline",
  };

  const statusLabel = labels[status] || "Ready";
  const statusIcon = {
    idle: "info",
    connecting: "refresh-cw",
    connected: "circle-check",
    reconnecting: "refresh-cw",
    error: "octagon-alert",
    closed: "log-out",
  }[status] || "info";

  dom.statusPill.className = `status-pill status-${status}`;
  renderIconLabel(dom.statusPill, {
    icon: statusIcon,
    label: statusLabel,
    className: "status-content",
    labelClassName: "status-label",
    size: 14,
    spin: status === "connecting" || status === "reconnecting",
  });
  renderNotice();
  applyCurrentChannelToInputs();
  updateChatHeader();
  updateButtonStates();
}

export function updateButtonStates() {
  const connectionState = state.client?.state || "idle";
  const isBusy = connectionState === "connecting" || connectionState === "reconnecting";
  const isConnected = connectionState === "connected";
  const isSameActiveChannel = isConnected && state.currentChat?.channelId === state.settings?.joinDraft?.channelId;
  const hasCurrentChat = Boolean(state.currentChat?.channelId);
  const activeChannelId = state.currentChat?.channelId || state.settings?.joinDraft?.channelId || "";
  const hasJoinDraft = Boolean(state.settings?.joinDraft?.channelId);
  const hasChat = Boolean(activeChannelId);
  const hasDraftMessage = Boolean(dom.messageInput.value.trim());
  const activeArchiveCount = activeChannelId
    ? (state.settings?.channelHistory?.[activeChannelId]?.messages.length || 0)
    : 0;
  const hasAnyStoredData = Object.keys(state.settings?.channelHistory || {}).length > 0
    || (state.settings?.channels?.length || 0) > 0;

  dom.joinButton.disabled = isBusy || !hasJoinDraft || isSameActiveChannel;
  dom.leaveButton.disabled = !state.client;
  dom.messageInput.disabled = !isConnected;
  dom.sendButton.disabled = !isConnected || !hasDraftMessage;
  dom.copyInviteButton.disabled = !hasChat;
  dom.syncNowButton.disabled = !isConnected;
  dom.clearCurrentStorageButton.disabled = !hasChat || activeArchiveCount === 0;
  dom.clearAllStorageButton.disabled = !hasAnyStoredData;
  dom.currentChannelIdInput.disabled = !hasCurrentChat;
  dom.currentChatNameInput.disabled = !hasCurrentChat;
  dom.currentChatAccentInput.disabled = !hasCurrentChat;
  dom.currentHistoryCountInput.disabled = !hasCurrentChat;

  renderButtonContent(dom.joinButton, {
    icon: isBusy ? "refresh-cw" : isSameActiveChannel ? "circle-check" : "log-in",
    label: isBusy ? "Opening..." : isSameActiveChannel ? "Opened" : "Open Channel",
    spin: isBusy,
  });
  dom.messageInput.placeholder = isConnected ? "Write a message" : "Open a channel to start messaging";
}

export function updateChatHeader() {
  const activeChat = state.currentChat || buildPendingChannel();
  const channelId = activeChat?.channelId || "";
  const chatName = activeChat?.chatName?.trim() || "";
  const title = channelId
    ? chatName || `Channel ${shortChannelId(channelId)}`
    : "Koalagram";

  const connectionState = state.client?.state || "idle";
  let subtitle = "Open Menu to join or reopen a channel.";

  if (channelId && !state.client) {
    subtitle = `Ready to open ${shortChannelId(channelId)}`;
  }

  if (connectionState === "connecting") {
    subtitle = `Connecting to ${shortChannelId(channelId)}...`;
  } else if (connectionState === "reconnecting") {
    subtitle = `Reconnecting to ${shortChannelId(channelId)}...`;
  } else if (connectionState === "connected") {
    subtitle = state.memberCount > 0
      ? `${state.memberCount} online`
      : "Connected";
  } else if (connectionState === "error") {
    subtitle = `Connection problem · ${shortChannelId(channelId)}`;
  } else if (connectionState === "closed" && channelId) {
    subtitle = `Offline · ${shortChannelId(channelId)}`;
  }

  const avatarLabel = chatName || shortChannelId(channelId) || "Koalagram";
  const accent = activeChat?.accentColor || "";
  const avatarAccent = accent || DEFAULT_USER.color;

  if (accent) {
    document.body.style.setProperty("--active-channel-accent", accent);
  } else {
    document.body.style.removeProperty("--active-channel-accent");
  }

  dom.chatTitle.textContent = title;
  dom.chatSubtitle.textContent = subtitle;
  dom.drawerChannelTitle.textContent = title;
  applyAvatar(dom.chatAvatar, { label: avatarLabel, color: avatarAccent });
  applyAvatar(dom.channelAvatar, { label: avatarLabel, color: avatarAccent });
  document.title = channelId ? `${title} · Koalagram` : "Koalagram";
}

export function renderMessages(messages) {
  dom.messagesEmptyState.hidden = messages.length > 0;
  const fragment = document.createDocumentFragment();
  let lastDayKey = "";

  for (const message of messages) {
    const dayKey = messageDayKey(message.timestamp);

    if (dayKey !== lastDayKey) {
      fragment.append(createDateDivider(message.timestamp));
      lastDayKey = dayKey;
    }

    fragment.append(createMessageRow(message));
  }

  dom.messageList.replaceChildren(fragment);
  dom.chatScroll.scrollTop = dom.chatScroll.scrollHeight;
}

export function renderMembers(members) {
  state.memberCount = members.length;
  dom.onlineCount.textContent = String(members.length);

  const sortedMembers = [...members].sort((left, right) => {
    const leftName = resolveMemberIdentity(left).displayName.toLowerCase();
    const rightName = resolveMemberIdentity(right).displayName.toLowerCase();
    return leftName.localeCompare(rightName);
  });

  renderCollection(dom.memberList, sortedMembers, {
    className: "member-list",
    createEmptyItem: createEmptyMemberItem,
    createItem: createMemberItem,
  });
  updateChatHeader();
}

export function renderStoredChannels() {
  renderCollection(dom.storedChannelsList, state.settings.channels, {
    className: "channel-list",
    emptyClassName: "channel-list empty-list",
    createEmptyItem: createEmptyStoredChannelItem,
    createItem: createStoredChannelItem,
  });
}

export function updateStorageSummary() {
  renderStoredChannels();
  const channelEntries = Object.values(state.settings?.channelHistory || {});
  const totalMessages = channelEntries.reduce(
    (sum, archive) => sum + archive.messages.filter((record) => record.type === "chat-message").length,
    0,
  );
  const activeChannelId = state.currentChat?.channelId || state.settings?.joinDraft?.channelId || "";
  const activeCount = activeChannelId
    ? ((state.settings.channelHistory[activeChannelId]?.messages || []).filter((record) => record.type === "chat-message").length)
    : 0;

  if (!activeChannelId) {
    dom.storageSummary.textContent = `${channelEntries.length} channels saved`;
    updateButtonStates();
    return;
  }

  dom.storageSummary.textContent = `${activeCount} here · ${totalMessages} total`;
  updateButtonStates();
}

function buildPendingChannel() {
  const storedChannel = findStoredChannel(state.settings?.channels || [], state.settings?.joinDraft?.channelId);

  return normalizeStoredChannel({
    channelId: state.settings?.joinDraft?.channelId,
    chatName: storedChannel?.chatName,
    accentColor: storedChannel?.accentColor,
    historyCount: storedChannel?.historyCount,
  });
}

function createDateDivider(timestamp) {
  const item = document.createElement("li");
  item.className = "message-date-divider";
  const label = document.createElement("time");
  label.dateTime = new Date(timestamp).toISOString();
  label.textContent = formatMessageDate(timestamp);
  item.append(label);

  return item;
}

function createMessageRow(message) {
  return message.kind === "system"
    ? createSystemMessageRow(message)
    : createChatMessageRow(message);
}

function createSystemMessageRow(message) {
  const item = document.createElement("li");
  item.className = "message-row system-row";

  const wrapper = document.createElement("div");
  wrapper.className = "system-message";

  const text = document.createElement("span");
  text.textContent = message.text;

  const timestamp = document.createElement("time");
  timestamp.className = "message-time";
  timestamp.textContent = formatTime(message.timestamp);

  wrapper.append(text, timestamp);
  item.append(wrapper);
  return item;
}

function createChatMessageRow(message) {
  const item = document.createElement("li");
  item.className = `message-row ${message.own ? "message-row-own" : "message-row-peer"}`;
  const localUser = state.settings?.user || DEFAULT_USER;
  const avatar = document.createElement("div");
  avatar.className = "bubble-avatar";
  applyAvatar(avatar, {
    imageUrl: message.own ? (localUser.avatarUrl || message.avatarUrl) : message.avatarUrl,
    label: message.own ? (localUser.displayName || message.senderName || "You") : message.senderName,
    color: message.own ? (localUser.color || message.color) : message.color,
  });

  const bubble = document.createElement("article");
  bubble.className = `message-bubble ${message.own ? "message-bubble-own" : "message-bubble-peer"}`;
  bubble.style.setProperty("--message-accent", message.color);

  const header = document.createElement("div");
  header.className = "message-header";

  const author = document.createElement("strong");
  author.className = "message-author";
  author.textContent = message.own ? "You" : message.senderName;

  const timestamp = document.createElement("time");
  timestamp.className = "message-time";
  timestamp.textContent = formatTime(message.timestamp);

  const text = document.createElement("p");
  text.className = "message-text";
  text.textContent = message.text;

  header.append(author, timestamp);
  bubble.append(header, text);

  if (message.own) {
    item.append(bubble, avatar);
  } else {
    item.append(avatar, bubble);
  }
  return item;
}

function createEmptyMemberItem() {
  const item = document.createElement("li");
  item.className = "member-empty";
  item.textContent = "No active members yet.";
  return item;
}

function createMemberItem(member) {
  const identity = resolveMemberIdentity(member);
  const item = document.createElement("li");
  item.className = "member-item";

  const avatar = document.createElement("div");
  avatar.className = "member-avatar";
  applyAvatar(avatar, {
    imageUrl: identity.avatarUrl,
    label: identity.displayName,
    color: identity.color,
  });

  const copy = document.createElement("div");
  copy.className = "member-copy";

  const name = document.createElement("strong");
  name.textContent = identity.displayName;

  const meta = document.createElement("span");
  meta.className = "member-meta";
  meta.textContent = member.id === state.client?.clientId ? "You" : member.id;

  copy.append(name, meta);
  item.append(avatar, copy);
  return item;
}

function createStoredChannelItem(channel) {
  const selectedChannelId = state.currentChat?.channelId || state.settings?.joinDraft?.channelId || "";
  const isActive = selectedChannelId === channel.channelId;
  const viewer = state.settings?.user || DEFAULT_USER;

  const item = document.createElement("li");
  item.className = `channel-list-item${isActive ? " channel-list-item-active" : ""}`;
  item.style.setProperty("--channel-accent", channel.accentColor || DEFAULT_USER.color);

  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.className = "channel-list-button";
  openButton.addEventListener("click", () => {
    uiHandlers.onOpenStoredChannel?.(channel);
  });

  const avatar = document.createElement("div");
  avatar.className = "channel-list-avatar";
  avatar.style.setProperty("--viewer-accent", viewer.color || DEFAULT_USER.color);
  applyAvatar(avatar, {
    imageUrl: viewer.avatarUrl,
    label: viewer.displayName,
    color: viewer.color,
  });

  const header = document.createElement("div");
  header.className = "channel-list-header";

  const titleGroup = document.createElement("div");
  titleGroup.className = "channel-list-title-group";

  const dot = document.createElement("span");
  dot.className = `channel-status-dot${isActive ? " channel-status-dot-active" : ""}`;

  const copy = document.createElement("div");
  copy.className = "channel-list-copy";

  const title = document.createElement("div");
  title.className = "channel-list-title";
  title.textContent = channel.chatName || `Channel ${shortChannelId(channel.channelId)}`;

  titleGroup.append(dot, title);
  header.append(titleGroup);

  if (isActive) {
    const activePill = document.createElement("span");
    activePill.className = "channel-active-pill";
    activePill.textContent = "Active";
    header.append(activePill);
  }

  copy.append(header);
  openButton.append(avatar, copy);

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "ghost-button small-button channel-delete-button";
  renderButtonContent(deleteButton, { icon: "trash-2", label: "Remove", iconOnly: true });
  deleteButton.addEventListener("click", () => {
    uiHandlers.onDeleteStoredChannel?.(channel);
  });

  item.append(openButton, deleteButton);
  return item;
}

function createEmptyStoredChannelItem() {
  const item = document.createElement("li");
  item.className = "channel-list-empty";
  item.textContent = "No saved channels yet.";
  return item;
}
