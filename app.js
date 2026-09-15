"use strict";

/* =========================================================
   SASSIBRASS – kawaii uppgifts-app med haj & säl
   ========================================================= */

// Demoläge: öppna sidan med ?demo=1 i adressen för att visa upp appen utan
// att det syns i den riktiga rapporten eller stjäl push-prenumerationen.
const DEMO_MODE = new URLSearchParams(location.search).get("demo") === "1";
const STORAGE_KEY = DEMO_MODE ? "sassibrass_demo_state_v1" : "sassibrass_state_v1";

/* ---------------------------------------------------------
   Push-notiser (Cloudflare Worker)
   --------------------------------------------------------- */
const PUSH_WORKER_URL = "https://sassibrass-push.bella-sassibrass.workers.dev";
const VAPID_PUBLIC_KEY = "BD3EfJvaUYdJgWzqt-OhSEPOIQcQKUkPjwqx1-gzD5iowBG6Lso6Zi591K3Xk8jd7MSOtdDtrxKaaF1dZTGa5fw";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("sw.js");
  } catch (e) {
    return null;
  }
}

async function getPushSubscription() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

async function enablePushNotifications() {
  if (DEMO_MODE) return false;
  if (!("Notification" in window) || !("PushManager" in window)) {
    alert("Din webbläsare stödjer tyvärr inte push-notiser.");
    return false;
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  const reg = await navigator.serviceWorker.ready;
  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
  });

  await fetch(PUSH_WORKER_URL + "/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription)
  }).catch(() => {});

  return true;
}

async function disablePushNotifications() {
  const sub = await getPushSubscription();
  if (sub) {
    await sub.unsubscribe();
  }
  await fetch(PUSH_WORKER_URL + "/unsubscribe", { method: "POST" }).catch(() => {});
}

function syncStateToWorker() {
  if (DEMO_MODE) return;
  const allDoneToday = Object.keys(state.completedToday).length >= totalTasksToday();
  const tasks = [];
  TASK_SECTIONS.forEach((section) => {
    activeTasksForSection(section).forEach((t) => {
      tasks.push({ id: t.id, text: t.text, done: !!state.completedToday[t.id] });
    });
  });
  fetch(PUSH_WORKER_URL + "/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ allDoneToday, tasks })
  }).catch(() => {});
}

/* ---------------------------------------------------------
   Uppgifter, indelade i sektioner för hela dagen
   --------------------------------------------------------- */
// days: valfri lista med veckodagsnummer (0=söndag ... 6=lördag) uppgiften gäller.
// Ingen "days"-lista = uppgiften gäller varje dag.
const DAG_MAN = 1, DAG_TIS = 2, DAG_ONS = 3, DAG_TORS = 4, DAG_FRE = 5, DAG_LOR = 6, DAG_SON = 0;

