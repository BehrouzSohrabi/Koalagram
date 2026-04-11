const SVG_NS = "http://www.w3.org/2000/svg";

const ICONS = {
  "alert-triangle": [
    ["path", { d: "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" }],
    ["path", { d: "M12 9v4" }],
    ["path", { d: "M12 17h.01" }],
  ],
  "circle-check": [
    ["circle", { cx: "12", cy: "12", r: "10" }],
    ["path", { d: "m9 12 2 2 4-4" }],
  ],
  download: [
    ["path", { d: "M12 3v12" }],
    ["path", { d: "m7 10 5 5 5-5" }],
    ["path", { d: "M5 21h14" }],
  ],
  heart: [
    ["path", { d: "m12 21-1.35-1.23C5.4 15 2 11.92 2 8.15 2 5.08 4.42 3 7.2 3c1.57 0 3.08.74 4.05 1.9C12.72 3.74 14.23 3 15.8 3 18.58 3 21 5.08 21 8.15c0 3.77-3.4 6.85-8.65 11.62Z" }],
  ],
  info: [
    ["circle", { cx: "12", cy: "12", r: "10" }],
    ["path", { d: "M12 16v-4" }],
    ["path", { d: "M12 8h.01" }],
  ],
  "log-in": [
    ["path", { d: "M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" }],
    ["path", { d: "m10 17-5-5 5-5" }],
    ["path", { d: "M15 12H5" }],
  ],
  "log-out": [
    ["path", { d: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" }],
    ["path", { d: "m16 17 5-5-5-5" }],
    ["path", { d: "M21 12H9" }],
  ],
  menu: [
    ["path", { d: "M4 12h16" }],
    ["path", { d: "M4 6h16" }],
    ["path", { d: "M4 18h16" }],
  ],
  "octagon-alert": [
    ["path", { d: "M7.86 2h8.28L22 7.86v8.28L16.14 22H7.86L2 16.14V7.86z" }],
    ["path", { d: "M12 8v4" }],
    ["path", { d: "M12 16h.01" }],
  ],
  "pencil-line": [
    ["path", { d: "M12 20h9" }],
    ["path", { d: "M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z" }],
  ],
  "refresh-cw": [
    ["path", { d: "M21 12a9 9 0 0 0-15.5-6.36L3 8" }],
    ["path", { d: "M3 3v5h5" }],
    ["path", { d: "M3 12a9 9 0 0 0 15.5 6.36L21 16" }],
    ["path", { d: "M16 16h5v5" }],
  ],
  save: [
    ["path", { d: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" }],
    ["path", { d: "M14 2v4H8V2" }],
    ["path", { d: "M8 14h8" }],
    ["path", { d: "M8 18h8" }],
  ],
  send: [
    ["path", { d: "M22 2 11 13" }],
    ["path", { d: "m22 2-7 20-4-9-9-4Z" }],
  ],
  "share-2": [
    ["circle", { cx: "18", cy: "5", r: "3" }],
    ["circle", { cx: "6", cy: "12", r: "3" }],
    ["circle", { cx: "18", cy: "19", r: "3" }],
    ["path", { d: "M8.59 13.51 15.42 17.49" }],
    ["path", { d: "M15.41 6.51 8.59 10.49" }],
  ],
  "trash-2": [
    ["path", { d: "M3 6h18" }],
    ["path", { d: "M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" }],
    ["path", { d: "m19 6-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" }],
    ["path", { d: "M10 11v6" }],
    ["path", { d: "M14 11v6" }],
  ],
  upload: [
    ["path", { d: "M12 21V9" }],
    ["path", { d: "m7 14 5-5 5 5" }],
    ["path", { d: "M5 3h14" }],
  ],
  x: [
    ["path", { d: "M18 6 6 18" }],
    ["path", { d: "m6 6 12 12" }],
  ],
};

export function createIcon(name, { size = 18, className = "", label = "" } = {}) {
  const shapes = ICONS[name] || ICONS.info;
  const icon = document.createElementNS(SVG_NS, "svg");

  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("width", String(size));
  icon.setAttribute("height", String(size));
  icon.setAttribute("fill", "none");
  icon.setAttribute("stroke", "currentColor");
  icon.setAttribute("stroke-width", "2");
  icon.setAttribute("stroke-linecap", "round");
  icon.setAttribute("stroke-linejoin", "round");
  icon.setAttribute("focusable", "false");

  if (className) {
    icon.setAttribute("class", className);
  }

  if (label) {
    icon.setAttribute("role", "img");
    icon.setAttribute("aria-label", label);
  } else {
    icon.setAttribute("aria-hidden", "true");
  }

  for (const [tagName, attributes] of shapes) {
    const node = document.createElementNS(SVG_NS, tagName);

    for (const [key, value] of Object.entries(attributes)) {
      node.setAttribute(key, value);
    }

    icon.append(node);
  }

  return icon;
}
