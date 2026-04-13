import { PANEL_PORT_NAME } from "../shared/constants.js";
import { prepareWebNotifications } from "../shared/attention.js";
import { canConnectToExtensionRuntime, getRuntimeMode } from "../shared/runtime.js";
import {
  normalizeJoinDraft,
  normalizeStoredChannel,
  normalizeUserIdentity,
  resolveAvatarValue,
  shortChannelId,
} from "../shared/chat.js";
import { findStoredChannel, normalizeSettings } from "../shared/settings.js";
import { readStoredSettings } from "../shared/storage.js";
import { createIcon } from "../lib/ui-icons.js";
import {
  configureArchiveActions,
  handleChatMetaMessage,
  handleHistorySyncRequest,
  handleHistorySyncResponse,
  persistIncomingPacket,
  removeChannelData,
  requestHistorySync,
  updateCurrentChannelSettings,
} from "./chat/archive.js";
import { configureConnectionActions, disconnectClient, joinChat } from "./chat/connection.js";
import { addSystemMessage, clearMessages, clearUnreadAttention, configureMessageHandlers } from "./chat/messages.js";
import { dom } from "./dom.js";
import { pickRandomFact } from "./facts.js";
import { currentDeviceId, currentSenderKey, persistSettings } from "./persistence.js";
import { pickRandomSlogan } from "./slogans.js";
import { state } from "./state.js";
import { applyStaticUiIcons, renderButtonContent } from "./ui/helpers.js";
import {
  clearBanner,
  closeNotice,
  handleDocumentClick,
  handleNoticeButtonClick,
  pushToast,
  renderNotice,
  showBanner,
} from "./ui/notice.js";
import {
  applyCurrentChannelToInputs,
  applyJoinDraftToInputs,
  applyPreferences,
  applyUserIdentityToInputs,
  configureUiHandlers,
  renderMembers,
  renderStatus,
  updateButtonStates,
  updateChatHeader,
  updateStorageSummary,
  updateUserPreview,
} from "./ui/renderers.js";

configureArchiveActions({
  onAddSystemMessage: addSystemMessage,
  onClearMessages: clearMessages,
});

configureMessageHandlers({
  onHistorySyncRequest: handleHistorySyncRequest,
  onHistorySyncResponse: handleHistorySyncResponse,
  onPersistIncomingPacket: persistIncomingPacket,
  onChatMetaMessage: handleChatMetaMessage,
});

configureConnectionActions({
  onSetActiveDrawer: setActiveDrawer,
  onRevealIdentityPanel: revealIdentityPanel,
  onRevealOpenChannelPanel: revealOpenChannelPanel,
});

configureUiHandlers({
  onDeleteStoredChannel: handleDeleteStoredChannel,
  onOpenStoredChannel: handleOpenStoredChannel,
});

const LOVE_BURST_PARTICLE_COUNT = 10;
const LOVE_BUTTON_ACTIVE_MS = 720;

let loveButtonResetTimer = null;
let toastPositionFrame = 0;

async function init() {
  state.settings = normalizeSettings(null);
  document.body.dataset.runtimeMode = getRuntimeMode();
  void prepareWebNotifications();
  applySlogan();
  bindEvents();
  applyStaticUiIcons(dom);
  syncToastStackPosition();
  renderNotice();
  connectPanelPresence();
  state.settings = normalizeSettings(await readStoredSettings({ allowLocalFallback: true }));
  clearUnreadAttention();
  state.identityPanelOpen = false;
  state.openChannelPanelOpen = shouldOpenJoinPanelByDefault();
  applyUserIdentityToInputs();
  applyJoinDraftToInputs();
  applyCurrentChannelToInputs();
  applyPreferences();
  renderMembers([]);
  updateStorageSummary();
  clearMessages();
  renderStatus("idle");
  renderSetupPanels();
  updateDrawerState();

  if (state.settings.lastOpenedChat?.channelId && state.settings.user.displayName) {
    await joinChat(
      normalizeUserIdentity(state.settings.user),
      normalizeStoredChannel(state.settings.lastOpenedChat),
      { fromInitialLoad: true },
    );
  }
}