const TASK_SECTIONS = [
  {
    id: "morgon",
    emoji: "🌅",
    title: "Morgonrutin",
    tasks: [
      { id: "vakna", emoji: "☀️", text: "Vakna och sträck på dig" },
      { id: "sminka", emoji: "💄", text: "Sminka dig" },
      { id: "kladd", emoji: "👕", text: "Klä på dig" },
      { id: "har", emoji: "💇‍♀️", text: "Fixa håret" },
      { id: "badda", emoji: "🛏️", text: "Bädda sängen" },
      { id: "affirmation-rutin", emoji: "🪞", text: "Säg veckans affirmation högt under dagen" }
    ]
  },
  {
    id: "frukost",
    emoji: "🍳",
    title: "Frukost",
    tasks: [
      { id: "at-frukost", emoji: "🥣", text: "Ät frukost" },
      { id: "drick-vatten", emoji: "💧", text: "Drick vatten" },
      { id: "drick-kreatin", emoji: "🥤", text: "Drick kreatin" },
      { id: "tander-morgon", emoji: "🪥", text: "Borsta tänderna" },
      { id: "matsack", emoji: "🍱", text: "Packa snacks/bars/frukt" }
    ]
  },
  {
    id: "skola",
    emoji: "🎒",
    title: "Till skolan",
    tasks: [
      { id: "padda-bocker", emoji: "💻", text: "Ta med padda och böcker" },
      { id: "schema", emoji: "🗓️", text: "Kolla schemat" },
      { id: "till-skolan", emoji: "🚌", text: "Ta dig till skolan i tid" }
    ]
  },
  {
    id: "hemma",
    emoji: "🏠",
    title: "Hemma efter skolan",
    tasks: [
      { id: "matsopor", emoji: "🍂", text: "Gå ut med matsopor", days: [DAG_MAN, DAG_ONS, DAG_FRE, DAG_LOR, DAG_SON] },
      { id: "plastsopor", emoji: "♻️", text: "Gå ut med plastsopor", days: [DAG_TIS, DAG_TORS, DAG_SON] },
      { id: "metallglas", emoji: "🍾", text: "Gå ut med metall- och glassopor", days: [DAG_SON] },
      { id: "papperkartong", emoji: "📦", text: "Gå ut med papper och kartong", days: [DAG_SON] },
      { id: "restavfall", emoji: "🗑️", text: "Gå ut med restavfall", days: [DAG_SON] },
      { id: "mellanmal", emoji: "🍎", text: "Ät ett mellanmål" },
      { id: "tvatten", emoji: "🧺", text: "Gå ner med tvätten", days: [DAG_MAN, DAG_TORS] },
      { id: "snygga-rum", emoji: "🧹", text: "Snygga upp rummet" },
      { id: "dammsuga", emoji: "🧺", text: "Dammsuga", days: [DAG_LOR] },
      { id: "stada-badrum", emoji: "🚽", text: "Städa badrummet", days: [DAG_LOR] },
      { id: "nedanvaning", emoji: "📥", text: "Plocka undan grejer från nedanvåningen" }
    ]
  },
  {
    id: "socialt",
    emoji: "👭",
    title: "Socialt & läxor",
    tasks: [
      { id: "laxa", emoji: "📖", text: "Gör läxan" },
      { id: "kompis", emoji: "💬", text: "Träffa eller prata med en kompis" },
      { id: "piano", emoji: "🎹", text: "Träna piano 10 minuter", days: [DAG_MAN, DAG_ONS] }
    ]
  },
  {
    id: "traning",
    emoji: "🤸‍♀️",
    title: "Cheerleading & träning",
    tasks: [
      { id: "cheerleading", emoji: "🤸‍♀️", text: "Gå på cheerleading", days: [DAG_TIS, DAG_TORS, DAG_SON] },
      { id: "duscha", emoji: "🚿", text: "Duscha", days: [DAG_TIS, DAG_TORS, DAG_SON] }
    ]
  },
  {
    id: "kvall",
    emoji: "🌙",
    title: "Kvällsrutin",
    tasks: [
      { id: "tvatta-ansikte-kvall", emoji: "💦", text: "Tvätta ansiktet" },
      { id: "tander-kvall", emoji: "🪥", text: "Borsta tänderna" },
      { id: "klader-imorgon", emoji: "🧦", text: "Lägg fram kläder till imorgon" },
      { id: "padda-laddning", emoji: "🔌", text: "Sätt paddan på laddning" },
      { id: "tandborste-laddning", emoji: "🪥", text: "Ladda eltandborsten", parity: "even" },
      { id: "planera-veckan", emoji: "🗒️", text: "Planera din kommande vecka", days: [DAG_SON] },
      { id: "meditera", emoji: "🧘‍♀️", text: "Meditera" },
      { id: "dagbok", emoji: "📓", text: "Skriv dagbok" },
      { id: "las-bok", emoji: "📚", text: "Läs bok" },
      { id: "lagga-sig", emoji: "😴", text: "Lägg dig i tid" }
    ]
  }
];

const WEEKDAY_NAMES = ["söndag", "måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag"];

function dayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 1);
  return Math.floor((date - start) / 86400000) + 1;
}

// task.days: begränsar till vissa veckodagar. task.parity: "even"/"odd" ger "varannan dag"-uppgifter.
function isTaskActiveOnDate(task, date) {
  if (task.days && !task.days.includes(date.getDay())) return false;
  if (task.parity) {
    const isEven = dayOfYear(date) % 2 === 0;
    if (task.parity === "even" && !isEven) return false;
    if (task.parity === "odd" && isEven) return false;
  }
  return true;
}
function isTaskActiveToday(task) {
  return isTaskActiveOnDate(task, new Date());
}
function activeTasksForSection(section, date) {
  const d = date === undefined ? new Date() : date;
  return section.tasks.filter((t) => isTaskActiveOnDate(t, d));
}
function totalTasksForDate(date) {
  return TASK_SECTIONS.reduce((s, sec) => s + activeTasksForSection(sec, date).length, 0);
}
function totalTasksToday() {
  return totalTasksForDate(new Date());
}

