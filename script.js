/* LR Paris Brief Tool (Enterprise UI)
   - Always-on instructions with inline editor (saves to localStorage)
   - Start/Stop recording toggle (robust restart on onend; truly stops when asked)
   - Voice commands: next/continue/next question, back/previous, skip, not applicable/N A, start/stop recording
   - Product vs Packaging → Packaging multi-select → only relevant follow-ups
   - Continue always advances (records "Unanswered" if empty)
   - Autosave; JSON/PDF export; client-side Asana PAT sender
*/

(() => {
  // ---------- DOM ----------
  const screens = {
    welcome: document.getElementById("welcome-screen"),
    questions: document.getElementById("question-screen"),
    complete: document.getElementById("completion-screen"),
  };

  const startBtn = document.getElementById("start-btn");
  const recordPill = document.getElementById("record-pill");
  const toggleMicBtn = document.getElementById("toggle-mic");

  const sectionTitle = document.getElementById("section-title");
  const qText = document.getElementById("question-text");
  const choicesBox = document.getElementById("choices");
  const voiceInput = document.getElementById("voice-input");

  const backBtn = document.getElementById("back-btn");
  const skipBtn = document.getElementById("skip-btn");
  const naBtn = document.getElementById("na-btn");
  const nextBtn = document.getElementById("next-btn");

  const progress = document.getElementById("progress");
  const autosave = document.getElementById("autosave");

  const instDetails = document.getElementById("edit-inst");
  const instTextarea = document.getElementById("inst-textarea");
  const instSave = document.getElementById("inst-save");
  const instReset = document.getElementById("inst-reset");
  const instContent = document.getElementById("instructions-content");

  const asanaOpenBtn = document.getElementById("asana-open");
  const asanaModal = document.getElementById("asana-modal");
  const asanaTokenEl = document.getElementById("asana-token");
  const asanaProjectEl = document.getElementById("asana-project");
  const asanaTaskNameEl = document.getElementById("asana-task-name");
  const asanaCancelBtn = document.getElementById("asana-cancel");
  const asanaSendBtn = document.getElementById("asana-send");
  const asanaMsg = document.getElementById("asana-msg");

  // ---------- STATE ----------
  const STORAGE_KEY = "lrp_brief_draft_v5";
  const INST_KEY = "lrp_brief_instructions_html";
  let state = {
    startedAt: null,
    branch: null,            // ["Product","Packaging"]
    packagingTypes: [],
    answers: [],             // {id, question, section, type, choices[], notes}
    transcript: "",
    queue: [],
    step: 0,
  };

  // ---------- UTIL ----------
  function debounce(fn, wait){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), wait); }; }
  const flash = (el)=>{ el.classList.remove("show"); void el.offsetWidth; el.classList.add("show"); setTimeout(()=>el.classList.remove("show"), 800); };
  const saveDraft = debounce(()=>{ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); flash(autosave);}catch{} }, 300);
  function download(name, data, mime="application/json"){ const b=new Blob([data],{type:mime}); const u=URL.createObjectURL(b); const a=document.createElement("a"); a.href=u; a.download=name; a.click(); URL.revokeObjectURL(u); }
  function setScreen(name){ Object.values(screens).forEach(s=>s.classList.remove("active")); screens[name].classList.add("active"); }
  function setProgress(){ const t=state.queue.length||1; progress.textContent = `Step ${Math.min(state.step+1,t)} of ${t}`; }
  function upsertAnswer(a){ const i=state.answers.findIndex(x=>x.id===a.id); if(i>=0) state.answers[i]=a; else state.answers.push(a); saveDraft(); }
  function selections(){ return [...choicesBox.querySelectorAll(".choice")].filter(b=>b.dataset.selected==="true").map(b=>b.textContent); }
  function escapeHtml(str){ return str.replace(/[&<>'"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

  // ---------- INSTRUCTIONS (inline editor) ----------
  // Load saved instructions HTML if present
  try {
    const savedHtml = localStorage.getItem(INST_KEY);
    if (savedHtml) instContent.innerHTML = savedHtml;
  } catch {}
  // Prefill editor with current HTML
  instTextarea.value = instContent.innerHTML.trim();
  instSave.onclick = () => {
    instContent.innerHTML = instTextarea.value.trim();
    try { localStorage.setItem(INST_KEY, instContent.innerHTML); } catch {}
    instDetails.open = false;
  };
  instReset.onclick = () => {
    try { localStorage.removeItem(INST_KEY); } catch {}
    location.reload();
  };

  // ---------- QUESTION BANK ----------
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

  // ---------- QUEUE ----------
  function buildInitialQueue(){ state.queue = [entryQuestion]; }
  function finalizeQueueAfterEntry(){
    if (Array.isArray(state.branch) && state.branch.includes("Packaging")){
      if (!state.queue.find(q=>q.id==="pkg-types")) state.queue.splice(1,0,packagingTypeQuestion);
    }
  }
  function splicePackagingBanks(){
    const pkgIdx = state.queue.findIndex(q=>q.id==="pkg-types");
    if (pkgIdx>=0){
      // remove previously injected banks
      state.queue = state.queue.filter(q => !q.__bankName || q.__bankName==="Product" || q.id==="pkg-types" || q.id==="entry-branch");
      const inserts=[];
      state.packagingTypes.forEach(name=>{
        (BANK[name]||[]).forEach(item=>inserts.push({...item,__bankName:name}));
      });
      state.queue.splice(pkgIdx+1,0,...inserts);
    }
    if (Array.isArray(state.branch) && state.branch.includes("Product")){
      const already = state.queue.some(q=>q.__bankName==="Product");
      if (!already) BANK.Product.forEach(item=>state.queue.push({...item,__bankName:"Product"}));
    }
  }

  // ---------- RENDER ----------
  function humanSectionFor(q){
    if (q.id==="entry-branch") return "Brief Type";
    if (q.id==="pkg-types") return "Packaging Type(s)";
    if (q.__bankName && q.__bankName!=="Product") return `Packaging → ${q.__bankName}`;
    if (q.__bankName==="Product") return "Product";
    return "Questions";
  }
  function renderStep(){
    setProgress();
    const q = state.queue[state.step];
    if (!q){ setScreen("complete"); return; }
    sectionTitle.textContent = humanSectionFor(q);
    qText.textContent = q.text;
    voiceInput.value = "";
    choicesBox.innerHTML = "";
    if (q.type==="single" || q.type==="multi"){
      (q.options||[]).forEach(opt=>{
        const btn = document.createElement("button");
        btn.className = "choice";
        btn.textContent = opt;
        btn.dataset.selected = "false";
        btn.onclick = ()=>{
          if (q.type === "single"){
            [...choicesBox.children].forEach(c=>c.dataset.selected="false");
            btn.dataset.selected="true";
          } else {
            btn.dataset.selected = (btn.dataset.selected==="true") ? "false" : "true";
          }
        };
        choicesBox.appendChild(btn);
      });
    } else {
      // text question uses voice/typing only
      const hint = document.createElement("div");
      hint.style.cssText = "color:#a8b0c6;font-size:12px";
      hint.textContent = "Answer by voice or type below.";
      choicesBox.appendChild(hint);
    }
  }

  // ---------- NAVIGATION ----------
  function advanceWith(override){
    const q = state.queue[state.step];
    const choiceVals = (q.type==="text") ? [] : selections();
    const notes = (override && override.notes !== undefined) ? override.notes : voiceInput.value.trim();
    const finalChoices = override && override.choiceLabel ? [override.choiceLabel] : choiceVals;
    const finalNotes = (!finalChoices.length && !notes) ? "Unanswered" : notes;

    upsertAnswer({ id:q.id, question:q.text, section:humanSectionFor(q), type:q.type, choices:finalChoices, notes:finalNotes });

    if (q.id==="entry-branch"){ state.branch = Array.from(new Set([...(choiceVals||[])])); finalizeQueueAfterEntry(); }
    if (q.id==="pkg-types"){ state.packagingTypes = choiceVals; splicePackagingBanks(); }

    state.step++;
    if (state.step >= state.queue.length) setScreen("complete"); else renderStep();
  }

  nextBtn.onclick = () => advanceWith();
  skipBtn.onclick = () => advanceWith({ choiceLabel:"Skip", notes:"" });
  naBtn.onclick   = () => advanceWith({ choiceLabel:"Not applicable", notes:"" });
  backBtn.onclick = () => { if (state.step>0){ state.step--; renderStep(); } };

  // ---------- SPEECH ----------
  let recognition=null, isListening=false, allowAutoRestart=true;

  function initSpeech(){
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR){
      micOffUI("Voice not available in this browser");
      return;
    }
    recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (evt)=>{
      let finalText="", interim="";
      for (let i=evt.resultIndex;i<evt.results.length;i++){
        const t = evt.results[i][0].transcript;
        if (evt.results[i].isFinal) finalText += t + " ";
        else interim += t;
      }
      if (finalText) handleSpeech(finalText.trim());
      else if (interim) voiceInput.placeholder = interim;
    };
    recognition.onerror = ()=>{ /* keep UI usable */ };
    recognition.onend = ()=>{
      if (isListening && allowAutoRestart){
        try { recognition.start(); } catch {}
      }
    };
  }

  function handleSpeech(text){
    state.transcript += (text + " ");
    const t = text.toLowerCase();
    if (/\b(stop recording)\b/.test(t)){ stopListening(true); return; }
    if (/\b(start recording)\b/.test(t)){ startListening(); return; }
    if (/\b(next|continue|next question)\b/.test(t)){ advanceWith(); return; }
    if (/\b(back|previous|go back)\b/.test(t)){ if (state.step>0){ state.step--; renderStep(); } return; }
    if (/\b(skip)\b/.test(t)){ advanceWith({ choiceLabel:"Skip", notes:"" }); return; }
    if (/\b(not applicable|n a|n\.a\.)\b/.test(t)){ advanceWith({ choiceLabel:"Not applicable", notes:"" }); return; }

    const q = state.queue[state.step];
    if (q){ voiceInput.value = (voiceInput.value ? voiceInput.value + " " : "") + text; }
    saveDraft();
  }

  function startListening(){
    if (!recognition) return;
    allowAutoRestart = true;
    try { recognition.start(); isListening = true; micOnUI(); } catch {}
  }
  function stopListening(userRequested=false){
    if (!recognition) return;
    allowAutoRestart = !userRequested; // if user asked to stop, do not auto-restart
    try { recognition.stop(); isListening = !userRequested; } catch {}
    if (userRequested){ micOffUI(); } // reflect explicit stop
  }

  function micOnUI(){
    recordPill.classList.remove("off");
    recordPill.textContent = "● Recording";
    toggleMicBtn.classList.remove("danger");
    toggleMicBtn.textContent = "Stop Recording";
    toggleMicBtn.setAttribute("aria-pressed","true");
  }
  function micOffUI(msg){
    recordPill.classList.add("off");
    recordPill.textContent = "◦ Mic Off";
    toggleMicBtn.classList.add("danger");
    toggleMicBtn.textContent = "Start Recording";
    toggleMicBtn.setAttribute("aria-pressed","false");
    if (msg){
      const banner = document.createElement("div");
      banner.style.cssText="margin-top:8px;background:#1b2244;border:1px solid #2a3b6d;color:#cfe1ff;padding:8px 10px;border-radius:8px;font-size:12px";
      banner.textContent = msg;
      document.querySelector(".masthead").appendChild(banner);
    }
  }
  toggleMicBtn.onclick = () => {
    if (toggleMicBtn.getAttribute("aria-pressed")==="true"){ stopListening(true); }
    else { startListening(); }
  };

  // ---------- EXPORT ----------
  document.getElementById("export-json").onclick = () => {
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
  document.getElementById("export-pdf").onclick = () => {
    const payload = { branch: state.branch, packagingTypes: state.packagingTypes, answers: state.answers, transcript: state.transcript };
    const w = window.open("", "_blank");
    w.document.write(`<pre style="white-space:pre-wrap;font:14px/1.4 system-ui;">${escapeHtml(JSON.stringify(payload, null, 2))}</pre>`);
    w.document.close(); w.focus(); w.print();
  };
  document.getElementById("restart").onclick = () => { try{ localStorage.removeItem(STORAGE_KEY);}catch{}; state = { ...state, startedAt:null, branch:null, packagingTypes:[], answers:[], transcript:"", queue:[], step:0 }; setScreen("welcome"); };

  // ---------- ASANA (client-side PAT quick send) ----------
  asanaOpenBtn.onclick = () => {
    asanaTokenEl.value   = sessionStorage.getItem("asana_pat") || "";
    asanaProjectEl.value = sessionStorage.getItem("asana_pid") || "";
    asanaTaskNameEl.value= `Brief – ${new Date().toLocaleString()}`;
    asanaMsg.textContent = "";
    asanaModal.classList.add("show");
  };
  asanaCancelBtn.onclick = () => asanaModal.classList.remove("show");
  asanaSendBtn.onclick = async () => {
    const token = asanaTokenEl.value.trim();
    const projectId = asanaProjectEl.value.trim();
    const taskName = asanaTaskNameEl.value.trim() || "Brief";
    if (!token || !projectId){ asanaMsg.textContent="Token and Project ID required."; return; }
    sessionStorage.setItem("asana_pat", token);
    sessionStorage.setItem("asana_pid", projectId);
    const summary = { branch: state.branch, packagingTypes: state.packagingTypes, answers: state.answers, transcript_tail: state.transcript.slice(-4000) };
    try{
      const resp = await fetch("https://app.asana.com/api/1.0/tasks", {
        method:"POST",
        headers:{ "Authorization":`Bearer ${token}`, "Content-Type":"application/json" },
        body: JSON.stringify({ projects:[projectId], name:taskName, notes:`LR Paris Brief\n\n${JSON.stringify(summary, null, 2)}` })
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      asanaMsg.textContent = `Task created: ${data?.data?.gid || "OK"}`;
    }catch(e){ asanaMsg.textContent = `Asana error: ${e.message}`; }
  };

  // ---------- FLOW ----------
  function buildInitialQueue(){ state.queue = [entryQuestion]; }
  function humanSectionFor(q){
    if (q.id==="entry-branch") return "Brief Type";
    if (q.id==="pkg-types") return "Packaging Type(s)";
    if (q.__bankName && q.__bankName!=="Product") return `Packaging → ${q.__bankName}`;
    if (q.__bankName==="Product") return "Product";
    return "Questions";
  }

  function renderStep(){
    const q = state.queue[state.step];
    if (!q){ setScreen("complete"); return; }
    sectionTitle.textContent = humanSectionFor(q);
    qText.textContent = q.text;
    progress.textContent = `Step ${Math.min(state.step+1, state.queue.length)} of ${state.queue.length}`;
    autosave.classList.remove("show");

    voiceInput.value = "";
    choicesBox.innerHTML = "";

    if (q.type==="single" || q.type==="multi"){
      (q.options||[]).forEach(opt=>{
        const btn=document.createElement("button");
        btn.className="choice"; btn.textContent=opt; btn.dataset.selected="false";
        btn.onclick=()=>{
          if (q.type==="single"){ [...choicesBox.children].forEach(c=>c.dataset.selected="false"); btn.dataset.selected="true"; }
          else { btn.dataset.selected = (btn.dataset.selected==="true") ? "false" : "true"; }
        };
        choicesBox.appendChild(btn);
      });
    } else {
      const hint=document.createElement("div"); hint.style.cssText="color:#a8b0c6;font-size:12px"; hint.textContent="Answer by voice or type below.";
      choicesBox.appendChild(hint);
    }
  }

  function advanceWith(override){
    const q = state.queue[state.step];
    const choiceVals = (q.type==="text") ? [] : selections();
    const notes = (override && override.notes !== undefined) ? override.notes : voiceInput.value.trim();
    const finalChoices = override && override.choiceLabel ? [override.choiceLabel] : choiceVals;
    const finalNotes = (!finalChoices.length && !notes) ? "Unanswered" : notes;
    upsertAnswer({ id:q.id, question:q.text, section:humanSectionFor(q), type:q.type, choices:finalChoices, notes:finalNotes });

    if (q.id==="entry-branch"){ state.branch = Array.from(new Set([...(choiceVals||[])])); if (state.branch.includes("Packaging") && !state.queue.find(qq=>qq.id==="pkg-types")) state.queue.splice(1,0,packagingTypeQuestion); }
    if (q.id==="pkg-types"){ state.packagingTypes = choiceVals; // inject banks
      // remove any previous banks
      state.queue = state.queue.filter(x => !x.__bankName || x.__bankName==="Product" || x.id==="pkg-types" || x.id==="entry-branch");
      const inserts=[]; state.packagingTypes.forEach(n => (BANK[n]||[]).forEach(it=>inserts.push({...it,__bankName:n})));
      const idx = state.queue.findIndex(x=>x.id==="pkg-types"); state.queue.splice(idx+1,0,...inserts);
      if (state.branch.includes("Product") && !state.queue.some(x=>x.__bankName==="Product")) BANK.Product.forEach(it=>state.queue.push({...it,__bankName:"Product"}));
    }

    state.step++;
    if (state.step >= state.queue.length) setScreen("complete"); else renderStep();
  }

  nextBtn.onclick = () => advanceWith();
  skipBtn.onclick = () => advanceWith({ choiceLabel:"Skip", notes:"" });
  naBtn.onclick   = () => advanceWith({ choiceLabel:"Not applicable", notes:"" });
  backBtn.onclick = () => { if (state.step>0){ state.step--; renderStep(); } };

  // ---------- START ----------
  startBtn.onclick = () => {
    state = { startedAt:new Date().toISOString(), branch:null, packagingTypes:[], answers:[], transcript:"", queue:[], step:0 };
    buildInitialQueue();
    setScreen("questions");
    renderStep();
    initSpeech();
    startListening(); // auto start
  };

})();