function applySlogan() {
  if (!dom.slogan) {
    return;
  }

  dom.slogan.textContent = pickRandomSlogan();
}

function bindEvents() {
  dom.joinForm.addEventListener("submit", handleJoinSubmit);
  dom.leaveButton.addEventListener("click", handleLeaveClick);
  dom.composerForm.addEventListener("submit", handleSendMessage);

  dom.messageInput.addEventListener("keydown", handleComposerKeydown);
  dom.messageInput.addEventListener("input", updateButtonStates);

  dom.displayNameInput.addEventListener("input", handleUserInput);
  dom.avatarInput.addEventListener("input", handleUserInput);
  dom.accentColorInput.addEventListener("input", handleUserInput);

  dom.channelIdInput.addEventListener("input", handleJoinDraftInput);

  dom.currentChatNameInput.addEventListener("change", handleCurrentChannelInput);
  dom.currentChatAccentInput.addEventListener("change", handleCurrentChannelInput);
  dom.currentHistoryCountInput.addEventListener("change", handleCurrentChannelInput);

  dom.loveFactButton.addEventListener("click", handleLoveFactClick);
  dom.copyInviteButton.addEventListener("click", handleCopyInvite);
  dom.clearAllStorageButton.addEventListener("click", handleClearAllStorage);
  dom.clearCurrentStorageButton.addEventListener("click", handleClearCurrentStorage);
  dom.exportButton.addEventListener("click", handleExportSettings);
  dom.importButton.addEventListener("click", () => dom.importFileInput.click());
  dom.importFileInput.addEventListener("change", handleImportSettings);
  dom.syncNowButton.addEventListener("click", handleManualSync);

  dom.themeToggle.addEventListener("change", handlePreferenceToggle);
  dom.muteToggle.addEventListener("change", handlePreferenceToggle);

  dom.openSetupButton.addEventListener("click", () => setActiveDrawer("setup"));
  dom.closeSetupButton.addEventListener("click", () => setActiveDrawer(null));
  dom.identityToggleButton.addEventListener("click", () => toggleIdentityPanel());
  dom.openChannelToggleButton.addEventListener("click", () => toggleOpenChannelPanel());
  dom.openInfoButton.addEventListener("click", () => setActiveDrawer("info"));
  dom.closeInfoButton.addEventListener("click", () => setActiveDrawer(null));
  dom.noticeButton.addEventListener("click", handleNoticeButtonClick);
  dom.drawerScrim.addEventListener("click", () => setActiveDrawer(null));

  document.addEventListener("click", handleDocumentClick);
  window.addEventListener("keydown", handleWindowKeydown);
  window.addEventListener("focus", handleWindowFocus);
  window.addEventListener("resize", scheduleToastStackPositionSync);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("beforeunload", () => {
    if (toastPositionFrame) {
      window.cancelAnimationFrame(toastPositionFrame);
      toastPositionFrame = 0;
    }

    state.client?.close();
    disconnectPanelPresence();
  });
}

function scheduleToastStackPositionSync() {
  if (toastPositionFrame) {
    window.cancelAnimationFrame(toastPositionFrame);
  }

  toastPositionFrame = window.requestAnimationFrame(() => {
    toastPositionFrame = 0;
    syncToastStackPosition();
  });
}

function syncToastStackPosition() {
  if (!dom.toastStack || !dom.chatScroll) {
    return;
  }

  dom.toastStack.style.top = `${dom.chatScroll.offsetTop + 14}px`;
}

function connectPanelPresence() {
  if (state.panelPresencePort || !canConnectToExtensionRuntime()) {
    return;
  }

  try {
    state.panelPresencePort = chrome.runtime.connect({ name: PANEL_PORT_NAME });
    state.panelPresencePort.onDisconnect.addListener(() => {
      state.panelPresencePort = null;
    });
  } catch (_error) {
    state.panelPresencePort = null;
  }
}

