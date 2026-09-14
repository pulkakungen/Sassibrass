import { buildPushPayload } from "@block65/webcrypto-web-push";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const SUBSCRIPTION_KEY = "subscription";
const STATE_KEY = "state";

const AWAKE_START_MIN = 8 * 60; // 08:00
const AWAKE_END_MIN = 21 * 60 + 30; // 21:30
const NAG_GAP_MS = 4 * 60 * 60 * 1000; // 4 timmar utan aktivitet innan djuret säger till

const FIXED_REMINDERS = [
  {
    id: "morgon",
    hour: 6,
    minute: 35,
    messages: [
      "God morgon! Dags att vakna, jag väntar på dig! ☀️🦈",
      "Rise and shine! En ny superdag börjar nu 🌊✨"
    ]
  },
  {
    id: "frukost",
    hour: 6,
    minute: 55,
    messages: [
      "Frukostdags! Kom och mata mig med något gott du också 🍳🦭",
      "Psst, dags för frukost innan skolan! 🥣💕"
    ]
  },
  {
    id: "mamma-hej",
    hour: 7,
    minute: 45,
    messages: ["Ha en fin dag i skolan. Jag älskar dig ❤️ / mamma"]
  },
  {
    id: "eftermiddag",
    hour: 15,
    minute: 30,
    messages: [
      "Hej igen! Dags att kolla läxor, sopor och sånt hemma 🎒🍂",
      "Eftermiddagen är här - vad står på listan idag? 📋✨"
    ]
  },
  {
    id: "kvall",
    hour: 21,
    minute: 0,
    messages: [
      "Snart läggdags... har vi hunnit med kvällsrutinen? 🌙💤",
      "Dags att varva ner! Kolla av kvällens sista uppgifter 🌙🦈"
    ]
  },
  {
    id: "mamma-godnatt",
    hour: 21,
    minute: 30,
    messages: ["God natt, söta drömmar, jag älskar dig. Puss puss. Vi ses i morgon ❤️"]
  },
  {
    id: "affirmation",
    hour: 6,
    minute: 45,
    messages: [
      "🌟 Veckans affirmation: Jag gör mitt bästa, och mitt bästa är helt och hållet tillräckligt.",
      "🌟 Veckans affirmation: Jag har förmågan att lära mig svåra saker om jag bara ger det lite tid.",
      "🌟 Veckans affirmation: Nervositet betyder bara att jag bryr mig, och jag kan kanalisera den till energi.",
      "🌟 Veckans affirmation: Jag tar ett steg i taget och litar på min egen process och förmåga.",
      "🌟 Veckans affirmation: Utmaningar gör mig starkare och jag utvecklas varje gång jag försöker.",
      "🌟 Veckans affirmation: Jag firar mina framsteg, oavsett hur små eller stora de verkar vara.",
      "🌟 Veckans affirmation: Jag duger precis som jag är, oavsett vad andra tycker eller tänker om mig.",
      "🌟 Veckans affirmation: Min värdighet mäts inte i mina prestationer eller hur många rätt jag har på ett prov.",
      "🌟 Veckans affirmation: Jag är stolt över den jag är och jag har unika talanger att bidra med.",
      "🌟 Veckans affirmation: Jag tillåter mig själv att göra misstag, eftersom misstag hjälper mig att växa.",
      "🌟 Veckans affirmation: Jag väljer att vara snäll mot mig själv när saker känns svåra eller tunga.",
      "🌟 Veckans affirmation: Min röst och mina åsikter är viktiga, och jag har rätt att ta plats."
    ]
  }
];

const NAG_MESSAGES = [
  "Psst... jag är lite hungrig 🥺🍤 Var är du?",
  "Har du glömt mig? Jag saknar dig! 🥹💕",
  "Hallå där! Jag längtar efter lite uppmärksamhet 🦭✨",
  "Magen kurrar och jag är ensam här... kom och hälsa på! 🌊",
  "Jag sitter och väntar på dig, kompis 🥺 Kika in i appen!"
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function stockholmParts(date) {
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    dateStr: `${parts.year}-${parts.month}-${parts.day}`,
    minutesOfDay: parseInt(parts.hour, 10) * 60 + parseInt(parts.minute, 10)
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS }
  });
}

