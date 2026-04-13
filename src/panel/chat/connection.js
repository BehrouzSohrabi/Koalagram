import { ScaledroneObservableRoom } from "../../lib/scaledrone-client.js";
import { DEFAULT_CHANNEL_ROOM } from "../../shared/constants.js";
import {
  buildClientData,
  normalizeStoredChannel,
  resolveMemberIdentity,
  resolveAvatarValue,
  shortChannelId,
} from "../../shared/chat.js";
import { findStoredChannel, upsertStoredChannel } from "../../shared/settings.js";
import { dom } from "../dom.js";
import { currentDeviceId, currentSenderKey, persistSettings } from "../persistence.js";
import { state } from "../state.js";
import { clearBanner, showBanner } from "../ui/notice.js";
import {
  applyCurrentChannelToInputs,
  renderMembers,
  renderStatus,
  updateButtonStates,
  updateChatHeader,
  updateStorageSummary,
} from "../ui/renderers.js";
import {
  configureArchiveActions,
  hydrateStoredHistory,
  removeChannelData,
  requestHistorySync,
} from "./archive.js";
import {
  addSystemMessage,
  clearMessages,
  clearUnreadAttention,
  flushQueuedLiveMessages,
  processIncomingMessage,
} from "./messages.js";

let connectionActions = {
  onRevealIdentityPanel: null,
  onRevealOpenChannelPanel: null,
  onSetActiveDrawer: null,
};

const EMPTY_HISTORY_WARNING_DELAY_MS = 1600;
let emptyHistoryWarningTimer = null;

configureArchiveActions({
  onPublishCurrentChatMeta: publishCurrentChatMeta,
});

export function configureConnectionActions(actions) {
  connectionActions = {
    ...connectionActions,
    ...actions,
  };
}

export async function joinChat(user, channel, options = {}) {
  clearBanner();
  clearEmptyHistoryWarningTimer();

  if (!user.displayName) {
    showBanner("Enter your name before opening a channel.", "error");
    connectionActions.onSetActiveDrawer?.("setup");
    connectionActions.onRevealIdentityPanel?.();
    return;
  }

  if (!channel.channelId) {
    showBanner("Paste a Scaledrone channel ID before opening a channel.", "error");
    connectionActions.onSetActiveDrawer?.("setup");
    connectionActions.onRevealOpenChannelPanel?.();
    return;
  }

  await disconnectClient({ preserveChat: false, preserveMessages: false });
  state.backgroundSuspended = false;

  const storedChannel = findStoredChannel(state.settings.channels, channel.channelId);
  const nextChannel = normalizeStoredChannel(
    {
      ...storedChannel,
      ...channel,
      accentColor: channel.accentColor || storedChannel?.accentColor || state.settings.user.color,
      lastJoinedAt: Date.now(),
    },
    storedChannel || { channelId: channel.channelId },
  );

  state.settings.user = user;
  state.settings.joinDraft = { channelId: nextChannel.channelId };
  state.settings.channels = upsertStoredChannel(state.settings.channels, nextChannel);
  state.settings.lastOpenedChat = nextChannel;
  state.currentChat = nextChannel;
  resetConnectionSessionState();
  dom.messageInput.value = "";
  clearUnreadAttention();
  clearMessages();
  renderMembers([]);
  hydrateStoredHistory(nextChannel.channelId);
  renderStatus("connecting");
  applyCurrentChannelToInputs();
  updateChatHeader();
  showBanner("Connecting to Scaledrone...", "info");
  await persistSettings();

  const client = attachCurrentChatClient(user, nextChannel);

  try {
    await connectAttachedClient(client);
    await persistSettings();
    updateStorageSummary();
    connectionActions.onSetActiveDrawer?.(null);
  } catch (error) {
    if (state.client === client) {
      state.client = null;
    }

    const unavailableChannel = isUnavailableChannelError(error);

    if (unavailableChannel) {
      await removeChannelData(nextChannel.channelId, { removeChannel: true, removeLastOpened: true });
    } else if (options.fromInitialLoad) {
      state.settings.lastOpenedChat = null;
      await persistSettings();
    }

    if (options.fromInitialLoad) {
      state.currentChat = null;
      clearMessages();
      renderMembers([]);
      renderStatus("idle");
      applyCurrentChannelToInputs();
      updateChatHeader();
    }

    if (!(options.fromInitialLoad && unavailableChannel)) {
      renderStatus("error");
    }

    updateButtonStates();
    showBanner(
      unavailableChannel && options.fromInitialLoad
        ? "The last opened channel is no longer available. Its saved data was removed."
        : (error.message || "Unable to open that Scaledrone channel."),
      unavailableChannel && options.fromInitialLoad ? "warning" : "error",
    );
  }
}