function disconnectPanelPresence() {
  if (!state.panelPresencePort) {
    return;
  }

  try {
    state.panelPresencePort.disconnect();
  } catch (_error) {
    // Ignore disconnect races during unload.
  }

  state.panelPresencePort = null;
}

function handleWindowFocus() {
  clearUnreadAttention();
}

function handleVisibilityChange() {
  if (document.visibilityState === "visible") {
    clearUnreadAttention();
  }
}

function handleWindowKeydown(event) {
  if (event.key !== "Escape") {
    return;
  }

  if (state.noticeOpen) {
    closeNotice();
    return;
  }

  if (state.activeDrawer) {
    setActiveDrawer(null);
  }
}

function setActiveDrawer(nextDrawer) {
  closeNotice();
  state.activeDrawer = nextDrawer;

  if (nextDrawer !== "setup" && state.identityPanelOpen) {
    state.identityPanelOpen = false;
    renderSetupPanels();
  }

  updateDrawerState();
}

function updateDrawerState() {
  const setupOpen = state.activeDrawer === "setup";
  const infoOpen = state.activeDrawer === "info";
  const anyOpen = setupOpen || infoOpen;

  dom.phoneShell.classList.toggle("show-setup", setupOpen);
  dom.phoneShell.classList.toggle("show-info", infoOpen);
  dom.phoneShell.classList.toggle("drawer-active", anyOpen);

  dom.setupDrawer.setAttribute("aria-hidden", String(!setupOpen));
  dom.infoDrawer.setAttribute("aria-hidden", String(!infoOpen));
  dom.drawerScrim.setAttribute("aria-hidden", String(!anyOpen));
}

function toggleIdentityPanel(nextOpen = !state.identityPanelOpen) {
  state.identityPanelOpen = Boolean(nextOpen);
  renderSetupPanels();
}

function toggleOpenChannelPanel(nextOpen = !state.openChannelPanelOpen) {
  if (shouldForceOpenJoinPanel()) {
    state.openChannelPanelOpen = true;
    renderSetupPanels();
    return;
  }

  state.openChannelPanelOpen = Boolean(nextOpen);
  renderSetupPanels();
}

function revealIdentityPanel() {
  state.identityPanelOpen = true;
  renderSetupPanels();
}

function revealOpenChannelPanel() {
  state.openChannelPanelOpen = true;
  renderSetupPanels();
}

function renderSetupPanels() {
  const forceJoinPanelOpen = shouldForceOpenJoinPanel();
  const joinPanelOpen = forceJoinPanelOpen || state.openChannelPanelOpen;
  const identityActionLabel = state.identityPanelOpen
    ? "Close identity settings"
    : (state.settings?.user?.displayName ? "Edit identity" : "Set up identity");

  dom.identityPanel.hidden = !state.identityPanelOpen;
  dom.identityToggleButton.setAttribute("aria-expanded", String(state.identityPanelOpen));
  renderInlineActionIcon(dom.identityToggleAction, {
    icon: state.identityPanelOpen ? "x" : "pencil-line",
    label: identityActionLabel,
  });

  dom.openChannelBody.hidden = !joinPanelOpen;
  dom.openChannelToggleButton.hidden = forceJoinPanelOpen;
  dom.openChannelToggleButton.setAttribute("aria-expanded", String(joinPanelOpen));
  renderButtonContent(dom.openChannelToggleButton, {
    icon: "x",
    label: joinPanelOpen ? "Hide open channel form" : "Create new channel",
    iconOnly: true,
  });
}

