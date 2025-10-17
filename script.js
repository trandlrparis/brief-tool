/* LR Paris Brief Tool — hardened patch
   - Safer draft restore (won't hang UI)
   - Clear "bad" drafts automatically
   - More tolerant Next-button logic
   - Clear banner if speech API is unavailable/blocked
   - Same flow: Product vs Packaging → multi-select types → only relevant follow-ups
*/

(() => {
  // ---------- DOM ----------
  const screens = {
    welcome: document.getElementById("welcome-screen"),
    questions: document.getElementById("question-screen"),
    complete: document.getElementById("completion-screen"),
  };
  const startBtn = document.getElementById("start-btn");
  const qText = document.getElementById("question-text");
  const choicesBox = document.getElementById("choices");
  const voiceInput = document.getElementById("voice-input");
  const nextBtn = document.getElementById("next-btn");
  const backBtn = document.getElementById("back-btn");
  const skipBtn = document.getElementById("skip-btn");
  const progress = document.getElementById("progress");
  const autosaveBadge = document.getElementById("autosave");

  const exportJSONBtn = document.getElementById("export-json");
  const exportPDFBtn = document.getElementById("export-pdf");
  const restartBtn = document.getElementById("restart");

  const asanaOpenBtn = document.getElementById("asana-open");
  const asanaModal = document.getElem