export async function disconnectClient({ preserveChat, preserveMessages }) {
  clearEmptyHistoryWarningTimer();

  if (state.client) {
    const activeClient = state.client;
    state.client = null;
    activeClient.close();
  }

  state.backgroundSuspended = false;
  resetConnectionSessionState();
  dom.messageInput.value = "";
  clearUnreadAttention();

  if (!preserveMessages) {
    clearMessages();
  }

  renderMembers([]);

  if (!preserveChat) {
    state.currentChat = null;
  }

  renderStatus("idle");
  applyCurrentChannelToInputs();
  updateChatHeader();
  updateButtonStates();
}

export async function suspendClientForBackground() {
  if (!state.currentChat?.channelId || !state.settings?.user?.displayName) {
    state.backgroundSuspended = false;
    return;
  }

  if (!state.client) {
    state.backgroundSuspended = true;
    return;
  }

  clearEmptyHistoryWarningTimer();
  state.backgroundSuspended = true;

  const activeClient = state.client;
  state.client = null;
  activeClient.close();

  resetConnectionSessionState();
  renderMembers([]);
  renderStatus("idle");
  updateButtonStates();
}

export async function resumeClientFromBackground() {
  if (
    !state.backgroundSuspended
    || state.client
    || !state.currentChat?.channelId
    || !state.settings?.user?.displayName
  ) {
    return;
  }

  clearBanner();
  clearEmptyHistoryWarningTimer();
  state.backgroundSuspended = false;
  resetConnectionSessionState();
  renderStatus("connecting");
  showBanner("Reconnecting to Scaledrone...", "info");

  const client = attachCurrentChatClient(state.settings.user, state.currentChat);

  try {
    await connectAttachedClient(client);
    updateStorageSummary();
  } catch (error) {
    if (state.client === client) {
      state.client = null;
    }

    renderStatus("error");
    updateButtonStates();
    showBanner(error.message || "Unable to reconnect to that Scaledrone channel.", "error");
  }
}

export async function publishCurrentChatMeta() {
  if (!state.client || !state.currentChat) {
    return;
  }

  await state.client.publish({
    type: "chat-meta",
    messageId: crypto.randomUUID(),
    channelId: state.currentChat.channelId,
    chatName: state.currentChat.chatName,
    accentColor: state.currentChat.accentColor,
    senderName: state.settings.user.displayName,
    senderKey: currentSenderKey(),
    senderDeviceId: currentDeviceId(),
    avatar: resolveAvatarValue(state.settings.user.avatarUrl, state.settings.user.displayName),
    avatarUrl: state.settings.user.avatarUrl,
    color: state.settings.user.color,
    ts: Math.floor(Date.now() / 1000),
  });

  state.syncedChatMeta = {
    chatName: state.currentChat.chatName,
    accentColor: state.currentChat.accentColor,
  };
}

function resetConnectionSessionState() {
  state.historySynced = false;
  state.pendingLiveMessages = [];
  state.seenSyncChunkIds = new Set();
  state.seenSyncRequestIds = new Set();
  state.syncedChatMeta = null;
}

function attachCurrentChatClient(user, channel) {
  const client = createRoomClient(user, channel);
  state.client = client;
  attachClient(client);
  updateButtonStates();
  return client;
}

function createRoomClient(user, channel) {
  return new ScaledroneObservableRoom({
    channelId: channel.channelId,
    roomName: DEFAULT_CHANNEL_ROOM,
    clientData: buildClientData(user),
    historyCount: channel.historyCount,
  });
}

async function connectAttachedClient(client) {
  await client.connect();
  updateButtonStates();
}