function renderInlineActionIcon(target, { icon, label }) {
  if (!target) {
    return;
  }

  const content = document.createElement("span");
  content.className = "drawer-inline-action-content";
  content.append(createIcon(icon, { size: 14, className: "ui-icon" }));

  const srLabel = document.createElement("span");
  srLabel.className = "sr-only";
  srLabel.textContent = label;
  content.append(srLabel);

  target.replaceChildren(content);
  target.setAttribute("title", label);
}

function shouldForceOpenJoinPanel() {
  return !state.currentChat?.channelId && (state.settings?.channels?.length || 0) === 0;
}

function shouldOpenJoinPanelByDefault() {
  if (shouldForceOpenJoinPanel()) {
    return true;
  }

  const draftChannelId = state.settings?.joinDraft?.channelId || "";

  return Boolean(draftChannelId)
    && !findStoredChannel(state.settings?.channels || [], draftChannelId)
    && state.currentChat?.channelId !== draftChannelId;
}

async function handleUserInput() {
  state.settings.user = normalizeUserIdentity({
    displayName: dom.displayNameInput.value,
    avatarUrl: dom.avatarInput.value,
    color: dom.accentColorInput.value,
  });

  updateUserPreview();
  updateChatHeader();
  await persistSettings();
}

async function handleJoinDraftInput() {
  state.settings.joinDraft = normalizeJoinDraft({
    channelId: dom.channelIdInput.value,
  });

  renderNotice();
  updateChatHeader();
  updateButtonStates();
  await persistSettings();
}

async function handleCurrentChannelInput(event) {
  if (!state.currentChat?.channelId) {
    return;
  }

  const shouldPublish = state.client?.state === "connected";

  await updateCurrentChannelSettings({
    chatName: dom.currentChatNameInput.value,
    accentColor: dom.currentChatAccentInput.value,
    historyCount: dom.currentHistoryCountInput.value,
  }, {
    persist: true,
    publishMeta: shouldPublish,
  });
}

async function handlePreferenceToggle() {
  state.settings.preferences.theme = dom.themeToggle.checked ? "paper" : "dusk";
  state.settings.preferences.mutePresenceNotes = dom.muteToggle.checked;
  applyPreferences();
  await persistSettings();
}

async function handleJoinSubmit(event) {
  event.preventDefault();
  await prepareWebNotifications({ promptIfNeeded: true });

  const user = normalizeUserIdentity(state.settings.user);
  const draftChannelId = state.settings.joinDraft.channelId;
  const storedChannel = findStoredChannel(state.settings.channels, draftChannelId);
  const channel = normalizeStoredChannel(
    {
      ...storedChannel,
      channelId: draftChannelId,
      accentColor: storedChannel?.accentColor || state.settings.user.color,
    },
    storedChannel || { channelId: draftChannelId },
  );

  await joinChat(user, channel);

  if (state.client?.state === "connected" && state.currentChat?.channelId === channel.channelId) {
    state.openChannelPanelOpen = false;
    renderSetupPanels();
  }
}

async function handleLeaveClick() {
  await disconnectClient({ preserveChat: false, preserveMessages: false });
  clearBanner();
  setActiveDrawer(null);
  state.settings.lastOpenedChat = null;
  applyCurrentChannelToInputs();
  await persistSettings();
  state.openChannelPanelOpen = shouldOpenJoinPanelByDefault();
  renderSetupPanels();
  pushToast("Left the channel.");
}

async function handleSendMessage(event) {
  event.preventDefault();

  const text = dom.messageInput.value.trim();

  if (!state.client || !text) {
    return;
  }

  dom.messageInput.value = "";
  updateButtonStates();

  try {
    await state.client.publish({
      type: "chat-message",
      messageId: crypto.randomUUID(),
      text,
      senderName: state.settings.user.displayName,
      senderKey: currentSenderKey(),
      senderDeviceId: currentDeviceId(),
      avatar: resolveAvatarValue(state.settings.user.avatarUrl, state.settings.user.displayName),
      avatarUrl: state.settings.user.avatarUrl,
      color: state.settings.user.color,
      ts: Math.floor(Date.now() / 1000),
    });
  } catch (error) {
    dom.messageInput.value = text;
    updateButtonStates();
    showBanner(error.message || "Unable to send the message.", "error");
  }
}

