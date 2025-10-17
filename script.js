const { useState, useEffect, useRef } = React;

/* ---- Question sets ---- */
const PRODUCT_BANK = [
  { id:"prod-desc", text:"Product description", type:"text" },
  { id:"prod-specs", text:"Key product specifications", type:"text" },
  { id:"prod-qty", text:"Quantity (units)", type:"text" },
  { id:"prod-target", text:"Target price (per unit or total)", type:"text" },
  { id:"prod-date", text:"Delivery date", type:"text" },
  { id:"prod-loc", text:"Delivery location", type:"text" },
  { id:"prod-eco", text:"Eco-friendly requirements?", type:"single", options:["Yes","No","N/A"] }
];

const PACKAGING_TYPES = [
  "Shopping Bag","Rigid Box","Foldable Box","Sleeve","Tube","Pouch","Tag / Label","Card / Insert","Sticker / Seal","Other"
];

const P_BANK = {
  "Shopping Bag": [
    { id:"bag-material", text:"Bag material", type:"single", options:["Paper","Fabric","Recycled","Other","Skip"] },
    { id:"bag-handle", text:"Handle type", type:"single", options:["Ribbon","Rope","Die-cut","None","Skip"] },
    { id:"bag-print", text:"Printing", type:"multi", options:["1-color","Full-color","Foil","Emboss","None","Skip"] },
    { id:"bag-size", text:"Approx size (L×W×H)", type:"text" },
    { id:"bag-qty", text:"Quantity", type:"text" },
    { id:"bag-target", text:"Target price", type:"text" }
  ],
  "Rigid Box": [
    { id:"rbox-style", text:"Box style", type:"single", options:["2-piece","Magnetic","Drawer","Slipcase","Skip"] },
    { id:"rbox-print", text:"Printing", type:"multi", options:["1-color","Full-color","Foil","Emboss","None","Skip"] },
    { id:"rbox-size", text:"Approx size (L×W×H)", type:"text" },
    { id:"rbox-qty", text:"Quantity", type:"text" },
    { id:"rbox-target", text:"Target price", type:"text" }
  ]
};

/* ---- Components ---- */
const Chip = ({selected, children, onClick}) => (
  <button onClick={onClick}
    className={`chip px-3 py-1.5 rounded-full border ${
      selected ? "bg-indigo-600 text-white border-indigo-600 shadow" :
      "bg-white/70 backdrop-blur border-slate-200 hover:border-indigo-300"
    }`}>
    {children}
  </button>
);

const Pill = ({live}) => (
  <div className={`pill ${live ? "live" : ""}`}>
    {live ? "● Recording" : "◦ Mic Off"}
  </div>
);