const XP_PER_TASK = 5;
const FOOD_PER_TASK = 1;
const LOVE_PER_TASK = 1;
const MAX_FOOD = 4; // tak på lagret, så mat/kärlek måste tjänas in löpande istället för att hopa sig
const MAX_LOVE = 4;

function xpToNext(level) {
  return 350 + (level - 1) * 80;
}

/* ---------------------------------------------------------
   Peppiga meddelanden
   --------------------------------------------------------- */
const TASK_MESSAGES = [
  "Wow, du är helt fantastisk! 🦈✨",
  "Ja baby! Uppgift klarad – du krossar det idag! 💪🌊",
  "Din kompis gör en glädjedans för dig! 💃🌟",
  "Klappar med fenorna – du är bäst! 👏🐚",
  "Snyggt jobbat! Ett steg närmre en superdag 🌈",
  "Puts väck! Den uppgiften fanns knappt ens 😎",
  "Du är ostoppbar idag! 🚀",
  "Så himla proffsigt gjort! 🏆",
  "Ännu en vinst i kappsäcken! 🎒✨",
  "Fint jobbat, du tar hand om dig själv så bra 💖",
  "Simmar rakt mot målet, vilken stjärna! ⭐",
  "Det där gjorde du helt suveränt! 🥳",
  "Ditt djur är superstolt över dig just nu 🦭💕",
  "En till avklarad – du är helt magisk 🪄",
  "Woho! Small steps, big vibes 🌊✨",
  "Du visar verkligen vad du går för! 💪",
  "Superpepp-nivå: max! 🔥",
  "Det här är precis den energin vi vill ha! ⚡",
  "Bubblor av glädje överallt! 🫧",
  "Du är typ dagens huvudperson nu 🎬✨"
];

const SECTION_COMPLETE_MESSAGES = [
  "En hel sektion klar! Du är otrolig! 🎉",
  "Helt avklarat – ditt djur gör kullerbyttor av glädje! 🤸‍♀️",
  "Boom! Den kategorin är helt sopren! 🧹✨",
  "Snyggaste avklarade listan någonsin! 🏅",
  "Full pott på den här delen – legendariskt! 👑"
];

const ALL_DONE_MESSAGES = [
  "ALLA uppgifter klara idag?! Du är en LEGEND! 🏆🌊",
  "Perfekt dag uppnådd! Ditt djur simmar glädjevarv! 🦈🎊",
  "Wow wow wow – hela dagen avklarad, streak säkrad! 🔥✨",
  "Du är dagens superhjälte, punkt slut! 🦸‍♀️💖"
];

const LEVEL_UP_MESSAGES = [
  "LEVEL UP! Ditt djur känner sig starkare än någonsin! 🌟",
  "Ny nivå uppnåest – du gör verkligen ett strålande jobb! 🆙💫",
  "Level up! Bonusgodis regnar över er båda! 🍬✨"
];

const FOOD_MESSAGES = [
  "Mums! Precis vad jag behövde 🍤",
  "Så gott! Tack för maten! 😋",
  "Nu är magen glad och nöjd 🥰",
  "Slurp slurp, jättegott! 🌊"
];

const LOVE_MESSAGES = [
  "Åh vad varmt om hjärtat! 💕",
  "Jag älskar dig också! 🥹💖",
  "Kramar tillbaka så hårt jag kan! 🤗",
  "Bästa kompisar för alltid! 💞"
];

const GREETING_MORNING = [
  "God morgon! Redo för en superdag? ☀️",
  "Vakna vakna! Idag blir grymt! 🌅"
];
const GREETING_AFTERNOON = [
  "Hallå där! Hur går dagen? 🌊",
  "Snyggt kämpat hittills idag! 💪"
];
const GREETING_EVENING = [
  "Kvällen är här, snart dags att varva ner 🌙",
  "Bra jobbat idag, dags för lite mys! ✨"
];

