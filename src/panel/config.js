import { MAX_STORED_MESSAGES } from "../shared/settings.js";

export const MAX_MESSAGES = 300;
export const MAX_SYNC_SHARE_MESSAGES = MAX_STORED_MESSAGES;
export const SYNC_CHUNK_SIZE = 50;
export const MAX_SYNC_TRACKED_IDS = 200;
export const PERSIST_DEBOUNCE_MS = 140;

export const NOTICE_META = {
  success: { icon: "circle-check", title: "Success" },
  info: { icon: "info", title: "Info" },
  warning: { icon: "alert-triangle", title: "Warning" },
  error: { icon: "octagon-alert", title: "Error" },
};

export const STATIC_BUTTONS = [
  ["openSetupButton", "menu", { label: "Open menu", iconOnly: true }],
  ["closeSetupButton", "x", { label: "Close menu", iconOnly: true }],
  ["closeInfoButton", "x", { label: "Close details", iconOnly: true }],
  ["openInfoButton", "info", { label: "Open details", iconOnly: true }],
  ["loveFactButton", "heart", { label: "Show a random fact", iconOnly: true }],
  ["copyInviteButton", "share-2", { label: "Copy invite", iconOnly: true }],
  ["exportButton", "download"],
  ["importButton", "upload"],
  ["syncNowButton", "refresh-cw"],
  ["clearCurrentStorageButton", "trash-2"],
  ["clearAllStorageButton", "trash-2"],
  ["leaveButton", "log-out"],
  ["sendButton", "send"],
];
