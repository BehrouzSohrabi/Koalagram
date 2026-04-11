import { avatarLetter, normalizeAvatarUrl } from "../../shared/chat.js";

export function applyAvatar(element, { imageUrl = "", label = "", color = "" } = {}) {
  if (!element) {
    return;
  }

  const avatarUrl = normalizeAvatarUrl(imageUrl);
  element.style.setProperty("--chat-accent", color);
  element.style.setProperty("--message-accent", color);
  element.classList.toggle("avatar-has-image", Boolean(avatarUrl));
  element.replaceChildren();

  if (!avatarUrl) {
    element.textContent = avatarLetter(label);
    return;
  }

  const image = document.createElement("img");
  image.className = "avatar-image";
  image.src = avatarUrl;
  image.alt = "";
  image.loading = "lazy";

  image.addEventListener("error", () => {
    element.classList.remove("avatar-has-image");
    element.replaceChildren();
    element.textContent = avatarLetter(label);
  }, { once: true });

  element.append(image);
}
