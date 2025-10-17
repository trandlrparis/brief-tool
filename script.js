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
  const asanaModal = document.getElementById("asana-modal");
  const asanaTokenEl = document.getElementById("asana-token");
  const asanaProjectEl = document.getElementById("asana-project");
  const asanaTaskNameEl = document.getElementById("asana-task-name");
  const asanaCancelBtn = document.getElementById("asana-cancel");
  const asanaSendBtn = document.getElementById("asana-send");
  const asanaMsg = document.getElementById("asana-msg");

  // Add a tiny banner if speech is unavailable
  const topbar = document.querySelector(".topbar");
  function banner(msg) {
    const el = document.createElement("div");
    el.style.cssText = "background:#fff3cd;border:1px solid #ffeeba;color:#856404;padding:8px 10px;border-radius:8px;margin:8px 0;font-size:12px;";
    el.textContent = msg;
    (topbar || screens.questions).prepend(el);
  }

  // ---------- App State ----------
  const STORAGE_KEY = "lrp_brief_draft_v1";
  let state = {
    startedAt: null,
    branch: null,            // ["Product","Packaging"] or single
    packagingTypes: [],
    answers: [],             // {id, question, type, choices[], notes}
    transcript: "",
    queue: [],
    step: 0,
  };

  // ---------- Utilities ----------
  function debounce(fn, wait){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), wait); }; }
  function flash(el){ el?.classList?.remove("show"); void el?.offsetWidth; el?.classList?.add("show"); setTimeout(()=>el?.classList?.remove("show"), 800); }
  function download(filename, data, mime="application/json"){
    const blob=new Blob([data],{type:mime}); const url=URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url);
  }
  function setScreen(name){ Object.values(screens).forEach(s=>s.classList.remove("active")); screens[name].classList.add("active"); }
  function setProgress(){ const total=state.queue.length||1; progress.textContent=`Step ${Math.min(state.step+1,total)} of ${total}`; }
  function pushAnswer({id,question,type,choices,notes}){
    const idx=state.answers.findIndex(a=>a.id===id);
    const payload={id,question,type,choices,notes};
    if(idx>=0) state.answers[idx]=payload; else state.answers.push(payload);
    saveDraft();
  }
  const saveDraft = debounce(()=>{
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); flash(autosaveBadge);}catch{}
  }, 400);

  function resetDraft(){
    state = { startedAt:null, branch:null, packagingTypes:[], answers:[], transcript:"", queue:[], step:0 };
    try{ localStorage.removeItem(STORAGE_KEY);}catch{}
  }

  function safeLoadDraft(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return false;
      const draft = JSON.parse(raw);
      // Basic validation
      if(!draft || typeof draft!=="object") throw new Error("bad");
      if(!Array.isArray(draft.queue) || draft.queue.length>500) throw new Error("bad");
      state = { ...state, ...draft };
      return true;
    }catch{
      // Corrupted or incompatible – clear it
      try{ localStorage.removeItem(STORAGE_KEY);}catch{}
      return false;
    }
  }

  // ---------- Question Bank ----------
  const entryQuestion = { id:"entry-branch", text:"What kind of brief are you creating?", type:"multi", options:["Product","Packaging"] };
  const packagingTypeQuestion = {
    id:"pkg-types", text:"Which type(s) of packaging are you requesting?",
    type:"multi",
    options:["Shopping Bag","Rigid Box","Foldable Box","Sleeve","Tube","Pouch","Tag / Label","Card / Insert","Sticker / Seal","Other"]
  };

  const BANK = {
    Product: [
      { id:"prod-desc",   text:"Product description",                     type:"text" },
      { id:"prod-specs",  text:"Key product specifications",              type:"text" },
      { id:"prod-qty",    text:"Quantity (units)",                        type:"text" },
      { id:"prod-target", text:"Target price (per unit or total)",        type:"text" },
      { id:"prod-date",   text:"Delivery date",                           type:"text" },
      { id:"prod-loc",    text:"Delivery location",                       type:"text" },
      { id:"prod-eco",    text:"Eco-friendly requirements?",              type:"single", options:["Yes","No","N/A"] },
    ],
    "Shopping Bag": [
      { id:"bag-material", text:"Bag material", type:"single", options:["Paper","Fabric","Recycled","Other","Skip"] },
      { id:"bag-handle",   text:"Handle type",  type:"single", options:["Ribbon","Rope","Die-cut","None","Skip"] },
      { id:"bag-print",    text:"Printing",     type:"multi",  options:["1-color","Full-color","Emboss","Deboss","Foil","None","Skip"] },
      { id:"bag-finish",   text:"Finish",       type:"single", options:["Matte","Gloss","Laminated","None","Skip"] },
      { id:"bag-reinf",    text:"Reinforcement",type:"single", options:["Bottom","Top","Both","None","Skip"] },
      { id:"bag-size",     text:"Approx size (L×W×H or WxHxD)", type:"text" },
      { id:"bag-qty",      text:"Quantity",     type:"text" },
      { id:"bag-target",   text:"Target price", type:"text" },
      { id:"bag-ship",     text:"Delivery date & location", type:"text" },
    ],
    "Rigid Box": [
      { id:"rbox-style",  text:"Box style",   type:"single", options:["2-piece","Magnetic","Drawer","Slipcase","Skip"] },
      { id:"rbox-insert", text:"Insert",      type:"single", options:["Foam","Paper","Pulp","None","Skip"] },
      { id:"rbox-print",  text:"Printing",    type:"multi",  options:["1-color","Full-color","Foil","Emboss","Deboss","Combo","Skip"] },
      { id:"rbox-finish", text:"Finish",      type:"single", options:["Matte","Gloss","Laminated","Texture","Skip"] },
      { id:"rbox-addons", text:"Add-ons",     type:"multi",  options:["Ribbon closure","Magnet","Handle","None","Skip"] },
      { id:"rbox-size",   text:"Approx size (L×W×H)", type:"text" },
      { id:"rbox-qty",    text:"Quantity",    type:"text" },
      { id:"rbox-target", text:"Target price",type:"text" },
      { id:"rbox-ship",   text:"Delivery date & location", type:"text" },
    ],
    "Foldable Box": [
      { id:"fbox-style",  text:"Foldable box style", type:"single", options:["Mailer","Crash lock","Auto-lock","Other","Skip"] },
      { id:"fbox-print",  text:"Printing",           type:"multi",  options:["1-color","Full-color","Inside print","Foil","None","Skip"] },
      { id:"fbox-finish", text:"Finish",             type:"single", options:["Matte","Gloss","Laminated","None","Skip"] },
      { id:"fbox-size",   text:"Approx size",        type:"text" },
      { id:"fbox-qty",    text:"Quantity",           type:"text" },
      { id:"fbox-target", text:"Target price",       type:"text" },
      { id:"fbox-ship",   text:"Delivery date & location", type:"text" },
    ],
    "Sleeve": [
      { id:"slv-mat",   text:"Sleeve material", type:"single", options:["Paperboard","Cardstock","Other","Skip"] },
      { id:"slv-print", text:"Printing",        type:"multi",  options:["1-color","Full-color","Foil","Emboss","None","Skip"] },
      { id:"slv-dims",  text:"Approx size / fit", type:"text" },
      { id:"slv-qty",   text:"Quantity",          type:"text" },
      { id:"slv-target",text:"Target price",      type:"text" },
      { id:"slv-ship",  text:"Delivery date & location", type:"text" },
    ],
    "Tube": [
      { id:"tube-type",  text:"Tube type",  type:"single", options:["Paper","Composite","Metal ends","Other","Skip"] },
      { id:"tube-print", text:"Printing",   type:"multi",  options:["1-color","Full-color","Foil","Emboss","None","Skip"] },
      { id:"tube-size",  text:"Approx size",type:"text" },
      { id:"tube-qty",   text:"Quantity",   type:"text" },
      { id:"tube-target",text:"Target price",type:"text" },
      { id:"tube-ship",  text:"Delivery date & location", type:"text" },
    ],
    "Pouch": [
      { id:"pch-mat",   text:"Pouch material", type:"single", options:["Fabric","Recycled cotton","Nylon","Velvet","Other","Skip"] },
      { id:"pch-close", text:"Closure",        type:"single", options:["Drawstring","Zipper","Fold-over","None","Skip"] },
      { id:"pch-print", text:"Branding",       type:"multi",  options:["Silkscreen","Embroidery","Label","None","Skip"] },
      { id:"pch-size",  text:"Approx size",    type:"text" },
      { id:"pch-qty",   text:"Quantity",       type:"text" },
      { id:"pch-target",text:"Target price",   type:"text" },
      { id:"pch-ship",  text:"Delivery date & location", type:"text" },
    ],
    "Tag / Label": [
      { id:"tag-type",  text:"Type",     type:"single", options:["Hangtag","Woven label","Sticker label","Other","Skip"] },
      { id:"tag-print", text:"Branding", type:"multi",  options:["1-color","Full-color","Foil","Emboss","None","Skip"] },
      { id:"tag-size",  text:"Approx size", type:"text" },
      { id:"tag-qty",   text:"Quantity",    type:"text" },
      { id:"tag-target",text:"Target price",type:"text" },
      { id:"tag-ship",  text:"Delivery date & location", type:"text" },
    ],
    "Card / Insert": [
      { id:"card-stock", text:"Card stock", type:"single", options:["Uncoated","Coated","Textured","Other","Skip"] },
      { id:"card-print", text:"Printing",   type:"multi",  options:["1-color","Full-color","Foil","Emboss","None","Skip"] },
      { id:"card-size",  text:"Size",       type:"text" },
      { id:"card-qty",   text:"Quantity",   type:"text" },
      { id:"card-target",text:"Target price",type:"text" },
      { id:"card-ship",  text:"Delivery date & location", type:"text" },
    ],
    "Sticker / Seal": [
      { id:"stk-type",  text:"Type",   type:"single", options:["Paper","Vinyl","Foil","Embossed","Other","Skip"] },
      { id:"stk-shape", text:"Shape",  type:"single", options:["Round","Square","Custom","Skip"] },
      { id:"stk-print", text:"Printing",type:"multi",  options:["1-color","Full-color","Foil","Emboss","None","Skip"] },
      { id:"stk-size",  text:"Size",   type:"text" },
      { id:"stk-qty",   text:"Quantity", type:"text" },
      { id:"stk-target",text:"Target price", type:"text" },
      { id:"stk-ship",  text:"Delivery date & location", type:"text" },
    ],
    "Other": [
      { id:"oth-desc", text:"Describe the packaging item(s)", type:"text" },
      { id:"oth-qty",  text:"Quantity", type:"text" },
      { id:"oth-target",text:"Target price", type:"text" },
      { id:"oth-ship", text:"Delivery date & location", type:"text" },
    ],
  };

  // ---------- Queue Builders ----------
  function buildQueue(){
    const q = [];
    q.push(entryQuestion);
    // If Packaging will be chosen later, we insert types + banks dynamically
    state.queue = q;
  }

  function finalizeQueue(){
    // Insert pkg-types and selected banks in place
    let q = [...state.queue];
    // Ensure entry exists at index 0
    if (!q.find(x=>x.id==="entry-branch")) q.unshift(entryQuestion);

    // If Packaging chosen, add types question right after entry
    const entryIdx = q.findIndex(x=>x.id==="entry-branch");
    if (Array.isArray(state.branch) && state.branch.includes("Packaging")) {
      if (!q.find(x=>x.id==="pkg-types")) q.splice(entryIdx+1,0,packagingTypeQuestion);
      // Insert selected banks after pkg-types
      const pkgIdx = q.findIndex(x=>x.id==="pkg-types");
      if (pkgIdx>=0 && state.packagingTypes?.length) {
        // Remove any old banks first
        q = q.filter(x => !BANK[x?.__bankName]);
        const inserts = [];
        state.packagingTypes.forEach(name=>{
          (BANK[name]||[]).forEach(item=>{ inserts.push({...item, __bankName:name}); });
        });
        q.splice(pkgIdx+1,0,...inserts);
      }
    }

    // If Product chosen, append its bank last
    if (Array.isArray(state.branch) && state.branch.includes("Product")) {
      BANK.Product.forEach(item=> q.push({...item, __bankName:"Product"}));
    }
    state.queue = q;
  }

  // ---------- Rendering ----------
  function renderStep(){
    setProgress();
    const q = state.queue[state.step];
    if(!q){ setScreen("complete"); return; }

    qText.textContent = q.text;
    voiceInput.value = "";
    nextBtn.disabled = true;
    choicesBox.innerHTML = "";

    if (q.type === "single" || q.type === "multi"){
      (q.options||[]).forEach(opt=>{
        const btn = document.createElement("button");
        btn.className = "choice";
        btn.textContent = opt;
        btn.dataset.selected = "false";
        btn.onclick = () => {
          if (q.type === "single"){
            [...choicesBox.children].forEach(c=>c.dataset.selected="false");
            btn.dataset.selected = "true";
          } else {
            btn.dataset.selected = (btn.dataset.selected==="true") ? "false" : "true";
          }
          nextBtn.disabled = !(getSelections().length || voiceInput.value.trim());
        };
        choicesBox.appendChild(btn);
      });
    } else {
      choicesBox.innerHTML = `<div class="hint">Answer by voice or type below.</div>`;
    }
  }

  function getSelections(){
    return [...choicesBox.querySelectorAll(".choice")]
      .filter(b=>b.dataset.selected==="true")
      .map(b=>b.textContent);
  }

  // ---------- Navigation ----------
  nextBtn.onclick = () => {
    const q = state.queue[state.step];
    const choices = (q.type==="text") ? [] : getSelections();
    const notes = voiceInput.value.trim();
    // allow progressing if either a choice OR some text was captured
    if (!choices.length && !notes) return;

    pushAnswer({ id:q.id, question:q.text, type:q.type, choices, notes });

    if (q.id === "entry-branch"){
      state.branch = Array.from(new Set([...(choices||[])]));
      finalizeQueue();
    }
    if (q.id === "pkg-types"){
      state.packagingTypes = choices;
      finalizeQueue();
    }

    state.step++;
    if (state.step >= state.queue.length) setScreen("complete");
    else renderStep();
  };

  backBtn.onclick = () => { if (state.step>0){ state.step--; renderStep(); } };
  skipBtn.onclick = () => {
    const q = state.queue[state.step];
    pushAnswer({ id:q.id, question:q.text, type:q.type, choices:["Skip"], notes:"" });
    state.step++;
    if (state.step >= state.queue.length) setScreen("complete"); else renderStep();
  };

  voiceInput.addEventListener("input", ()=>{
    const q = state.queue[state.step];
    if (!q) return;
    nextBtn.disabled = !( (q.type==="text" && voiceInput.value.trim()) || getSelections().length );
  });

  // ---------- Speech Recognition ----------
  let recognition=null, isListening=false;
  function initSpeech(){
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!SR){
      banner("Live speech recognition is not available in this browser. Click choices or type answers. Use Chrome for voice.");
      return;
    }
    recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (evt)=>{
      let finalText = "", interim = "";
      for (let i=evt.resultIndex;i<evt.results.length;i++){
        const tr = evt.results[i][0].transcript;
        if (evt.results[i].isFinal) finalText += tr + " ";
        else interim += tr;
      }
      if (finalText){
        state.transcript += finalText;
        // append to field (non-destructive)
        voiceInput.value = (voiceInput.value ? voiceInput.value + " " : "") + finalText.trim();
        const q = state.queue[state.step];
        if (q) nextBtn.disabled = !( (q.type==="text" && voiceInput.value.trim()) || getSelections().length );
        saveDraft();
      } else if (interim){
        voiceInput.placeholder = interim;
      }
    };
    recognition.onerror = (e)=>{
      // Most common: "not-allowed" (permission denied) or "network"
      banner(`Speech recognition error: ${e.error}. You can keep clicking/typing.`);
    };
    recognition.onend = ()=>{
      if (isListening){
        try{ recognition.start(); }catch{}
      }
    };
  }
  function startListening(){
    if(!recognition) return;
    isListening = true;
    try{ recognition.start(); }catch{}
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
  exportPDFBtn.onclick = () => {
    const payload = {
      branch: state.branch,
      packagingTypes: state.packagingTypes,
      answers: state.answers,
      transcript: state.transcript
    };
    const w = window.open("", "_blank");
    w.document.write(`<pre style="white-space:pre-wrap;font:14px/1.4 system-ui;">${JSON.stringify(payload, null, 2)
      .replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}</pre>`);
    w.document.close(); w.focus(); w.print();
  };
  restartBtn.onclick = () => { resetDraft(); setScreen("welcome"); };

  // ---------- Asana client-side quick send ----------
  asanaOpenBtn.onclick = () => {
    document.getElementById("asana-modal").classList.add("show");
    asanaTokenEl.value   = sessionStorage.getItem("asana_pat") || "";
    asanaProjectEl.value = sessionStorage.getItem("asana_pid") || "";
    asanaTaskNameEl.value= `Brief – ${new Date().toLocaleString()}`;
    asanaMsg.textContent = "";
  };
  document.getElementById("asana-cancel").onclick = () => document.getElementById("asana-modal").classList.remove("show");
  asanaSendBtn.onclick = async () => {
    const token = asanaTokenEl.value.trim();
    const projectId = asanaProjectEl.value.trim();
    const taskName = asanaTaskNameEl.value.trim() || "Brief";
    if(!token || !projectId){ asanaMsg.textContent="Token and Project ID required."; return; }
    sessionStorage.setItem("asana_pat", token);
    sessionStorage.setItem("asana_pid", projectId);
    const summary = {
      branch: state.branch,
      packagingTypes: state.packagingTypes,
      answers: state.answers,
      transcript_tail: state.transcript.slice(-4000)
    };
    try{
      const resp = await fetch("https://app.asana.com/api/1.0/tasks", {
        method:"POST",
        headers:{ "Authorization":`Bearer ${token}`, "Content-Type":"application/json" },
        body: JSON.stringify({ projects:[projectId], name:taskName, notes:`LR Paris Brief\n\n${JSON.stringify(summary, null, 2)}` })
      });
      if(!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      asanaMsg.textContent = `Task created: ${data?.data?.gid || "OK"}`;
    }catch(e){ asanaMsg.textContent = `Asana error: ${e.message}`; }
  };

  // ---------- Start ----------
  startBtn.onclick = () => {
    // If an old/corrupt draft exists, wipe it on explicit Start
    resetDraft();
    state.startedAt = new Date().toISOString();
    buildQueue();
    finalizeQueue(); // ensure entry is present
    setScreen("questions");
    renderStep();
    initSpeech();
    startListening();
  };

  // Try to restore only if valid and not obviously stale
  const restored = safeLoadDraft();
  if (restored && state.queue?.length){
    // If restored draft lacks entry question, rebuild queue
    if (!state.queue.find(q=>q.id==="entry-branch")){ buildQueue(); finalizeQueue(); }
    setScreen("questions");
    renderStep();
    initSpeech();
    startListening();
  } else {
    setScreen("welcome");
  }
})();