const LOW_HUNGER_BUBBLE = ["Psst... jag är lite hungrig 🥺🍤", "Magen kurrar lite... mat tack! 🙏"];
const LOW_HAPPINESS_BUBBLE = ["Jag skulle bli superglad av lite kärlek 💗", "Kan jag få en kram? 🥺"];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function isConsecutiveDay(prevStr, curStr) {
  if (!prevStr) return false;
  const prev = new Date(prevStr + "T00:00:00");
  const cur = new Date(curStr + "T00:00:00");
  const diffDays = Math.round((cur - prev) / 86400000);
  return diffDays === 1;
}

/* ---------------------------------------------------------
   State
   --------------------------------------------------------- */
function defaultState() {
  return {
    petType: null,
    petName: "",
    level: 1,
    xp: 0,
    food: 2,
    love: 2,
    hunger: 80,
    happiness: 80,
    lastStatDecayAt: null,
    streak: 0,
    lastActiveDate: null,
    completedToday: {},
    rewardedToday: {},
    totalCompleted: 0,
    sectionsCollapsed: {}
  };
}

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return Object.assign(defaultState(), parsed);
  } catch (e) {
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function handleDailyReset() {
  const today = todayStr();
  if (state.lastActiveDate === today) return;

  if (state.lastActiveDate) {
    const completedCount = Object.keys(state.completedToday).length;
    const lastActiveDateObj = new Date(state.lastActiveDate + "T00:00:00");
    const wasFullDay = completedCount >= totalTasksForDate(lastActiveDateObj);
    const consecutive = isConsecutiveDay(state.lastActiveDate, today);

    if (wasFullDay && (consecutive || state.streak === 0)) {
      state.streak += 1;
    } else if (!consecutive) {
      state.streak = 0;
    } else if (!wasFullDay) {
      state.streak = 0;
    }

  }

  state.completedToday = {};
  state.rewardedToday = {};
  state.lastActiveDate = today;
  saveState();
}

const HUNGER_DECAY_PER_HOUR = 4;
const HAPPINESS_DECAY_PER_HOUR = 3;

// Sänker hunger/humör i takt med hur länge sen hon senast hade appen öppen,
// istället för en engångsminskning per dygn. Håller staplarna i synk med
// "jag är hungrig"-notiserna, som redan resonerar kring verklig förfluten tid.
function applyStatDecay() {
  const now = new Date();
  if (!state.lastStatDecayAt) {
    state.lastStatDecayAt = now.toISOString();
    saveState();
    return;
  }
  const hoursElapsed = (now - new Date(state.lastStatDecayAt)) / (60 * 60 * 1000);
  if (hoursElapsed < 0.1) return; // för kort tid för att vara värt att räkna

  state.hunger = Math.round(clamp(state.hunger - hoursElapsed * HUNGER_DECAY_PER_HOUR, 10, 100));
  state.happiness = Math.round(clamp(state.happiness - hoursElapsed * HAPPINESS_DECAY_PER_HOUR, 10, 100));
  state.lastStatDecayAt = now.toISOString();
  saveState();
}

/* ---------------------------------------------------------
   Pet SVG-generering (kawaii-stil)
   --------------------------------------------------------- */
function eyesMarkup(mood, cx1, cx2, cy) {
  if (mood === "love") {
    const heart = (cx) => `
      <path d="M${cx} ${cy + 6} C${cx - 8} ${cy - 4}, ${cx - 2} ${cy - 12}, ${cx} ${cy - 6}
               C${cx + 2} ${cy - 12}, ${cx + 8} ${cy - 4}, ${cx} ${cy + 6} Z" fill="#ff6f9c"/>`;
    return heart(cx1) + heart(cx2);
  }
  if (mood === "sad") {
    return `
      <circle cx="${cx1}" cy="${cy}" r="7" fill="#3a2e45"/>
      <circle cx="${cx2}" cy="${cy}" r="7" fill="#3a2e45"/>
      <path d="M${cx1 - 6} ${cy - 10} q6 -6 12 0" stroke="#3a2e45" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <path d="M${cx2 - 6} ${cy - 10} q6 -6 12 0" stroke="#3a2e45" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <circle cx="${cx1 + 3}" cy="${cy + 10}" r="2.5" fill="#bfe4ff"/>
    `;
  }
  // happy / yum / default – stora glittriga ögon
  return `
    <circle cx="${cx1}" cy="${cy}" r="9" fill="#3a2e45"/>
    <circle cx="${cx2}" cy="${cy}" r="9" fill="#3a2e45"/>
    <circle cx="${cx1 - 3}" cy="${cy - 3}" r="2.6" fill="#fff"/>
    <circle cx="${cx2 - 3}" cy="${cy - 3}" r="2.6" fill="#fff"/>
    <circle cx="${cx1 + 2.5}" cy="${cy + 2.5}" r="1.4" fill="#fff" opacity="0.8"/>
    <circle cx="${cx2 + 2.5}" cy="${cy + 2.5}" r="1.4" fill="#fff" opacity="0.8"/>
  `;
}

function mouthMarkup(mood, cx, cy) {
  if (mood === "yum") {
    return `<ellipse cx="${cx}" cy="${cy}" rx="7" ry="9" fill="#a5445c"/>
            <ellipse cx="${cx}" cy="${cy + 4}" rx="4" ry="3" fill="#ff8fa8"/>`;
  }
  if (mood === "sad") {
    return `<path d="M${cx - 10} ${cy + 6} q10 -10 20 0" stroke="#3a2e45" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  }
  return `<path d="M${cx - 12} ${cy - 4} q12 14 24 0" stroke="#3a2e45" stroke-width="3" fill="none" stroke-linecap="round"/>`;
}

function blushMarkup(cx1, cx2, cy) {
  return `<ellipse cx="${cx1}" cy="${cy}" rx="9" ry="5.5" fill="#ffb4c6" opacity="0.7"/>
          <ellipse cx="${cx2}" cy="${cy}" rx="9" ry="5.5" fill="#ffb4c6" opacity="0.7"/>`;
}

function accessoryMarkup(level) {
  if (level >= 6) {
    return `<g transform="translate(70,26)">
      <path d="M0 18 L6 2 L14 14 L20 -2 L26 14 L34 2 L40 18 Z" fill="#ffd93d" stroke="#e0a800" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="20" cy="4" r="3" fill="#ff6f9c"/>
    </g>`;
  }
  if (level >= 3) {
    return `<g transform="translate(122,40) rotate(15)">
      <path d="M0 0 L6 -14 L12 0 Z" fill="#ffd93d"/>
      <circle cx="6" cy="-16" r="3" fill="#ffe98a"/>
    </g>`;
  }
  return "";
}

function renderSharkSVG(mood, level) {
  return `
  <svg viewBox="0 0 200 180" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="100" cy="150" rx="55" ry="10" fill="#000" opacity="0.06"/>
    <path d="M60 60 Q100 20 150 55 Q170 65 165 95 Q160 130 110 140 Q60 148 45 110 Q35 80 60 60 Z" fill="#8fd8f7"/>
    <path d="M65 105 Q100 135 145 100 Q140 130 100 138 Q65 132 65 105 Z" fill="#eaf9ff"/>
    <path d="M105 25 Q118 5 132 22 Q120 32 108 34 Z" fill="#8fd8f7"/>
    <path d="M158 70 Q182 62 188 78 Q178 88 160 86 Z" fill="#8fd8f7"/>
    ${blushMarkup(78, 128, 92)}
    ${eyesMarkup(mood, 82, 122, 75)}
    ${mouthMarkup(mood, 102, 96)}
    ${accessoryMarkup(level)}
  </svg>`;
}

function renderSealSVG(mood, level) {
  return `
  <svg viewBox="0 0 200 180" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="100" cy="150" rx="55" ry="10" fill="#000" opacity="0.06"/>
    <ellipse cx="100" cy="95" rx="62" ry="58" fill="#c9d6e3"/>
    <ellipse cx="100" cy="112" rx="38" ry="30" fill="#eef3f8"/>
    <ellipse cx="45" cy="120" rx="16" ry="9" fill="#c9d6e3" transform="rotate(-25 45 120)"/>
    <ellipse cx="155" cy="120" rx="16" ry="9" fill="#c9d6e3" transform="rotate(25 155 120)"/>
    ${blushMarkup(72, 128, 100)}
    ${eyesMarkup(mood, 82, 122, 82)}
    ${mouthMarkup(mood, 102, 104)}
    <path d="M70 100 L45 96 M70 104 L43 106 M130 100 L155 96 M130 104 L157 106" stroke="#b0a89f" stroke-width="1.5" stroke-linecap="round"/>
    ${accessoryMarkup(level)}
  </svg>`;
}

function petSVG(type, mood, level) {
  return type === "seal" ? renderSealSVG(mood, level) : renderSharkSVG(mood, level);
}

let currentMood = "happy";
function updatePetAvatars(mood) {
  currentMood = mood || currentMood;
  const svg = petSVG(state.petType, currentMood, state.level);
  const mini = document.getElementById("pet-avatar");
  const big = document.getElementById("pet-avatar-big");
  if (mini) mini.innerHTML = svg;
  if (big) big.innerHTML = svg;
}

function flashMood(mood, duration = 1400) {
  updatePetAvatars(mood);
  setTimeout(() => updatePetAvatars("happy"), duration);
}

/* ---------------------------------------------------------
   UI: toasts, confetti, floating emoji
   --------------------------------------------------------- */
function showToast(text, big) {
  const layer = document.getElementById("toast-layer");
  const el = document.createElement("div");
  el.className = "toast" + (big ? " big" : "");
  el.textContent = text;
  layer.appendChild(el);
  setTimeout(() => el.remove(), 2700);
}

const CONFETTI_COLORS = ["#ff9ecb", "#8fd8f7", "#c9a6f5", "#ffd93d", "#7fe0c4"];
function burstConfetti(count) {
  const layer = document.getElementById("confetti-layer");
  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    el.className = "confetti-piece";
    const size = 6 + Math.random() * 6;
    el.style.left = Math.random() * 100 + "vw";
    el.style.width = size + "px";
    el.style.height = size * 0.6 + "px";
    el.style.background = pick(CONFETTI_COLORS);
    el.style.animationDuration = 1.6 + Math.random() * 1.2 + "s";
    el.style.opacity = String(0.8 + Math.random() * 0.2);
    layer.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }
}

function floatEmojiFromPet(emoji) {
  const stage = document.querySelector(".pet-stage");
  if (!stage) return;
  const el = document.createElement("div");
  el.className = "float-emoji";
  el.textContent = emoji;
  const rect = stage.getBoundingClientRect();
  el.style.left = rect.width / 2 - 12 + (Math.random() * 40 - 20) + "px";
  el.style.top = "50px";
  stage.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

/* ---------------------------------------------------------
   Rendering
   --------------------------------------------------------- */
function setBubble(text) {
  const el = document.getElementById("pet-bubble");
  if (el) el.textContent = text;
}

function greetingForNow() {
  const h = new Date().getHours();
  if (h < 10) return pick(GREETING_MORNING);
  if (h < 17) return pick(GREETING_AFTERNOON);
  return pick(GREETING_EVENING);
}

function updateStatsUI() {
  document.getElementById("pet-name-display").textContent = state.petName;
  document.getElementById("pet-level").textContent = "Lvl " + state.level;

  const xpPct = clamp((state.xp / xpToNext(state.level)) * 100, 0, 100);
  document.getElementById("xp-fill").style.width = xpPct + "%";
  document.getElementById("hunger-fill").style.width = state.hunger + "%";
  document.getElementById("happiness-fill").style.width = state.happiness + "%";

  document.getElementById("streak-count").textContent = state.streak;
  document.getElementById("food-count").textContent = state.food;
  document.getElementById("love-count").textContent = state.love;

  document.getElementById("feed-btn").disabled = state.food <= 0;
  document.getElementById("love-btn").disabled = state.love <= 0;

  const doneCount = Object.keys(state.completedToday).length;
  const totalToday = totalTasksToday();
  document.getElementById("daily-progress-text").textContent = `${doneCount} / ${totalToday}`;
  document.getElementById("daily-progress-fill").style.width = clamp((doneCount / totalToday) * 100, 0, 100) + "%";
  document.getElementById("daily-progress-weekday").textContent = WEEKDAY_NAMES[new Date().getDay()];

  if (state.hunger <= 25) setBubble(pick(LOW_HUNGER_BUBBLE));
  else if (state.happiness <= 25) setBubble(pick(LOW_HAPPINESS_BUBBLE));
}

function renderTaskSections() {
  const container = document.getElementById("task-sections");
  container.innerHTML = "";

  TASK_SECTIONS.forEach((section) => {
    const todaysTasks = activeTasksForSection(section);
    if (todaysTasks.length === 0) return;

    const doneInSection = todaysTasks.filter((t) => state.completedToday[t.id]).length;
    const collapsed = !!state.sectionsCollapsed[section.id];

    const sectionEl = document.createElement("div");
    sectionEl.className = "task-section" + (collapsed ? " collapsed" : "");
    sectionEl.innerHTML = `
      <div class="task-section-header" data-section="${section.id}">
        <span class="task-section-emoji">${section.emoji}</span>
        <span class="task-section-title">${section.title}</span>
        <span class="task-section-progress">${doneInSection}/${todaysTasks.length}</span>
        <span class="task-section-chevron">▾</span>
      </div>
      <ul class="task-list">
        ${todaysTasks
          .map((t) => {
            const done = !!state.completedToday[t.id];
            return `
            <li class="task-item${done ? " done" : ""}" data-task="${t.id}" data-section="${section.id}">
              <span class="task-checkbox">${done ? "✓" : ""}</span>
              <span class="task-emoji">${t.emoji}</span>
              <span class="task-label">${t.text}</span>
            </li>`;
          })
          .join("")}
      </ul>
    `;
    container.appendChild(sectionEl);
  });
}

function renderAll() {
  updatePetAvatars("happy");
  updateStatsUI();
  renderTaskSections();
  setBubble(greetingForNow().replace("!", `, ${state.petName || "vän"}!`));
  document.getElementById("demo-badge").hidden = !DEMO_MODE;
}

/* ---------------------------------------------------------
   Logik: klara uppgift, mata, ge kärlek
   --------------------------------------------------------- */
function completeTask(taskId, sectionId) {
  const alreadyDone = !!state.completedToday[taskId];

  if (alreadyDone) {
    delete state.completedToday[taskId];
    saveState();
    renderTaskSections();
    updateStatsUI();
    return;
  }

  state.completedToday[taskId] = true;

  if (!state.rewardedToday[taskId]) {
    state.rewardedToday[taskId] = true;
    state.xp += XP_PER_TASK;
    state.food = clamp(state.food + FOOD_PER_TASK, 0, MAX_FOOD);
    state.love = clamp(state.love + LOVE_PER_TASK, 0, MAX_LOVE);
    state.totalCompleted += 1;

    let leveledUp = false;
    while (state.xp >= xpToNext(state.level)) {
      state.xp -= xpToNext(state.level);
      state.level += 1;
      state.food = clamp(state.food + 2, 0, MAX_FOOD);
      state.love = clamp(state.love + 2, 0, MAX_LOVE);
      leveledUp = true;
    }

    showToast(pick(TASK_MESSAGES));
    burstConfetti(14);
    flashMood("love", 900);

    if (leveledUp) {
      setTimeout(() => {
        showToast(pick(LEVEL_UP_MESSAGES), true);
        burstConfetti(30);
      }, 350);
    }

    const section = TASK_SECTIONS.find((s) => s.id === sectionId);
    const sectionDone = activeTasksForSection(section).every((t) => state.completedToday[t.id]);
    if (sectionDone) {
      setTimeout(() => showToast(pick(SECTION_COMPLETE_MESSAGES)), leveledUp ? 750 : 400);
      burstConfetti(20);
    }

    const allDone = Object.keys(state.completedToday).length >= totalTasksToday();
    if (allDone) {
      setTimeout(() => {
        showToast(pick(ALL_DONE_MESSAGES), true);
        burstConfetti(50);
      }, sectionDone ? 1100 : 500);
    }
  }

  saveState();
  renderTaskSections();
  updateStatsUI();
  syncStateToWorker();
}

function feedPet() {
  if (state.food <= 0) return;
  state.food -= 1;
  state.hunger = clamp(state.hunger + 20, 0, 100);
  saveState();
  updateStatsUI();
  floatEmojiFromPet("🍤");
  setBubble(pick(FOOD_MESSAGES));
  flashMood("yum", 900);
  document.getElementById("pet-avatar-big").classList.add("pulse-once");
  setTimeout(() => document.getElementById("pet-avatar-big").classList.remove("pulse-once"), 500);
}

function lovePet() {
  if (state.love <= 0) return;
  state.love -= 1;
  state.happiness = clamp(state.happiness + 20, 0, 100);
  saveState();
  updateStatsUI();
  floatEmojiFromPet("💕");
  setBubble(pick(LOVE_MESSAGES));
  flashMood("love", 900);
  document.getElementById("pet-avatar-big").classList.add("pulse-once");
  setTimeout(() => document.getElementById("pet-avatar-big").classList.remove("pulse-once"), 500);
}

/* ---------------------------------------------------------
   Start-skärm
   --------------------------------------------------------- */
function initStartScreen() {
  let chosenPet = null;
  const choices = document.querySelectorAll(".pet-choice");
  const nameInput = document.getElementById("pet-name-input");
  const startBtn = document.getElementById("start-btn");

  choices.forEach((btn) => {
    const previewEl = btn.querySelector(".pet-avatar-preview");
    previewEl.innerHTML = petSVG(btn.dataset.pet, "happy", 1);
    btn.addEventListener("click", () => {
      chosenPet = btn.dataset.pet;
      choices.forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      validateStart();
    });
  });

  function validateStart() {
    startBtn.disabled = !(chosenPet && nameInput.value.trim().length > 0);
  }
  nameInput.addEventListener("input", validateStart);

  startBtn.addEventListener("click", () => {
    if (!chosenPet || !nameInput.value.trim()) return;
    state.petType = chosenPet;
    state.petName = nameInput.value.trim().slice(0, 16);
    state.lastActiveDate = todayStr();
    saveState();
    showAppScreen();
  });
}

async function showAppScreen() {
  document.getElementById("screen-start").classList.remove("active");
  document.getElementById("screen-app").classList.add("active");
  renderAll();

  const sub = await getPushSubscription();
  if (sub) document.getElementById("notif-btn").classList.add("active");
}

/* ---------------------------------------------------------
   Event delegation
   --------------------------------------------------------- */
function initAppEvents() {
  document.getElementById("task-sections").addEventListener("click", (e) => {
    const header = e.target.closest(".task-section-header");
    if (header) {
      const id = header.dataset.section;
      state.sectionsCollapsed[id] = !state.sectionsCollapsed[id];
      saveState();
      renderTaskSections();
      return;
    }
    const item = e.target.closest(".task-item");
    if (item) {
      completeTask(item.dataset.task, item.dataset.section);
    }
  });

  document.getElementById("feed-btn").addEventListener("click", feedPet);
  document.getElementById("love-btn").addEventListener("click", lovePet);

  document.getElementById("notif-btn").addEventListener("click", async () => {
    if (DEMO_MODE) {
      showToast("Notiser är avstängda i demoläget 🔕");
      return;
    }
    const btn = document.getElementById("notif-btn");
    const existing = await getPushSubscription();
    if (existing) {
      await disablePushNotifications();
      btn.classList.remove("active");
      showToast("Påminnelser avstängda 🔕");
    } else {
      const ok = await enablePushNotifications();
      if (ok) {
        btn.classList.add("active");
        showToast("Påminnelser på! Djuret hör av sig 🔔💕");
        syncStateToWorker();
      } else {
        showToast("Kunde inte slå på påminnelser 😢");
      }
    }
  });

  document.getElementById("reset-btn").addEventListener("click", () => {
    if (confirm("Vill du verkligen börja om helt? Allt sparat försvinner. 🥺")) {
      localStorage.removeItem(STORAGE_KEY);
      location.reload();
    }
  });
}

/* ---------------------------------------------------------
   Init
   --------------------------------------------------------- */
function init() {
  handleDailyReset();
  applyStatDecay();
  initAppEvents();
  registerServiceWorker();

  if (state.petType) {
    showAppScreen();
  } else {
    document.getElementById("screen-start").classList.add("active");
    initStartScreen();
  }
}

document.addEventListener("DOMContentLoaded", init);
