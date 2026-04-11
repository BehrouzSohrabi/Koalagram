export const PANEL_SLOGANS = Object.freeze([
  "This is where you actually talk.",
  "A place for real chats.",
  "Where conversations feel like home.",
  "Your thoughts and conversations.",
  "Come as you are. Chat as you feel.",
  "Where talking feels easy.",
  "Your space to just… talk.",
  "Real chats. No pressure.",
  "Where messages feel true.",
  "Stay a while. Let’s chat.",
  "Less noise. More real talk.",
  "A calmer place to connect.",
  "Chat like you mean it.",
  "Where you don’t have to overthink it.",
  "Just open, type, and be chill.",
]);

export function pickRandomSlogan() {
  const sloganIndex = Math.floor(Math.random() * PANEL_SLOGANS.length);
  return PANEL_SLOGANS[sloganIndex] ?? "";
}
