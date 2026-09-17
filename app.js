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
    body: JSON.stringify({
      allDoneToday,
      tasks,
      hunger: state.hunger,
      happiness: state.happiness,
      level: state.level,
      streak: state.streak,
      petName: state.petName
    })
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
      { id: "vakna", emoji: "☀️", text: "Vakna och sträck på dig", reward: "love" },
      { id: "sminka", emoji: "💄", text: "Sminka dig", reward: "food" },
      { id: "kladd", emoji: "👕", text: "Klä på dig", reward: "love" },
      { id: "har", emoji: "💇‍♀️", text: "Fixa håret", reward: "food" },
      { id: "badda", emoji: "🛏️", text: "Bädda sängen", reward: "love" },
      { id: "affirmation-rutin", emoji: "🪞", text: "Säg veckans affirmation högt under dagen", reward: "food" }
    ]
  },
  {
    id: "frukost",
    emoji: "🍳",
    title: "Frukost",
    tasks: [
      { id: "at-frukost", emoji: "🥣", text: "Ät frukost", reward: "food" },
      { id: "drick-vatten", emoji: "💧", text: "Drick vatten", reward: "food" },
      { id: "drick-kreatin", emoji: "🥤", text: "Drick kreatin", reward: "food" },
      { id: "tander-morgon", emoji: "🪥", text: "Borsta tänderna", reward: "love" },
      { id: "matsack", emoji: "🍱", text: "Packa snacks/bars/frukt", reward: "food" }
    ]
  },
  {
    id: "skola",
    emoji: "🎒",
    title: "Till skolan",
    tasks: [
      { id: "padda-bocker", emoji: "💻", text: "Ta med padda och böcker", reward: "love" },
      { id: "schema", emoji: "🗓️", text: "Kolla schemat", reward: "food" },
      { id: "till-skolan", emoji: "🚌", text: "Ta dig till skolan i tid", reward: "love" }
    ]
  },
  {
    id: "hemma",
    emoji: "🏠",
    title: "Hemma efter skolan",
    tasks: [
      {
        id: "matsopor",
        emoji: "🍂",
        text: "Gå ut med matsopor",
        reward: "love",
        schedule: [
          { day: DAG_MAN, weekParity: "even" },
          { day: DAG_ONS, weekParity: "odd" },
          { day: DAG_FRE },
          { day: DAG_LOR, weekParity: "odd" },
          { day: DAG_SON }
        ]
      },
      {
        id: "plastsopor",
        emoji: "♻️",
        text: "Gå ut med plastsopor",
        reward: "food",
        schedule: [
          { day: DAG_TIS, weekParity: "even" },
          { day: DAG_TORS, weekParity: "odd" },
          { day: DAG_SON }
        ]
      },
      {
        id: "metallglas",
        emoji: "🍾",
        text: "Gå ut med metall- och glassopor",
        reward: "love",
        schedule: [{ day: DAG_SON, weekParity: "odd" }]
      },
      {
        id: "papperkartong",
        emoji: "📦",
        text: "Gå ut med papper och kartong",
        reward: "food",
        schedule: [{ day: DAG_SON, weekParity: "odd" }]
      },
      {
        id: "restavfall",
        emoji: "🗑️",
        text: "Gå ut med restavfall",
        reward: "love",
        schedule: [{ day: DAG_SON, weekParity: "odd" }]
      },
      { id: "mellanmal", emoji: "🍎", text: "Ät ett mellanmål", reward: "food" },
      { id: "tvatten", emoji: "🧺", text: "Gå ner med tvätten", days: [DAG_MAN, DAG_TORS], reward: "love" },
      { id: "snygga-rum", emoji: "🧹", text: "Snygga upp rummet", reward: "food" },
      { id: "dammsuga", emoji: "🧺", text: "Dammsuga", days: [DAG_LOR], reward: "love" },
      { id: "stada-badrum", emoji: "🚽", text: "Städa badrummet", days: [DAG_LOR], reward: "food" },
      { id: "nedanvaning", emoji: "📥", text: "Plocka undan grejer från nedanvåningen", reward: "love" }
    ]
  },
  {
    id: "socialt",
    emoji: "👭",
    title: "Socialt & läxor",
    tasks: [
      { id: "laxa", emoji: "📖", text: "Gör läxan", reward: "food" },
      { id: "kompis", emoji: "💬", text: "Träffa eller prata med en kompis", reward: "love" },
      { id: "piano", emoji: "🎹", text: "Träna piano 10 minuter", days: [DAG_MAN, DAG_ONS], reward: "food" }
    ]
  },
  {
    id: "traning",
    emoji: "🤸‍♀️",
    title: "Cheerleading & träning",
    tasks: [
      { id: "cheerleading", emoji: "🤸‍♀️", text: "Gå på cheerleading", schedule: [{ day: DAG_TORS, weekParity: "odd" }], reward: "food" },
      { id: "duscha", emoji: "🚿", text: "Duscha", schedule: [{ day: DAG_TORS, weekParity: "odd" }], reward: "love" }
    ]
  },
  {
    id: "kvall",
    emoji: "🌙",
    title: "Kvällsrutin",
    tasks: [
      { id: "tvatta-ansikte-kvall", emoji: "💦", text: "Tvätta ansiktet", reward: "love" },
      { id: "tander-kvall", emoji: "🪥", text: "Borsta tänderna", reward: "food" },
      { id: "klader-imorgon", emoji: "🧦", text: "Lägg fram kläder till imorgon", reward: "love" },
      { id: "padda-laddning", emoji: "🔌", text: "Sätt paddan på laddning", reward: "food" },
      { id: "tandborste-laddning", emoji: "🪥", text: "Ladda eltandborsten", parity: "even", reward: "love" },
      { id: "planera-veckan", emoji: "🗒️", text: "Planera din kommande vecka", days: [DAG_SON], reward: "food" },
      { id: "meditera", emoji: "🧘‍♀️", text: "Meditera", reward: "love" },
      { id: "las-bok", emoji: "📚", text: "Läs bok", reward: "food" },
      { id: "lagga-sig", emoji: "😴", text: "Lägg dig i tid", reward: "food" }
    ]
  }
];

