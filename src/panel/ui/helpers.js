import { createIcon } from "../../lib/ui-icons.js";
import { STATIC_BUTTONS } from "../config.js";

export function applyStaticUiIcons(dom) {
  for (const [key, icon, options = {}] of STATIC_BUTTONS) {
    const button = dom[key];

    if (!button) {
      continue;
    }

    renderButtonContent(button, {
      icon,
      label: options.label ?? (button.textContent.trim() || button.getAttribute("aria-label") || ""),
      iconOnly: options.iconOnly ?? false,
    });
  }
}

export function renderButtonContent(button, { icon, label, iconOnly = false, spin = false }) {
  if (!button) {
    return;
  }

  renderIconLabel(button, {
    icon,
    label,
    className: "button-content",
    labelClassName: "button-label",
    iconOnly,
    spin,
  });

  button.classList.toggle("button-icon-only", iconOnly);

  if (iconOnly) {
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
  } else {
    button.removeAttribute("title");
  }
}

export function renderIconLabel(
  target,
  {
    icon,
    label,
    className = "icon-label",
    labelClassName = "icon-label-text",
    iconOnly = false,
    size = 16,
    spin = false,
  },
) {
  const content = document.createElement("span");
  content.className = className;

  const iconNode = createIcon(icon, {
    size,
    className: `ui-icon${spin ? " icon-spin" : ""}`,
  });

  content.append(iconNode);

  if (!iconOnly) {
    const labelNode = document.createElement("span");
    labelNode.className = labelClassName;
    labelNode.textContent = label;
    content.append(labelNode);
  }

  target.replaceChildren(content);
}

export function renderCollection(
  container,
  items,
  {
    className,
    emptyClassName = className,
    emptyText = "",
    createEmptyItem = null,
    createItem,
  },
) {
  container.className = items.length === 0 ? emptyClassName : className;

  if (items.length === 0) {
    if (createEmptyItem) {
      container.replaceChildren(createEmptyItem());
      return;
    }

    container.textContent = emptyText;
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const item of items) {
    fragment.append(createItem(item));
  }

  container.replaceChildren(fragment);
}