function handleComposerKeydown(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    dom.composerForm.requestSubmit();
  }
}

async function handleCopyInvite() {
  const activeChat = state.currentChat || findStoredChannel(state.settings.channels, state.settings.joinDraft.channelId);

  if (!activeChat?.channelId) {
    showBanner("Open or load a channel before copying an invite.", "warning");
    return;
  }

  const inviteText = [
    activeChat.chatName || "Koalagram",
    `Channel ID: ${activeChat.channelId}`,
    "",
    "Open the Koalagram extension, or webapp, paste the channel ID, set your name if needed, and open the channel.",
  ].join("\n");

  try {
    await navigator.clipboard.writeText(inviteText);
    pushToast("Invite copied to the clipboard.");
  } catch (error) {
    showBanner(error.message || "Clipboard access failed.", "error");
  }
}

function handleLoveFactClick() {
  playLoveBurst();
  pushToast(pickRandomFact(), { durationMs: 5000 });
}

function playLoveBurst() {
  if (!dom.loveFactButton || !dom.phoneShell) {
    return;
  }

  dom.loveFactButton.classList.remove("love-button-active");
  void dom.loveFactButton.offsetWidth;
  dom.loveFactButton.classList.add("love-button-active");

  if (loveButtonResetTimer) {
    window.clearTimeout(loveButtonResetTimer);
  }

  loveButtonResetTimer = window.setTimeout(() => {
    dom.loveFactButton?.classList.remove("love-button-active");
    loveButtonResetTimer = null;
  }, LOVE_BUTTON_ACTIVE_MS);

  spawnLoveBurstParticles();
}

function spawnLoveBurstParticles() {
  if (!dom.loveFactButton || !dom.phoneShell) {
    return;
  }

  const shellRect = dom.phoneShell.getBoundingClientRect();
  const buttonRect = dom.loveFactButton.getBoundingClientRect();
  const originX = buttonRect.left - shellRect.left + (buttonRect.width / 2);
  const originY = buttonRect.top - shellRect.top + (buttonRect.height / 2);

  for (let index = 0; index < LOVE_BURST_PARTICLE_COUNT; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const distance = 26 + (Math.random() * 34);
    const driftX = Math.cos(angle) * distance;
    const driftY = (Math.sin(angle) * distance) - 10 + (Math.random() * 14);
    const particle = document.createElement("span");
    const iconSize = 10 + Math.floor(Math.random() * 6);

    particle.className = "love-burst-heart";
    particle.style.setProperty("--burst-origin-x", `${originX.toFixed(2)}px`);
    particle.style.setProperty("--burst-origin-y", `${originY.toFixed(2)}px`);
    particle.style.setProperty("--burst-drift-x", `${driftX.toFixed(2)}px`);
    particle.style.setProperty("--burst-drift-y", `${driftY.toFixed(2)}px`);
    particle.style.setProperty("--burst-rotate", `${(-28 + (Math.random() * 56)).toFixed(2)}deg`);
    particle.style.setProperty("--burst-scale", `${(0.72 + (Math.random() * 0.58)).toFixed(2)}`);
    particle.style.animationDuration = `${680 + Math.round(Math.random() * 220)}ms`;
    particle.style.animationDelay = `${index * 18}ms`;
    particle.append(createIcon("heart", { size: iconSize, className: "love-burst-icon" }));
    dom.phoneShell.append(particle);
    particle.addEventListener("animationend", () => particle.remove(), { once: true });
  }
}

