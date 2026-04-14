export function getRuntimeMode() {
  return globalThis.chrome?.runtime?.id ? "extension" : "web";
}

export function hasExtensionStorage() {
  return getRuntimeMode() === "extension" && Boolean(globalThis.chrome?.storage?.local);
}

export function canConnectToExtensionRuntime() {
  return getRuntimeMode() === "extension" && typeof globalThis.chrome?.runtime?.connect === "function";
}

export function canSetExtensionActionBadge() {
  return getRuntimeMode() === "extension" && Boolean(globalThis.chrome?.action);
}
