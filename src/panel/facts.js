export const PANEL_FACTS = Object.freeze([
  { category: "Life", text: "Motion often changes mood faster than overthinking does." },
  { category: "Life", text: "Rest is part of progress, not a reward for finishing." },
  { category: "Life", text: "One useful next step can shrink a hard day." },
  { category: "Life", text: "How you start the morning can shape the rest of the day." },
  { category: "Life", text: "People usually adjust to change more quickly than they expect." },
  { category: "Life", text: "Attention is a resource; what gets it tends to grow." },
  { category: "Life", text: "Walking can help solve problems by changing pace and perspective." },
  { category: "Life", text: "Tiny habits usually last longer than dramatic resets." },
  { category: "Life", text: "Your environment affects choices before willpower even shows up." },
  { category: "Life", text: "Consistency usually beats intensity over time." },

  { category: "Wisdom", text: "Clarity often appears after you name the real problem plainly." },
  { category: "Wisdom", text: "The best answer is often the one that brings the most clarity." },
  { category: "Wisdom", text: "Listening longer usually teaches more than replying faster." },
  { category: "Wisdom", text: "Simple explanations are often the strongest ones." },
  { category: "Wisdom", text: "Boundaries protect energy better than apologies repair burnout." },
  { category: "Wisdom", text: "People trust consistency more than perfection." },
  { category: "Wisdom", text: "The right question can change a whole conversation." },
  { category: "Wisdom", text: "What you practice becomes part of who you are." },
  { category: "Wisdom", text: "Patience gets easier when you know what you are waiting for." },
  { category: "Wisdom", text: "Good judgment is usually quiet, not dramatic." },

  { category: "Romance", text: "Long-term closeness is built more by small rituals than grand gestures." },
  { category: "Romance", text: "Eye contact and shared laughter are strong signs of connection." },
  { category: "Romance", text: "Feeling understood is one of the fastest ways closeness deepens." },
  { category: "Romance", text: "Turning toward small bids for attention helps couples feel closer." },
  { category: "Romance", text: "Songs and scents can make romantic memories feel more vivid." },
  { category: "Romance", text: "Kindness tends to stay attractive longer than charm." },
  { category: "Romance", text: "A thoughtful message can mean more than an expensive gift." },
  { category: "Romance", text: "Shared routines can make a relationship feel safer and warmer." },
  { category: "Romance", text: "Curiosity keeps chemistry alive longer than performance does." },
  { category: "Romance", text: "Being genuinely attentive often feels more romantic than a perfect line." },

  { category: "Spiritual", text: "Silence can reveal what noise keeps hidden." },
  { category: "Spiritual", text: "Peace often returns when you stop forcing clarity." },
  { category: "Spiritual", text: "Gratitude changes the way ordinary life feels." },
  { category: "Spiritual", text: "What you give your attention to can become sacred to you." },
  { category: "Spiritual", text: "Stillness can be a form of strength." },
  { category: "Spiritual", text: "Letting go is sometimes a deeper kind of trust." },
  { category: "Spiritual", text: "A slower pace can make room for deeper truth." },
  { category: "Spiritual", text: "Wonder grows when you meet life with presence." },
  { category: "Spiritual", text: "Inner quiet can make wise direction easier to hear." },
  { category: "Spiritual", text: "Not every answer arrives in words." },
]);

export function pickRandomFact() {
  const factIndex = Math.floor(Math.random() * PANEL_FACTS.length);
  const fact = PANEL_FACTS[factIndex];

  if (!fact) {
    return "";
  }

  return `${fact.category}: ${fact.text}`;
}