/* ---- Main App ---- */
function App(){
  const [started, setStarted] = useState(false);
  const [branch, setBranch] = useState([]);
  const [pkgTypes, setPkgTypes] = useState([]);
  const [queue, setQueue] = useState([]);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [complete, setComplete] = useState(false);

  const [speechSupported, setSpeechSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);
  const restartOK = useRef(true);

  /* --- Speech setup --- */
  useEffect(()=>{
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!SR){ setSpeechSupported(false); return; }
    const r = new SR();
    r.continuous = true; r.interimResults = true; r.lang = "en-US";
    recRef.current = r;
    r.onresult = e=>{
      let final = "";
      for(let i=e.resultIndex;i<e.results.length;i++){
        if(e.results[i].isFinal) final += e.results[i][0].transcript + " ";
      }
      if(final) handleSpeech(final.toLowerCase().trim());
    };
    r.onend = ()=>{ if(listening && restartOK.current) try{r.start();}catch{} };
    setSpeechSupported(true);
  },[]);

  const startMic = ()=>{ if(recRef.current) {restartOK.current=true; recRef.current.start(); setListening(true);} };
  const stopMic = (userStop=false)=>{ if(recRef.current){ restartOK.current=!userStop; recRef.current.stop(); if(userStop) setListening(false);} };

  const handleSpeech = (t)=>{
    if(/\b(next|continue|next question)\b/.test(t)) return nextQ();
    if(/\b(back|previous)\b/.test(t)) return setStep(s=>Math.max(s-1,0));
    if(/\b(skip)\b/.test(t)) return skipQ();
    if(/\b(not applicable|n a|n\/a)\b/.test(t)) return naQ();
    if(/\b(stop recording)\b/.test(t)) return stopMic(true);
    if(/\b(start recording)\b/.test(t)) return startMic();

    const q = queue[step];
    if(!q) return;
    setAnswers(a=>({...a,[q.id]:{...(a[q.id]||{}),notes:(a[q.id]?.notes||"")+" "+t}}));
  };

  /* --- Queue build --- */
  useEffect(()=>{
    if(!started) return;
    const q=[];
    q.push({id:"branch",text:"What kind of brief are you creating?",type:"multi",options:["Product","Packaging"]});
    if(branch.includes("Packaging")){
      q.push({id:"pkg",text:"Which type(s) of packaging?",type:"multi",options:PACKAGING_TYPES});
      pkgTypes.forEach(p=>q.push(...(P_BANK[p]||[])));
    }
    if(branch.includes("Product")) q.push(...PRODUCT_BANK);
    setQueue(q);
  },[branch,pkgTypes,started]);

  /* --- Navigation --- */
  const current = queue[step];
  const a = current ? answers[current.id] || {} : {};

  const nextQ = ()=>{
    if(!current) return setComplete(true);
    if(current.id==="branch") setBranch(a.choices||[]);
    if(current.id==="pkg") setPkgTypes(a.choices||[]);
    if(step+1>=queue.length) setComplete(true); else setStep(step+1);
  };
  const skipQ = ()=>{ setStep(s=>Math.min(s+1,queue.length)); };
  const naQ = ()=>{ setAnswers(p=>({...p,[current.id]:{choices:["Not Applicable"],notes:""}})); nextQ(); };

  const toggle = (opt,kind)=>{
    setAnswers(p=>{
      const sel = new Set(p[current.id]?.choices||[]);
      if(kind==="single"){ return {...p,[current.id]:{choices:[opt],notes:""}}; }
      sel.has(opt)?sel.delete(opt):sel.add(opt);
      return {...p,[current.id]:{choices:[...sel],notes:p[current.id]?.notes||""}};
    });
  };

  const exportJSON = ()=>{
    const blob=new Blob([JSON.stringify({branch,pkgTypes,answers},null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob); const a=document.createElement("a");
    a.href=url; a.download="brief.json"; a.click(); URL.revokeObjectURL(url);
  };

  /* --- UI --- */
  if(!started){
    return (
      <div className="p-10">
        <div className="hero-gradient p-10 shadow-xl">
          <h1 className="text-3xl font-semibold">Start a New Brief</h1>
          <p className="mt-2 text-white/90">Voice-ready packaging & product briefs. Autosaves, exports, and works in Safari.</p>
          <button onClick={()=>setStarted(true)} className="mt-5 px-5 py-2.5 bg-white text-indigo-700 font-semibold rounded-md shadow hover:shadow-lg">Start</button>
        </div>
      </div>
    );
  }

  if(complete){
    return (
      <div className="max-w-3xl mx-auto p-6 card mt-6 text-center">
        <h2 className="text-xl font-semibold text-indigo-700">Brief Complete</h2>
        <p className="text-slate-600 mt-1">Export or restart to begin another.</p>
        <div className="mt-4 flex justify-center gap-2">
          <button onClick={exportJSON} className="px-3 py-1.5 rounded-md bg-indigo-600 text-white">Export JSON</button>
          <button onClick={()=>{localStorage.clear(); location.reload();}} className="px-3 py-1.5 rounded-md border">Start Over</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      {/* instructions & mic */}
      <div className="card p-4 mb-4">
        <div className="flex items-center gap-3">
          <Pill live={listening && speechSupported}/>
          <button
            onClick={()=>listening?stopMic(true):startMic()}
            disabled={!speechSupported}
            className="px-3 py-1.5 rounded-md border font-semibold text-slate-700 hover:border-indigo-300">
            {speechSupported?(listening?"Stop Recording":"Start Recording"):"Mic not available"}
          </button>
        </div>
        <div className="mt-2 text-sm text-slate-500">Commands: “next”, “back”, “skip”, “start/stop recording”.</div>
      </div>

      {/* question card */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-indigo-700 mb-3">{current?.text}</h2>

        {["single","multi"].includes(current?.type) &&
          <div className="flex flex-wrap gap-2">
            {current.options.map(o=>(
              <Chip key={o} selected={a.choices?.includes(o)} onClick={()=>toggle(o,current.type)}>{o}</Chip>
            ))}
          </div>
        }

        {current?.type==="text" &&
          <textarea value={a.notes||""} onChange={e=>setAnswers(p=>({...p,[current.id]:{choices:[],notes:e.target.value}}))}
            placeholder="Speak or type your answer…" className="w-full min-h-[100px] mt-3 p-3 border rounded-md"/>
        }

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={()=>setStep(s=>Math.max(s-1,0))} className="px-3 py-1.5 rounded-md border">Back</button>
          <button onClick={skipQ} className="px-3 py-1.5 rounded-md border">Skip</button>
          <button onClick={nextQ} className="px-4 py-1.5 rounded-md bg-indigo-600 text-white font-semibold">Continue</button>
        </div>
      </div>
    </div>
  );
}

/* Mount app */
ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