async function sendPush(env, message) {
  const subRaw = await env.PUSH_KV.get(SUBSCRIPTION_KEY);
  if (!subRaw) return false;
  const subscription = JSON.parse(subRaw);

  const vapid = {
    subject: env.VAPID_SUBJECT,
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY
  };

  const payload = await buildPushPayload(
    { data: JSON.stringify({ title: "Sassibrass", body: message }), options: { ttl: 3600 } },
    subscription,
    vapid
  );

  const res = await fetch(subscription.endpoint, payload);
  if (res.status === 404 || res.status === 410) {
    // prenumerationen är ogiltig, ta bort den
    await env.PUSH_KV.delete(SUBSCRIPTION_KEY);
  }
  return res.ok;
}

async function handleScheduled(env) {
  const now = new Date();
  const { dateStr, minutesOfDay } = stockholmParts(now);

  const hasSub = !!(await env.PUSH_KV.get(SUBSCRIPTION_KEY));
  if (!hasSub) return;

  // --- Fasta påminnelser ---
  const sentKey = `reminders:${dateStr}`;
  const sentRaw = await env.PUSH_KV.get(sentKey);
  const sent = sentRaw ? JSON.parse(sentRaw) : [];

  for (const reminder of FIXED_REMINDERS) {
    const slotStart = reminder.hour * 60 + reminder.minute;
    const withinWindow = minutesOfDay >= slotStart && minutesOfDay < slotStart + 15;
    if (withinWindow && !sent.includes(reminder.id)) {
      await sendPush(env, pick(reminder.messages));
      sent.push(reminder.id);
      await env.PUSH_KV.put(sentKey, JSON.stringify(sent), { expirationTtl: 60 * 60 * 48 });
    }
  }

  // --- "Jag är hungrig"-nagging om hon varit inaktiv länge ---
  if (minutesOfDay < AWAKE_START_MIN || minutesOfDay > AWAKE_END_MIN) return;

  const stateRaw = await env.PUSH_KV.get(STATE_KEY);
  const state = stateRaw ? JSON.parse(stateRaw) : null;
  if (!state) return; // appen har aldrig synkat, inget att sakna ännu

  if (state.lastSyncDateStr === dateStr && state.allDoneToday) return; // klar för dagen, inget tjat

  const lastActivityMs = new Date(state.lastSyncAt).getTime();
  const gapSinceActivity = now.getTime() - lastActivityMs;
  const lastNagMs = state.lastNagAt ? new Date(state.lastNagAt).getTime() : 0;
  const gapSinceNag = now.getTime() - lastNagMs;

  if (gapSinceActivity > NAG_GAP_MS && gapSinceNag > NAG_GAP_MS) {
    await sendPush(env, pick(NAG_MESSAGES));
    state.lastNagAt = now.toISOString();
    await env.PUSH_KV.put(STATE_KEY, JSON.stringify(state));
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (url.pathname === "/subscribe" && request.method === "POST") {
      const subscription = await request.json();
      await env.PUSH_KV.put(SUBSCRIPTION_KEY, JSON.stringify(subscription));
      return json({ ok: true });
    }

    if (url.pathname === "/unsubscribe" && request.method === "POST") {
      await env.PUSH_KV.delete(SUBSCRIPTION_KEY);
      return json({ ok: true });
    }

    if (url.pathname === "/sync" && request.method === "POST") {
      const body = await request.json();
      const { dateStr } = stockholmParts(new Date());
      const state = {
        lastSyncAt: new Date().toISOString(),
        lastSyncDateStr: dateStr,
        allDoneToday: !!body.allDoneToday,
        lastNagAt: null
      };
      // behåll lastNagAt om det redan finns, så vi inte nollställer tjat-spärren vid varje synk
      const existingRaw = await env.PUSH_KV.get(STATE_KEY);
      if (existingRaw) {
        const existing = JSON.parse(existingRaw);
        state.lastNagAt = existing.lastSyncDateStr === dateStr ? existing.lastNagAt : null;
      }
      await env.PUSH_KV.put(STATE_KEY, JSON.stringify(state));
      return json({ ok: true });
    }

    if (url.pathname === "/" || url.pathname === "") {
      return new Response("Sassibrass push worker is running 🦈", { headers: CORS_HEADERS });
    }

    return json({ error: "not found" }, 404);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(handleScheduled(env));
  }
};
