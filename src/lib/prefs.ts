// Local UI preferences: browser-only, one localStorage key each. Not in the
// database — they say how this device shows things, not what is studied.

/** Show how many cards are still due on the Learn page. Off by default. */
const COUNTER_KEY = "word-leren:counter";

export const showCounter = () => localStorage.getItem(COUNTER_KEY) === "1";

export const setShowCounter = (on: boolean) =>
  localStorage.setItem(COUNTER_KEY, on ? "1" : "0");