async function handleExportSettings() {
  const exportPayload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: state.settings,
  };

  const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
    type: "application/json",
  });
  const downloadUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = downloadUrl;
  anchor.download = `koalagram-settings-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();

  URL.revokeObjectURL(downloadUrl);
  pushToast("Settings exported.");
}

async function handleImportSettings(event) {
  const [file] = event.target.files || [];

  if (!file) {
    return;
  }

  try {
    const importedText = await file.text();
    const importedJson = JSON.parse(importedText);
    const installationId = state.settings?.installationId || crypto.randomUUID();

    state.settings = normalizeSettings(importedJson.settings || importedJson);
    state.settings.installationId = installationId;
    await persistSettings();
    state.identityPanelOpen = false;
    state.openChannelPanelOpen = shouldOpenJoinPanelByDefault();
    applyUserIdentityToInputs();
    applyJoinDraftToInputs();
    applyCurrentChannelToInputs();
    applyPreferences();
    updateStorageSummary();
    updateChatHeader();
    updateButtonStates();
    renderSetupPanels();
    pushToast("Settings imported.");
  } catch (error) {
    showBanner(error.message || "That settings file could not be imported.", "error");
  } finally {
    dom.importFileInput.value = "";
  }
}

async function handleManualSync() {
  if (!state.currentChat?.channelId) {
    showBanner("Open a channel before requesting a peer sync.", "warning");
    return;
  }

  if (!state.client || state.client.state !== "connected") {
    showBanner("Reconnect to the channel before requesting a peer sync.", "warning");
    return;
  }

  try {
    await requestHistorySync("manual");
    pushToast("Requested a history sync from connected peers.");
  } catch (error) {
    showBanner(error.message || "Unable to request a history sync from connected peers.", "error");
  }
}

async function handleClearCurrentStorage() {
  const channelId = state.currentChat?.channelId || state.settings.joinDraft.channelId;

  if (!channelId) {
    showBanner("Load a channel before clearing its local messages.", "warning");
    return;
  }

  await removeChannelData(channelId, {
    clearCurrentView: true,
    removeChannel: false,
    removeLastOpened: false,
  });
  pushToast("Cleared local messages for this channel.");
}

async function handleClearAllStorage() {
  const confirmed = window.confirm("Clear all locally saved channels and message history?");

  if (!confirmed) {
    return;
  }

  state.settings.channelHistory = {};
  state.settings.channels = [];
  state.settings.lastOpenedChat = null;
  state.settings.joinDraft = { channelId: "" };

  if (!state.client) {
    state.currentChat = null;
    clearMessages();
    renderStatus("idle");
    applyCurrentChannelToInputs();
    applyJoinDraftToInputs();
    updateChatHeader();
  } else {
    clearMessages();
    applyJoinDraftToInputs();
  }

  await persistSettings();
  state.openChannelPanelOpen = shouldOpenJoinPanelByDefault();
  updateStorageSummary();
  renderSetupPanels();
  pushToast("Cleared all local channel data.");
}

async function handleOpenStoredChannel(channel) {
  state.settings.joinDraft = { channelId: channel.channelId };
  await persistSettings();
  applyJoinDraftToInputs();

  await joinChat(normalizeUserIdentity(state.settings.user), normalizeStoredChannel(channel));

  if (state.client?.state === "connected" && state.currentChat?.channelId === channel.channelId) {
    state.openChannelPanelOpen = false;
    renderSetupPanels();
  }
}

async function handleDeleteStoredChannel(channel) {
  const label = channel.chatName || shortChannelId(channel.channelId);
  const confirmed = window.confirm(`Remove "${label}" and its local message history from this device?`);

  if (!confirmed) {
    return;
  }

  await removeChannelData(channel.channelId, {
    clearCurrentView: state.currentChat?.channelId === channel.channelId,
    removeChannel: true,
    removeLastOpened: state.settings.lastOpenedChat?.channelId === channel.channelId,
  });
  state.openChannelPanelOpen = shouldOpenJoinPanelByDefault();
  renderSetupPanels();
  pushToast(`Removed ${label}.`);
}

init().catch((error) => {
  showBanner(error.message || "Koalagram failed to initialize.", "error");
});