const WEEKDAY_NAMES = ["söndag", "måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag"];

function dayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 1);
  return Math.floor((date - start) / 86400000) + 1;
}

// Vanligt svenskt veckonummer (ISO 8601, vecka 1 är den med årets första torsdag).
function isoWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // måndag=1 ... söndag=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function weekParityMatches(weekParity, date) {
  if (!weekParity) return true;
  const isEvenWeek = isoWeekNumber(date) % 2 === 0;
  return weekParity === "even" ? isEvenWeek : !isEvenWeek;
}

// task.days: begränsar till vissa veckodagar. task.parity: "even"/"odd" ger "varannan dag"-uppgifter.
// task.schedule: lista med {day, weekParity} för uppgifter som varierar per dag OCH jämn/udda vecka
// (t.ex. sopsortering), används istället för days/parity när den finns.
function isTaskActiveOnDate(task, date) {
  if (task.schedule) {
    const today = date.getDay();
    return task.schedule.some((rule) => rule.day === today && weekParityMatches(rule.weekParity, date));
  }
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
    hasBaby: false,
    babyName: "",
    nextBabyLevel: 30,
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

const HUNGER_DECAY_PER_HOUR = 6;
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
   Pet-figurer (klistermärken) och pynt
   --------------------------------------------------------- */
// Pynt låses upp var tredje nivå och blir kvar (senaste två syns samtidigt,
// så det känns som en växande samling utan att bli rörigt).
const ACCESSORY_TIERS = [
  {
    level: 3,
    label: "Stjärnpannband",
    markup: `<g transform="translate(122,40) rotate(15)">
      <path d="M0 0 L6 -14 L12 0 Z" fill="#ffd93d"/>
      <circle cx="6" cy="-16" r="3" fill="#ffe98a"/>
    </g>`
  },
  {
    level: 6,
    label: "Krona",
    markup: `<g transform="translate(70,26)">
      <path d="M0 18 L6 2 L14 14 L20 -2 L26 14 L34 2 L40 18 Z" fill="#ffd93d" stroke="#e0a800" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="20" cy="4" r="3" fill="#ff6f9c"/>
    </g>`
  },
  {
    level: 9,
    label: "Halsband",
    markup: `<g>
      <path d="M70 110 Q100 134 130 110" stroke="#ffd93d" stroke-width="4" fill="none" stroke-linecap="round"/>
      <circle cx="100" cy="130" r="6.5" fill="#ff6f9c" stroke="#fff" stroke-width="2"/>
    </g>`
  },
  {
    level: 12,
    label: "Rosett",
    markup: `<g transform="translate(145,38) rotate(-10)">
      <path d="M0 0 Q-12 -8 -14 2 Q-12 10 0 4 Q12 10 14 2 Q12 -8 0 0 Z" fill="#ff9ecb" stroke="#ff6f9c" stroke-width="1.5"/>
      <circle cx="0" cy="2" r="2.5" fill="#fff"/>
    </g>`
  },
  {
    level: 15,
    label: "Handväska",
    markup: `<g transform="translate(150,118)">
      <path d="M-11 6 Q-11 -6 0 -6 Q11 -6 11 6 Z" fill="#c9a6f5" stroke="#a685e0" stroke-width="1.5"/>
      <path d="M-6 -6 Q-6 -14 0 -14 Q6 -14 6 -6" stroke="#a685e0" stroke-width="2" fill="none"/>
      <rect x="-4" y="0" width="8" height="4" rx="1.5" fill="#eee2ff"/>
    </g>`
  },
  {
    level: 18,
    label: "Solglasögon",
    markup: `<g transform="translate(102,78)">
      <ellipse cx="-20" cy="0" rx="11" ry="9" fill="#4a3f5c"/>
      <ellipse cx="20" cy="0" rx="11" ry="9" fill="#4a3f5c"/>
      <path d="M-9 -2 Q0 -9 9 -2" stroke="#4a3f5c" stroke-width="3" fill="none"/>
      <ellipse cx="-23" cy="-3" rx="3" ry="2" fill="#fff" opacity="0.5"/>
      <ellipse cx="17" cy="-3" rx="3" ry="2" fill="#fff" opacity="0.5"/>
    </g>`
  },
  {
    level: 21,
    label: "Gosedjur",
    markup: `<g transform="translate(35,128)">
      <circle cx="0" cy="6" r="9" fill="#e0b98a"/>
      <circle cx="-7" cy="-2" r="4" fill="#e0b98a"/>
      <circle cx="7" cy="-2" r="4" fill="#e0b98a"/>
      <circle cx="0" cy="16" r="7" fill="#e0b98a"/>
      <circle cx="-3" cy="5" r="1.2" fill="#3a2e45"/>
      <circle cx="3" cy="5" r="1.2" fill="#3a2e45"/>
      <path d="M-2 9 Q0 11 2 9" stroke="#3a2e45" stroke-width="1" fill="none" stroke-linecap="round"/>
    </g>`
  },
  {
    level: 24,
    label: "Kudde",
    markup: `<g transform="translate(148,140)">
      <rect x="-16" y="-8" width="32" height="20" rx="7" fill="#ffe0ea" stroke="#ff9ecb" stroke-width="1.5"/>
      <path d="M-9 -3 L9 -3 M-9 3 L9 3" stroke="#ff9ecb" stroke-width="1.2" stroke-linecap="round"/>
    </g>`
  },
  {
    level: 27,
    label: "Glitter",
    markup: `<g fill="#ffe98a">
      <path d="M50 30 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2 Z"/>
      <path d="M154 26 l1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 4 -1.5 Z"/>
      <path d="M168 58 l1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 4 -1.5 Z"/>
    </g>`
  }
];

function accessoryMarkup(level) {
  const earned = ACCESSORY_TIERS.filter((t) => level >= t.level);
  // visa bara de två senast upplåsta, annars blir det för rörigt på en liten yta
  return earned.slice(-2).map((t) => t.markup).join("");
}

function petSizeScale(level) {
  if (level >= 30) return 1.45;
  if (level >= 20) return 1.3;
  if (level >= 10) return 1.15;
  return 1;
}

const SEAL_STICKERS = {
  love: "icons/seal/love.png",
  yum: "icons/seal/yum.png",
  sad: "icons/seal/sad.png",
  happyPool: [
    "icons/seal/happy-1.png",
    "icons/seal/happy-2.png",
    "icons/seal/happy-3.png",
    "icons/seal/happy-4.png",
    "icons/seal/happy-5.png",
    "icons/seal/happy-6.png",
    "icons/seal/happy-7.png",
    "icons/seal/happy-8.png",
    "icons/seal/happy-9.png",
    "icons/seal/happy-10.png",
    "icons/seal/happy-11.png",
    "icons/seal/happy-12.png",
    "icons/seal/happy-13.png",
    "icons/seal/happy-14.png"
  ]
};

const SHARK_STICKERS = {
  love: "icons/shark/love.png",
  yum: "icons/shark/yum.png",
  sad: "icons/shark/sad.png",
  happyPool: Array.from({ length: 25 }, (_, i) => `icons/shark/happy-${i + 1}.png`)
};

const ACCESSORY_EMOJI = {
  Stjärnpannband: "⭐",
  Krona: "👑",
  Halsband: "📿",
  Rosett: "🎀",
  Handväska: "👜",
  Solglasögon: "🕶️",
  Gosedjur: "🧸",
  Kudde: "🛋️",
  Glitter: "✨"
};

// Slumpas en gång per app-session, inte varje render, så bilden inte hoppar
// runt varje gång hon bockar av en uppgift.
let sealHappyPick = null;
function sealHappyImage() {
  if (!sealHappyPick) {
    sealHappyPick = pick(SEAL_STICKERS.happyPool);
  }
  return sealHappyPick;
}

let sharkHappyPick = null;
function sharkHappyImage() {
  if (!sharkHappyPick) {
    sharkHappyPick = pick(SHARK_STICKERS.happyPool);
  }
  return sharkHappyPick;
}

function renderAnimalSticker(stickers, happyImage, altText, prefix, mood, level) {
  let src;
  if (mood === "love") src = stickers.love;
  else if (mood === "yum") src = stickers.yum;
  else if (mood === "sad" || mood === "tired") src = stickers.sad;
  else src = happyImage();

  const earned = ACCESSORY_TIERS.filter((t) => level >= t.level);
  const badge = earned.length ? ACCESSORY_EMOJI[earned[earned.length - 1].label] || "" : "";

  return `
    <div class="${prefix}-sticker-wrap">
      <img src="${src}" alt="${altText}" class="${prefix}-sticker-img" />
      ${badge ? `<span class="${prefix}-accessory-badge">${badge}</span>` : ""}
    </div>
  `;
}

function renderSealSticker(mood, level) {
  return renderAnimalSticker(SEAL_STICKERS, sealHappyImage, "Säl", "seal", mood, level);
}

function renderSharkSticker(mood, level) {
  return renderAnimalSticker(SHARK_STICKERS, sharkHappyImage, "Haj", "shark", mood, level);
}

function petSVG(type, mood, level) {
  return type === "seal" ? renderSealSticker(mood, level) : renderSharkSticker(mood, level);
}

let currentMood = "happy";
function updatePetAvatars(mood) {
  currentMood = mood || currentMood;
  const svg = petSVG(state.petType, currentMood, state.level);
  const mini = document.getElementById("pet-avatar");
  const big = document.getElementById("pet-avatar-big");
  if (mini) mini.innerHTML = svg;
  if (big) big.innerHTML = svg;

  const sizeWrap = document.getElementById("pet-size-wrap");
  if (sizeWrap) sizeWrap.style.transform = `scale(${petSizeScale(state.level)})`;
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

function isEveningWindDown() {
  const now = new Date();
  return now.getHours() > 20 || (now.getHours() === 20 && now.getMinutes() >= 45);
}

function renderAll() {
  const restingMood = state.hunger <= 25 || state.happiness <= 25
    ? "sad"
    : isEveningWindDown()
    ? "tired"
    : "happy";
  updatePetAvatars(restingMood);
  updateStatsUI();
  renderTaskSections();
  renderBabyAvatar();
  setBubble(greetingForNow().replace("!", `, ${state.petName || "vän"}!`));
  document.getElementById("demo-badge").hidden = !DEMO_MODE;
}

/* ---------------------------------------------------------
   Bebis: dyker upp vid nextBabyLevel, val en nivå senare
   --------------------------------------------------------- */
function renderBabyAvatar() {
  const wrap = document.getElementById("baby-avatar-wrap");
  if (!wrap) return;
  if (!state.hasBaby) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  document.getElementById("baby-avatar").innerHTML = petSVG(state.petType, "happy", 1);
  document.getElementById("baby-name-tag").textContent = state.babyName;
}

function showBabyChoiceModal() {
  const modal = document.getElementById("baby-choice-modal");
  document.getElementById("baby-choice-text").textContent =
    `${state.babyName} har vuxit och är redo för nästa steg. Vill du börja om helt från början med ${state.babyName} som ditt nya djur, eller låta ${state.babyName} flytta hemifrån och fortsätta som vanligt med ${state.petName}?`;
  modal.hidden = false;
}

function hideBabyChoiceModal() {
  document.getElementById("baby-choice-modal").hidden = true;
}

function checkBabyMilestones() {
  if (!state.hasBaby && state.level >= state.nextBabyLevel) {
    const input = prompt("En bebis har anlänt! Vad ska hon heta? 🍼", "");
    const name = (input || "Lillen").trim().slice(0, 16) || "Lillen";
    state.hasBaby = true;
    state.babyName = name;
    saveState();
    renderBabyAvatar();
    showToast(`En bebis har anlänt! Välkommen, ${name}! 🍼💕`, true);
    burstConfetti(30);
    return;
  }
  if (state.hasBaby && state.level >= state.nextBabyLevel + 1) {
    showBabyChoiceModal();
  }
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

    const section = TASK_SECTIONS.find((s) => s.id === sectionId);
    const task = section && section.tasks.find((t) => t.id === taskId);
    const rewardType = task && task.reward === "food" ? "food" : "love";
    if (rewardType === "food") {
      state.food = clamp(state.food + FOOD_PER_TASK, 0, MAX_FOOD);
    } else {
      state.love = clamp(state.love + LOVE_PER_TASK, 0, MAX_LOVE);
    }
    state.totalCompleted += 1;

    const levelBefore = state.level;
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
    flashMood(rewardType === "food" ? "yum" : "love", 900);

    if (leveledUp) {
      setTimeout(() => {
        showToast(pick(LEVEL_UP_MESSAGES), true);
        burstConfetti(30);
      }, 350);

      const newAccessory = ACCESSORY_TIERS.find((t) => t.level > levelBefore && t.level <= state.level);
      const newSizeTier = [10, 20, 30].find((l) => l > levelBefore && l <= state.level);
      let extraDelay = 900;
      if (newAccessory) {
        setTimeout(() => {
          showToast(`Nytt pynt upplåst: ${newAccessory.label}! ✨`, true);
          burstConfetti(24);
        }, extraDelay);
        extraDelay += 550;
      }
      if (newSizeTier) {
        setTimeout(() => {
          showToast("Djuret har växt sig större! 🌟🦈", true);
          burstConfetti(24);
        }, extraDelay);
      }

      checkBabyMilestones();
    }

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
  state.hunger = clamp(state.hunger + 12, 0, 100);
  saveState();
  updateStatsUI();
  floatEmojiFromPet("🍤");
  setBubble(pick(FOOD_MESSAGES));
  flashMood("yum", 900);
  document.getElementById("pet-avatar-big").classList.add("pulse-once");
  setTimeout(() => document.getElementById("pet-avatar-big").classList.remove("pulse-once"), 500);
  syncStateToWorker();
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
  syncStateToWorker();
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
  checkBabyMilestones();

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

  document.getElementById("baby-restart-btn").addEventListener("click", () => {
    const babyName = state.babyName;
    state.petName = babyName;
    state.level = 1;
    state.xp = 0;
    state.food = 2;
    state.love = 2;
    state.hunger = 80;
    state.happiness = 80;
    state.lastStatDecayAt = new Date().toISOString();
    state.streak = 0;
    state.completedToday = {};
    state.rewardedToday = {};
    state.hasBaby = false;
    state.babyName = "";
    state.nextBabyLevel = 30;
    saveState();
    hideBabyChoiceModal();
    renderAll();
    showToast(`Ny resa påbörjad med ${babyName}! 🍼✨`, true);
    burstConfetti(30);
  });

  document.getElementById("baby-moveout-btn").addEventListener("click", () => {
    const babyName = state.babyName;
    state.hasBaby = false;
    state.babyName = "";
    state.nextBabyLevel += 30;
    saveState();
    hideBabyChoiceModal();
    renderAll();
    showToast(`${babyName} flyttade hemifrån, lycka till där ute! Hon finns alltid kvar i minnet 💕`, true);
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
