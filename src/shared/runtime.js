export function getRuntimeMode() {
  return globalThis.chrome?.runtime?.id ? "extension" : "web";
}

export function hasExtensionStorage() {
  return Boolean(globalThis.chrome?.storage?.local);
}

export function canConnectToExtensionRuntime() {
  return typeof globalThis.chrome?.runtime?.connect === "function";
}

export function canSetExtensionActionBadge() {
  return Boolean(globalThis.chrome?.action);
}