function attachClient(client) {
  client.addEventListener("statechange", (event) => {
    if (client !== state.client) {
      return;
    }

    renderStatus(event.detail.state);

    if (event.detail.state === "reconnecting") {
      showBanner("Connection dropped. Koalagram is trying to reconnect.", "warning");
    }
  });

  client.addEventListener("open", () => {
    if (client !== state.client) {
      return;
    }

    state.historySynced = false;
    state.pendingLiveMessages = [];
    renderStatus("connected");
    addSystemMessage("Connected.");
    showBanner("Connected. Loading channel history...", "success");
    dom.messageInput.focus();
  });

  client.addEventListener("reconnect", () => {
    if (client !== state.client) {
      return;
    }

    state.historySynced = false;
    state.pendingLiveMessages = [];
    renderStatus("connected");
    addSystemMessage("Reconnected to the channel.");
    showBanner("Reconnected. Resynchronizing history...", "success");
  });

  client.addEventListener("disconnect", () => {
    if (client !== state.client) {
      return;
    }

    clearEmptyHistoryWarningTimer();
    renderStatus("reconnecting");
  });

  client.addEventListener("close", () => {
    if (client !== state.client) {
      return;
    }

    clearEmptyHistoryWarningTimer();
    renderStatus("closed");
  });

  client.addEventListener("error", (event) => {
    if (client !== state.client) {
      return;
    }

    clearEmptyHistoryWarningTimer();

    if (event.detail?.fatal) {
      renderStatus("error");
    }

    showBanner(event.detail?.message || "Scaledrone reported an error.", event.detail?.fatal ? "error" : "warning");
  });

  client.addEventListener("members", (event) => {
    if (client !== state.client) {
      return;
    }

    renderMembers(event.detail.members);
  });

  client.addEventListener("member_join", (event) => {
    if (client !== state.client) {
      return;
    }

    renderMembers(Array.from(client.membersById.values()));

    if (!state.settings.preferences.mutePresenceNotes && event.detail.member?.id !== client.clientId) {
      const identity = resolveMemberIdentity(event.detail.member);
      addSystemMessage(`${identity.displayName} joined the channel.`);
    }
  });

  client.addEventListener("member_leave", (event) => {
    if (client !== state.client) {
      return;
    }

    renderMembers(Array.from(client.membersById.values()));

    if (!state.settings.preferences.mutePresenceNotes && event.detail.member?.id !== client.clientId) {
      const identity = resolveMemberIdentity(event.detail.member);
      addSystemMessage(`${identity.displayName} left the channel.`);
    }
  });

  client.addEventListener("history", async (event) => {
    if (client !== state.client) {
      return;
    }

    const isInitialHistoryBatch = !state.historySynced;

    for (const message of event.detail.messages) {
      processIncomingMessage(message);
    }

    if (event.detail.messages.length > 0) {
      clearEmptyHistoryWarningTimer();
      clearBanner();
    }

    if (!isInitialHistoryBatch) {
      return;
    }

    state.historySynced = true;
    clearEmptyHistoryWarningTimer();

    if (
      event.detail.messages.length === 0
      && state.currentChat.historyCount > 0
      && getStoredChatMessageCount(state.currentChat.channelId) === 0
    ) {
      scheduleEmptyHistoryWarning(state.currentChat.channelId);
    }

    flushQueuedLiveMessages();
    await maybePublishCurrentChatMeta();
    void requestHistorySync("join");
  });

  client.addEventListener("message", (event) => {
    if (client !== state.client) {
      return;
    }

    if (!state.historySynced) {
      state.pendingLiveMessages.push(event.detail.message);
      return;
    }

    processIncomingMessage(event.detail.message);
  });
}

async function maybePublishCurrentChatMeta() {
  if (!state.currentChat) {
    return;
  }

  if (state.syncedChatMeta) {
    return;
  }

  try {
    await publishCurrentChatMeta();
  } catch (error) {
    showBanner(error.message || "Unable to publish the channel settings.", "warning");
  }
}

function isUnavailableChannelError(error) {
  const message = String(error?.message || "").toLowerCase();
  return ["invalid", "channel", "not exist", "not found", "unknown"].some((token) => message.includes(token));
}

function getStoredChatMessageCount(channelId) {
  return (state.settings?.channelHistory?.[channelId]?.messages || [])
    .filter((record) => record.type === "chat-message")
    .length;
}

function scheduleEmptyHistoryWarning(channelId) {
  clearEmptyHistoryWarningTimer();

  emptyHistoryWarningTimer = window.setTimeout(() => {
    emptyHistoryWarningTimer = null;

    if (
      state.client?.state !== "connected"
      || state.currentChat?.channelId !== channelId
      || getStoredChatMessageCount(channelId) > 0
    ) {
      return;
    }

    showBanner(
      "No recent history was recovered from Scaledrone or connected peers. The channel may be empty, history may be disabled, or nobody else is online to sync.",
      "warning",
    );
  }, EMPTY_HISTORY_WARNING_DELAY_MS);
}

function clearEmptyHistoryWarningTimer() {
  if (!emptyHistoryWarningTimer) {
    return;
  }

  window.clearTimeout(emptyHistoryWarningTimer);
  emptyHistoryWarningTimer = null;
}
