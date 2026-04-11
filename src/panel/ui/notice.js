import { shortChannelId } from "../../shared/chat.js";
import { createIcon } from "../../lib/ui-icons.js";
import { NOTICE_META } from "../config.js";
import { dom } from "../dom.js";
import { state } from "../state.js";
import { renderButtonContent } from "./helpers.js";

const DEFAULT_TOAST_DURATION_MS = 2200;
const TOAST_REMOVAL_BUFFER_MS = 600;
const SUCCESS_NOTICE_VISIBLE_MS = 5000;
const NOTICE_FADE_OUT_MS = 220;

export function handleNoticeButtonClick(event) {
  event.stopPropagation();

  if (!state.notice && !resolveFallbackNotice()) {
    return;
  }

  state.noticeOpen = !state.noticeOpen;
  renderNotice();
}

export function handleDocumentClick(event) {
  if (!state.noticeOpen || dom.noticeShell?.contains(event.target)) {
    return;
  }

  closeNotice();
}

export function closeNotice() {
  if (!state.noticeOpen) {
    return;
  }

  state.noticeOpen = false;
  renderNotice();
}

export function showBanner(message, tone = "info") {
  clearNoticeTimers();
  dom.noticeButton.classList.remove("notice-button-fading");

  state.noticeOpen = false;
  state.notice = {
    id: crypto.randomUUID(),
    message,
    tone: NOTICE_META[tone] ? tone : "info",
  };
  renderNotice();
  announceNotice(`${NOTICE_META[state.notice.tone].title}: ${message}`);

  if (state.notice.tone === "success") {
    scheduleSuccessNoticeHide(state.notice.id);
  }
}

export function clearBanner() {
  clearNoticeTimers();
  state.notice = null;
  state.noticeOpen = false;
  dom.noticeButton.classList.remove("notice-button-fading");
  renderNotice();

  if (state.noticeAnnouncementTimer) {
    window.clearTimeout(state.noticeAnnouncementTimer);
    state.noticeAnnouncementTimer = null;
  }

  dom.noticeLiveRegion.textContent = "";
}

export function renderNotice() {
  const notice = state.notice || resolveFallbackNotice();

  if (!notice) {
    dom.noticeButton.hidden = true;
    dom.noticeButton.classList.remove("notice-button-fading");
    dom.noticeButton.dataset.tone = "";
    dom.noticeButton.setAttribute("aria-expanded", "false");
    dom.noticeButton.removeAttribute("title");
    dom.noticeButton.setAttribute("aria-label", "Show latest notice");
    dom.noticePopover.hidden = true;
    dom.noticePopover.dataset.tone = "";
    dom.noticeTitle.textContent = "Notice";
    dom.noticeMessage.textContent = "";
    dom.noticePopoverIcon.replaceChildren();
    dom.noticeButton.replaceChildren();
    return;
  }

  const tone = NOTICE_META[notice.tone] ? notice.tone : "info";
  const meta = NOTICE_META[tone];

  dom.noticeButton.hidden = false;
  dom.noticeButton.dataset.tone = tone;
  dom.noticePopover.dataset.tone = tone;
  renderButtonContent(dom.noticeButton, {
    icon: meta.icon,
    label: meta.title,
    iconOnly: true,
  });
  dom.noticeButton.setAttribute("aria-label", `${meta.title}: ${notice.message}`);
  dom.noticeButton.setAttribute("title", `${meta.title}: ${notice.message}`);
  dom.noticeButton.setAttribute("aria-expanded", String(state.noticeOpen));

  dom.noticeTitle.textContent = meta.title;
  dom.noticeMessage.textContent = notice.message;
  dom.noticePopover.hidden = !state.noticeOpen;
  dom.noticePopoverIcon.replaceChildren(createIcon(meta.icon, { size: 18, className: "ui-icon" }));
}

export function pushToast(message, { durationMs = DEFAULT_TOAST_DURATION_MS } = {}) {
  const item = document.createElement("div");
  const visibleDurationMs = Number.isFinite(durationMs) ? Math.max(0, durationMs) : DEFAULT_TOAST_DURATION_MS;

  item.className = "toast";
  item.textContent = message;
  dom.toastStack.append(item);

  window.setTimeout(() => {
    item.classList.add("toast-hide");
  }, visibleDurationMs);

  window.setTimeout(() => {
    item.remove();
  }, visibleDurationMs + TOAST_REMOVAL_BUFFER_MS);
}

function announceNotice(message) {
  if (state.noticeAnnouncementTimer) {
    window.clearTimeout(state.noticeAnnouncementTimer);
  }

  dom.noticeLiveRegion.textContent = "";

  state.noticeAnnouncementTimer = window.setTimeout(() => {
    dom.noticeLiveRegion.textContent = message;
    state.noticeAnnouncementTimer = null;
  }, 20);
}

function resolveFallbackNotice() {
  const connectionState = state.client?.state || "idle";
  const channelId = state.currentChat?.channelId || state.settings?.joinDraft?.channelId || "";

  if (connectionState === "connected") {
    return null;
  }

  if (connectionState === "error") {
    return {
      tone: "error",
      message: channelId
        ? `Connection problem on ${shortChannelId(channelId)}. Open the channel again to retry.`
        : "Connection problem. Enter a channel ID to try again.",
    };
  }

  if (connectionState === "reconnecting") {
    return {
      tone: "warning",
      message: channelId
        ? `Reconnecting to ${shortChannelId(channelId)}.`
        : "Reconnecting to the channel.",
    };
  }

  if (connectionState === "closed") {
    return {
      tone: "warning",
      message: channelId
        ? `Connection closed for ${shortChannelId(channelId)}. Open the channel again to reconnect.`
        : "Connection closed. Enter a channel ID to open a chat.",
    };
  }

  if (!channelId) {
    return {
      tone: "warning",
      message: "Enter a Scaledrone channel ID to open a chat.",
    };
  }

  return {
    tone: "warning",
    message: `Open ${shortChannelId(channelId)} to connect.`,
  };
}

function scheduleSuccessNoticeHide(noticeId) {
  state.noticeAutoHideTimer = window.setTimeout(() => {
    if (state.notice?.id !== noticeId || state.notice?.tone !== "success") {
      return;
    }

    state.noticeOpen = false;
    renderNotice();
    dom.noticeButton.classList.add("notice-button-fading");

    state.noticeFadeTimer = window.setTimeout(() => {
      if (state.notice?.id !== noticeId || state.notice?.tone !== "success") {
        return;
      }

      state.notice = null;
      state.noticeOpen = false;
      dom.noticeButton.classList.remove("notice-button-fading");
      state.noticeFadeTimer = null;
      renderNotice();
    }, NOTICE_FADE_OUT_MS);

    state.noticeAutoHideTimer = null;
  }, SUCCESS_NOTICE_VISIBLE_MS);
}

function clearNoticeTimers() {
  if (state.noticeAutoHideTimer) {
    window.clearTimeout(state.noticeAutoHideTimer);
    state.noticeAutoHideTimer = null;
  }

  if (state.noticeFadeTimer) {
    window.clearTimeout(state.noticeFadeTimer);
    state.noticeFadeTimer = null;
  }
}
