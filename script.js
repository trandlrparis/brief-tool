/* LR Paris Brief Tool — vanilla JS, no server
   - Free browser speech recognition (Web Speech API)
   - Product vs Packaging branching
   - Packaging: multi-select formats → only relevant follow-ups
   - Continuous recording while clicking
   - Autosave to localStorage
   - Export JSON
   - Client-side Asana (PAT) fallback: create task in project with notes
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
  const asanaModal = document.getElementById("asana-modal");
  const asanaTokenEl = document.getElementById("asana-token");
  const asanaProjectEl = document.getElementById("asana-project");
  const asanaTaskNameEl = document.getElementById("asana-task-name");
  const asanaCancelBtn = document.getElementById("asana-cancel");
  const asanaSendBtn = document.getElementById("asana-send");
  const asanaMsg = document.getElementById("asana-msg");

  // ---------- App State ----------
  const STORAGE_KEY = "lrp_brief_draft_v1";
  let state = {
    startedAt: null,
    branch: null, // "Product", "Packaging", or ["Product","Packaging"]
    packagingTypes: [],
    answers: [], // {id, question, type, choice(s), notes}
    transcript: "",
    queue: [], // ordered list of question objects
    step: 0,
  };

  // ---------- Utilities ----------
  const saveDraft = debounce(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    flash(autosaveBadge);
  }, 500);

  function loadDraft() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft && draft.queue && Array.isArray(draft.queue)) {
        state = draft;
      }
    } catch {}
  }

  function resetDraft() {
    state = {
      startedAt: null,
      branch: null,
      packagingTypes: [],
      answers: [],
      transcript: "",
      queue: [],
      step: 0,
    };
    localStorage.removeItem(STORAGE_KEY);
  }

  function flash(el) {
    el.classList.remove("show");
    // force reflow
    void el.offsetWidth;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 800);
  }

  function download(filename, data, mime = "application/json") {
    const blob = new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function setScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove("active"));
    screens[name].classList.add("active");
  }

  function setProgress() {
    const total = state.queue.length || 1;
    progress.textContent = `Step ${Math.min(state.step + 1, total)} of ${total}`;
  }

  function pushAnswer({ id, question, type, choices, notes }) {
    // upsert by id
    const idx = state.answers.findIndex(a => a.id === id);
    const payload = { id, question, type, choices, notes };
    if (idx >= 0) state.answers[idx] = payload; else state.answers.push(payload);
    saveDraft();
  }

  // ---------- Question Bank ----------
  // 0. Entry (Product vs Packaging)
  const entryQuestion = {
    id: "entry-branch",
    text: "What kind of brief are you creating?",
    type: "multi", // allow both
    options: ["Product", "Packaging"]
  };

  // 1. Packaging multi-select types
  const packagingTypeQuestion = {
    id: "pkg-types",
    text: "Which type(s) of packaging are you requesting?",
    type: "multi",
    options: [
      "Shopping Bag",
      "Rigid Box",
      "Foldable Box",
      "Sleeve",
      "Tube",
      "Pouch",
      "Tag / Label",
      "Card / Insert",
      "Sticker / Seal",
      "Other"
    ]
  };

  // 2. Follow-up banks (keep concise but useful; you can expand anytime)
  const BANK = {
    Product: [
      { id: "prod-desc", text: "Product description", type: "text" },
      { id: "prod-specs", text: "Key product specifications", type: "text" },
      { id: "prod-qty", text: "Quantity (units)", type: "text" },
      { id: "prod-target", text: "Target price (per unit or total)", type: "text" },
      { id: "prod-date", text: "Delivery date", type: "text" },
      { id: "prod-loc", text: "Delivery location", type: "text" },
      { id: "prod-eco", text: "Eco-friendly requirements?", type: "single", options: ["Yes","No","N/A"] },
    ],
    "Shopping Bag": [
      { id: "bag-material", text: "Bag material", type: "single", options: ["Paper","Fabric","Recycled","Other","Skip"] },
      { id: "bag-handle", text: "Handle type", type: "single", options: ["Ribbon","Rope","Die-cut","None","Skip"] },
      { id: "bag-print", text: "Printing", type: "multi", options: ["1-color","Full-color","Emboss","Deboss","Foil","None","Skip"] },
      { id: "bag-finish", text: "Finish", type: "single", options: ["Matte","Gloss","Laminated","None","Skip"] },
      { id: "bag-reinf", text: "Reinforcement", type: "single", options: ["Bottom","Top","Both","None","Skip"] },
      { id: "bag-size", text: "Approx size (L×W×H or WxHxD)", type: "text" },
      { id: "bag-qty", text: "Quantity", type: "text" },
      { id: "bag-target", text: "Target price", type: "text" },
      { id: "bag-ship", text: "Delivery date & location", type: "text" },
    ],
    "Rigid Box": [
      { id: "rbox-shape", text: "Box style", type: "single", options: ["2-piece","Magnetic","Drawer","Slipcase","Skip"] },
      { id: "rbox-insert", text: "Insert", type: "single", options: ["Foam","Paper","Pulp","None","Skip"] },
      { id: "rbox-print", text: "Printing", type: "multi", options: ["1-color","Full-color","Foil","Emboss","Deboss","Combo","Skip"] },
      { id: "rbox-finish", text: "Finish", type: "single", options: ["Matte","Gloss","Laminated","Texture","Skip"] },
      { id: "rbox-addons", text: "Add-ons", type: "multi", options: ["Ribbon closure","Magnet","Handle","None","Skip"] },
      { id: "rbox-size", text: "Approx size (L×W×H)", type: "text" },
      { id: "rbox-qty", text: "Quantity", type: "text" },
      { id: "rbox-target", text: "Target price", type: "text" },
      { id: "rbox-ship", text: "Delivery date & location", type: "text" },
    ],
    "Foldable Box": [
      { id: "fbox-style", text: "Foldable box style", type: "single", options: ["Mailer","Crash lock","Auto-lock","Other","Skip"] },
      { id: "fbox-print", text: "Printing", type: "multi", options: ["1-color","Full-color","Inside print","Foil","None","Skip"] },
      { id: "fbox-finish", text: "Finish", type: "single", options: ["Matte","Gloss","Laminated","None","Skip"] },
      { id: "fbox-size", text: "Approx size", type: "text" },
      { id: "fbox-qty", text: "Quantity", type: "text" },
      { id: "fbox-target", text: "Target price", type: "text" },
      { id: "fbox-ship", text: "Delivery date & location", type: "text" },
    ],
    "Sleeve": [
      { id: "slv-mat", text: "Sleeve material", type: "single", options: ["Paperboard","Cardstock","Other","Skip"] },
      { id: "slv-print", text: "Printing", type: "multi", options: ["1-color","Full-color","Foil","Emboss","None","Skip"] },
      { id: "slv-dims", text: "Approx size / fit", type: "text" },
      { id: "slv-qty", text: "Quantity", type: "text" },
      { id: "slv-target", text: "Target price", type: "text" },
      { id: "slv-ship", text: "Delivery date & location", type: "text" },
    ],
    "Tube": [
      { id: "tube-type", text: "Tube type", type: "single", options: ["Paper","Composite","Metal ends","Other","Skip"] },
      { id: "tube-print", text: "Printing", type: "multi", options: ["1-color","Full-color","Foil","Emboss","None","Skip"] },
      { id: "tube-size", text: "Approx size", type: "text" },
      { id: "tube-qty", text: "Quantity", type: "text" },
      { id: "tube-target", text: "Target price", type: "text" },
      { id: "tube-ship", text: "Delivery date & location", type: "text" },
    ],
    "Pouch": [
      { id: "pch-mat", text: "Pouch material", type: "single", options: ["Fabric","Recycled cotton","Nylon","Velvet","Other","Skip"] },
      { id: "pch-close", text: "Closure", type: "single", options: ["Drawstring","Zipper","Fold-over","None","Skip"] },
      { id: "pch-print", text: "Branding", type: "multi", options: ["Silkscreen","Embroidery","Label","None","Skip"] },
      { id: "pch-size", text: "Approx size", type: "text" },
      { id: "pch-qty", text: "Quantity", type: "text" },
      { id: "pch-target", text: "Target price", type: "text" },
      { id: "pch-ship", text: "Delivery date & location", type: "text" },
    ],
    "Tag / Label": [
      { id: "tag-type", text: "Type", type: "single", options: ["Hangtag","Woven label","Sticker label","Other","Skip"] },
      { id: "tag-print", text: "Branding", type: "multi", options: ["1-color","Full-color","Foil","Emboss","None","Skip"] },
      { id: "tag-size", text: "Approx size", type: "text" },
      { id: "tag-qty", text: "Quantity", type: "text" },
      { id: "tag-target", text: "Target price", type: "text" },
      { id: "tag-ship", text: "Delivery date & location", type: "text" },
    ],
    "Card / Insert": [
      { id: "card-stock", text: "Card stock", type: "single", options: ["Uncoated","Coated","Textured","Other","Skip"] },
      { id: "card-print", text: "Printing", type: "multi", options: ["1-color","Full-color","Foil","Emboss","None","Skip"] },
      { id: "card-size", text: "Size", type: "text" },
      { id: "card-qty", text: "Quantity", type: "text" },
      { id: "card-target", text: "Target price", type: "text" },
      { id: "card-ship", text: "Delivery date & location", type: "text" },
    ],
    "Sticker / Seal": [
      { id: "stk-type", text: "Type", type: "single", options: ["Paper","Vinyl","Foil","Embossed","Other","Skip"] },
      { id: "stk-shape", text: "Shape", type: "single", options: ["Round","Square","Custom","Skip"] },
      { id: "stk-print", text: "Printing", type: "multi", options: ["1-color","Full-color","Foil","Emboss","None","Skip"] },
      { id: "stk-size", text: "Size", type: "text" },
      { id: "stk-qty", text: "Quantity", type: "text" },
      { id: "stk-target", text: "Target price", type: "text" },
      { id: "stk-ship", text: "Delivery date & location", type: "text" },
    ],
    "Other": [
      { id: "oth-desc", text: "Describe the packaging item(s)", type: "text" },
      { id: "oth-qty", text: "Quantity", type: "text" },
      { id: "oth-target", text: "Target price", type: "text" },
      { id: "oth-ship", text: "Delivery date & location", type: "text" },
    ]
  };

  // ---------- Queue Builder ----------
  function buildQueue() {
    const q = [];
    q.push(entryQuestion); // always first

    // If entry includes Packaging, we must ask which types
    if (Array.isArray(state.branch) && state.branch.includes("Packaging")) {
      q.push(packagingTypeQuestion);
      // then, later, we append the selected type banks in order
    }
    if (Array.isArray(state.branch) && state.branch.includes("Product")) {
      // product questions will be appended after packaging sets (if both chosen)
      // we’ll append in finalizeQueue() after pkg types are actually picked
    }
    state.queue = q;
  }

  function finalizeQueue() {
    const q = [...state.queue];
    // Insert selected packaging sets after pkg-types question
    const pkgIdx = q.findIndex(x => x.id === "pkg-types");
    if (pkgIdx >= 0 && state.packagingTypes.length) {
      const inserts = [];
      state.packagingTypes.forEach(t => {
        const bank = BANK[t] || [];
        inserts.push(...bank);
      });
      q.splice(pkgIdx + 1, 0, ...inserts);
    }
    // If Product is chosen, append product bank at the end
    if (Array.isArray(state.branch) && state.branch.includes("Product")) {
      q.push(...BANK.Product);
    }
    state.queue = q;
  }

  // ---------- Rendering ----------
  function renderStep() {
    setProgress();
    const q = state.queue[state.step];
    if (!q) {
      // Done
      setScreen("complete");
      return;
    }
    qText.textContent = q.text;
    voiceInput.value = ""; // clear field each time
    nextBtn.disabled = true;

    // Choices
    choicesBox.innerHTML = "";
    if (q.type === "single" || q.type === "multi") {
      (q.options || []).forEach(opt => {
        const btn = document.createElement("button");
        btn.className = "choice";
        btn.textContent = opt;
        btn.dataset.selected = "false";
        btn.onclick = () => {
          if (q.type === "single") {
            // unselect others
            [...choicesBox.children].forEach(c => c.dataset.selected = "false");
            btn.dataset.selected = "true";
          } else {
            // toggle
            btn.dataset.selected = (btn.dataset.selected === "true") ? "false" : "true";
          }
          nextBtn.disabled = !hasSelection(q.type) && !voiceInput.value.trim();
        };
        choicesBox.appendChild(btn);
      });
    }

    // If text question, allow typing/voice only
    if (q.type === "text") {
      choicesBox.innerHTML = `<div class="hint">Answer by voice or type below.</div>`;
    }
  }

  function getSelections() {
    return [...choicesBox.querySelectorAll(".choice")]
      .filter(b => b.dataset.selected === "true")
      .map(b => b.textContent);
  }
  function hasSelection(type) {
    if (type === "text") return !!voiceInput.value.trim();
    return getSelections().length > 0;
  }

  // ---------- Navigation ----------
  nextBtn.onclick = () => {
    const q = state.queue[state.step];
    const choices = (q.type === "text") ? [] : getSelections();
    const notes = voiceInput.value.trim();

    // Save answer
    const answer = { id: q.id, question: q.text, type: q.type, choices, notes };
    pushAnswer(answer);

    // Special handling after entry-branch and pkg-types to expand queue
    if (q.id === "entry-branch") {
      // Allow multi
      state.branch = Array.from(new Set([ ...(choices || []), ...(state.branch || []) ]));
      buildQueue();
    }
    if (q.id === "pkg-types") {
      state.packagingTypes = choices;
      finalizeQueue();
    }

    state.step++;
    saveDraft();
    // Continue or finish
    if (state.step >= state.queue.length) {
      setScreen("complete");
    } else {
      renderStep();
    }
  };

  backBtn.onclick = () => {
    if (state.step <= 0) return;
    state.step--;
    renderStep();
  };

  skipBtn.onclick = () => {
    // push empty answer as Skip
    const q = state.queue[state.step];
    pushAnswer({ id: q.id, question: q.text, type: q.type, choices: ["Skip"], notes: "" });
    state.step++;
    if (state.step >= state.queue.length) setScreen("complete");
    else renderStep();
  };

  // Enable Next when user types
  voiceInput.addEventListener("input", () => {
    const q = state.queue[state.step];
    if (!q) return;
    nextBtn.disabled = !hasSelection(q.type);
  });

  // ---------- Speech Recognition ----------
  let recognition = null;
  let isListening = false;

  function initSpeech() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (evt) => {
      let interim = "";
      let finalText = "";
      for (let i = evt.resultIndex; i < evt.results.length; i++) {
        const tr = evt.results[i][0].transcript;
        if (evt.results[i].isFinal) finalText += tr + " ";
        else interim += tr;
      }
      // Append to state transcript and to current field
      if (finalText) {
        state.transcript += finalText;
        saveDraft();
        // If user hasn’t typed, reflect final into textarea (append)
        voiceInput.value = (voiceInput.value ? voiceInput.value + " " : "") + finalText.trim();
        const q = state.queue[state.step];
        if (q) nextBtn.disabled = !hasSelection(q.type);
      } else if (interim) {
        // show interim softly (not saved)
        // We’ll display interim inline without committing
        voiceInput.placeholder = interim;
      }
    };

    recognition.onerror = () => { /* ignore to keep going */ };
    recognition.onend = () => {
      // autobounce to keep it alive during the flow
      if (isListening) {
        try { recognition.start(); } catch {}
      }
    };
  }

  function startListening() {
    if (recognition) {
      isListening = true;
      try { recognition.start(); } catch {}
    }
  }

  // ---------- Export ----------
  exportJSONBtn.onclick = () => {
    const payload = {
      startedAt: state.startedAt,
      finishedAt: new Date().toISOString(),
      branch: state.branch,
      packagingTypes: state.packagingTypes,
      answers: state.answers,
      transcript: state.transcript
    };
    download(`brief_${Date.now()}.json`, JSON.stringify(payload, null, 2));
  };

  // Very simple PDF: print the completion screen with data
  exportPDFBtn.onclick = () => {
    const w = window.open("", "_blank");
    const payload = {
      branch: state.branch,
      packagingTypes: state.packagingTypes,
      answers: state.answers,
      transcript: state.transcript
    };
    w.document.write(`<pre style="white-space:pre-wrap;font:14px/1.4 system-ui;">${escapeHtml(JSON.stringify(payload, null, 2))}</pre>`);
    w.document.close();
    w.focus();
    w.print();
  };

  restartBtn.onclick = () => {
    resetDraft();
    setScreen("welcome");
  };

  // ---------- Asana (client-side fallback; dev convenience) ----------
  asanaOpenBtn.onclick = () => {
    asanaTokenEl.value = sessionStorage.getItem("asana_pat") || "";
    asanaProjectEl.value = sessionStorage.getItem("asana_pid") || "";
    asanaTaskNameEl.value = `Brief – ${new Date().toLocaleString()}`;
    asanaMsg.textContent = "";
    asanaModal.classList.add("show");
  };
  asanaCancelBtn.onclick = () => asanaModal.classList.remove("show");

  asanaSendBtn.onclick = async () => {
    const token = asanaTokenEl.value.trim();
    const projectId = asanaProjectEl.value.trim();
    const taskName = asanaTaskNameEl.value.trim() || "Brief";
    if (!token || !projectId) {
      asanaMsg.textContent = "Token and Project ID required.";
      return;
    }
    sessionStorage.setItem("asana_pat", token);
    sessionStorage.setItem("asana_pid", projectId);

    // Create a task with notes containing a compact summary
    const summary = {
      branch: state.branch,
      packagingTypes: state.packagingTypes,
      answers: state.answers,
      // transcript can be long; include tail only
      transcript_tail: state.transcript.slice(-4000)
    };
    try {
      const resp = await fetch(`https://app.asana.com/api/1.0/tasks`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          projects: [projectId],
          name: taskName,
          notes: `LR Paris Brief\n\n${JSON.stringify(summary, null, 2)}\n\n(Full JSON available on request)`,
        })
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      asanaMsg.textContent = `Task created: ${data?.data?.gid || "OK"}`;
    } catch (e) {
      asanaMsg.textContent = `Asana error: ${e.message}`;
    }
  };

  // ---------- Start Flow ----------
  startBtn.onclick = () => {
    resetDraft();
    state.startedAt = new Date().toISOString();
    buildQueue();
    setScreen("questions");
    renderStep();
    initSpeech();
    startListening();
  };

  // Attempt restore (if user reloads mid-brief)
  loadDraft();
  if (state.queue.length && screens.questions) {
    setScreen("questions");
    renderStep();
    initSpeech();
    startListening();
  }

  // ---------- Helpers ----------
  function debounce(fn, wait) {
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
  }
  function escapeHtml(str) {
    return str.replace(/[&<>'"]/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
    }[c]));
  }
})();
