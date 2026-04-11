import { currentSenderKey as buildSenderKey } from "../shared/chat.js";
import { writeStoredSettings } from "../shared/storage.js";
import { PERSIST_DEBOUNCE_MS } from "./config.js";
import { state } from "./state.js";
import { showBanner } from "./ui/notice.js";

export async function persistSettings() {
  if (state.deferredPersistTimer) {
    window.clearTimeout(state.deferredPersistTimer);
    state.deferredPersistTimer = null;
  }

  await writeStoredSettings(state.settings, { allowLocalFallback: true });
}

export function persistSettingsDeferred() {
  if (state.deferredPersistTimer) {
    return;
  }

  state.deferredPersistTimer = window.setTimeout(() => {
    state.deferredPersistTimer = null;
    writeStoredSettings(state.settings, { allowLocalFallback: true }).catch((error) => {
      showBanner(error.message || "Unable to save local history.", "warning");
    });
  }, PERSIST_DEBOUNCE_MS);
}

export function currentDeviceId() {
  return state.settings?.installationId || "";
}

export function currentSenderKey() {
  return buildSenderKey(state.settings?.user);
}
