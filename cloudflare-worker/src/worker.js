import { buildPushPayload } from "@block65/webcrypto-web-push";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const SUBSCRIPTION_KEY = "subscription";
const STATE_KEY = "state";
const HISTORY_PREFIX = "history:";

// Speglar uppgiftslistan i app.js, i samma ordning, så rapporten alltid
// får samma kolumnordning oavsett vilka uppgifter som var aktiva en viss dag.
const REPORT_COLUMNS = [
  { id: "vakna", label: "Vakna och sträck på dig" },
  { id: "sminka", label: "Sminka dig" },
  { id: "kladd", label: "Klä på dig" },
  { id: "har", label: "Fixa håret" },
  { id: "badda", label: "Bädda sängen" },
  { id: "affirmation-rutin", label: "Säg veckans affirmation" },
  { id: "at-frukost", label: "Ät frukost" },
  { id: "drick-vatten", label: "Drick vatten" },
  { id: "drick-kreatin", label: "Drick kreatin" },
  { id: "tander-morgon", label: "Borsta tänderna (morgon)" },
  { id: "matsack", label: "Packa snacks/bars/frukt" },
  { id: "padda-bocker", label: "Ta med padda och böcker" },
  { id: "schema", label: "Kolla schemat" },
  { id: "till-skolan", label: "Ta dig till skolan i tid" },
  { id: "matsopor", label: "Matsopor" },
  { id: "plastsopor", label: "Plastsopor" },
  { id: "metallglas", label: "Metall- och glassopor" },
  { id: "papperkartong", label: "Papper och kartong" },
  { id: "restavfall", label: "Restavfall" },
  { id: "mellanmal", label: "Mellanmål" },
  { id: "tvatten", label: "Gå ner med tvätten" },
  { id: "snygga-rum", label: "Snygga upp rummet" },
  { id: "dammsuga", label: "Dammsuga" },
  { id: "stada-badrum", label: "Städa badrummet" },
  { id: "nedanvaning", label: "Plocka undan grejer nedanvåningen" },
  { id: "laxa", label: "Gör läxan" },
  { id: "kompis", label: "Träffa/prata med kompis" },
  { id: "piano", label: "Piano 10 min" },
  { id: "cheerleading", label: "Cheerleading" },
  { id: "duscha", label: "Duscha" },
  { id: "tvatta-ansikte-kvall", label: "Tvätta ansiktet (kväll)" },
  { id: "tander-kvall", label: "Borsta tänderna (kväll)" },
  { id: "klader-imorgon", label: "Lägg fram kläder" },
  { id: "padda-laddning", label: "Padda på laddning" },
  { id: "tandborste-laddning", label: "Ladda eltandborste" },
  { id: "planera-veckan", label: "Planera kommande vecka" },
  { id: "meditera", label: "Meditera" },
  { id: "dagbok", label: "Skriv dagbok" },
  { id: "las-bok", label: "Läs bok" },
  { id: "lagga-sig", label: "Lägg dig i tid" }
];

const AWAKE_START_MIN = 8 * 60; // 08:00
const AWAKE_END_MIN = 21 * 60 + 30; // 21:30
const NAG_GAP_MS = 4 * 60 * 60 * 1000; // 4 timmar utan aktivitet innan djuret säger till

// Mobilfritt i skolan - "jag är hungrig"-naggandet ska aldrig skickas då,
// hon kan ju inte göra något åt det förrän hon får mobilen tillbaka.
// 1=måndag ... 5=fredag (samma nummerordning som Date.getDay()).
const SCHOOL_BLOCKS = {
  1: [8 * 60 + 30, 14 * 60 + 30], // måndag 08:30-14:30
  2: [8 * 60, 15 * 60], // tisdag 08:00-15:00
  3: [8 * 60, 16 * 60 + 30], // onsdag 08:00-16:30
  4: [8 * 60, 15 * 60 + 30], // torsdag 08:00-15:30
  5: [8 * 60, 13 * 60 + 55] // fredag 08:00-13:55
};

function inSchoolBlock(minutesOfDay, weekday) {
  const block = SCHOOL_BLOCKS[weekday];
  return !!block && minutesOfDay >= block[0] && minutesOfDay < block[1];
}

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
  const dateStr = `${parts.year}-${parts.month}-${parts.day}`;
  return {
    dateStr,
    minutesOfDay: parseInt(parts.hour, 10) * 60 + parseInt(parts.minute, 10),
    weekday: new Date(dateStr + "T12:00:00Z").getUTCDay()
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS }
  });
}

async function mergeHistoryRecord(env, dateStr, patch) {
  const raw = await env.PUSH_KV.get(HISTORY_PREFIX + dateStr);
  const existing = raw ? JSON.parse(raw) : {};
  const merged = { ...existing, ...patch };
  await env.PUSH_KV.put(HISTORY_PREFIX + dateStr, JSON.stringify(merged));
  return merged;
}

async function sendPush(env, message) {
  const subRaw = await env.PUSH_KV.get(SUBSCRIPTION_KEY);
  if (!subRaw) return false;

  try {
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
    if (!res.ok) {
      console.error("sendPush misslyckades", res.status, await res.text().catch(() => ""));
    }
    return res.ok;
  } catch (err) {
    // en trasig prenumeration eller VAPID-miss ska aldrig krascha hela schemat
    console.error("sendPush kastade fel", err && err.message);
    return false;
  }
}

const SCHOOL_END_MESSAGE =
  "Snart slut för idag! Glöm inte packa med dig böckerna hem, och kolla vad som står på listan 📚🎒";

async function handleScheduled(env) {
  try {
    await runScheduledChecks(env);
  } catch (err) {
    // ett enskilt fel ska aldrig tysta hela cron-körningen utan spår
    console.error("handleScheduled kastade fel", err && err.stack);
  }
}

async function runScheduledChecks(env) {
  const now = new Date();
  const { dateStr, minutesOfDay, weekday } = stockholmParts(now);

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
      const message = pick(reminder.messages);
      const delivered = await sendPush(env, message);
      if (delivered) {
        sent.push(reminder.id);
        await env.PUSH_KV.put(sentKey, JSON.stringify(sent), { expirationTtl: 60 * 60 * 48 });
        if (reminder.id === "affirmation") {
          await mergeHistoryRecord(env, dateStr, { affirmationSent: message });
        }
      }
    }
  }

  // --- "Snart slut för idag, glöm inte böckerna" - 30 min innan just den dagens skolslut ---
  const schoolBlock = SCHOOL_BLOCKS[weekday];
  if (schoolBlock) {
    const reminderStart = schoolBlock[1] - 30;
    const withinSchoolEndWindow = minutesOfDay >= reminderStart && minutesOfDay < reminderStart + 15;
    if (withinSchoolEndWindow && !sent.includes("skoldagslut")) {
      const delivered = await sendPush(env, SCHOOL_END_MESSAGE);
      if (delivered) {
        sent.push("skoldagslut");
        await env.PUSH_KV.put(sentKey, JSON.stringify(sent), { expirationTtl: 60 * 60 * 48 });
      }
    }
  }

  // --- "Jag är hungrig"-nagging om hon varit inaktiv länge ---
  if (minutesOfDay < AWAKE_START_MIN || minutesOfDay > AWAKE_END_MIN) return;
  if (inSchoolBlock(minutesOfDay, weekday)) return; // mobilfritt i skolan, inget nag då

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

function csvEscape(value) {
  const s = String(value);
  return /[,"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

async function buildReportCsv(env) {
  const records = {}; // dateStr -> { tasks, allDoneToday }
  let cursor;
  do {
    const page = await env.PUSH_KV.list({ prefix: HISTORY_PREFIX, cursor });
    for (const key of page.keys) {
      const raw = await env.PUSH_KV.get(key.name);
      if (raw) records[key.name.slice(HISTORY_PREFIX.length)] = JSON.parse(raw);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  const dates = Object.keys(records).sort();
  const weekdayNames = ["söndag", "måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag"];

  const header = ["Datum", "Veckodag", ...REPORT_COLUMNS.map((c) => c.label), "Allt klart den dagen", "Veckans affirmation"];
  const rows = [header];

  for (const dateStr of dates) {
    const record = records[dateStr];
    const taskById = Object.fromEntries((record.tasks || []).map((t) => [t.id, t]));
    const weekday = weekdayNames[new Date(dateStr + "T12:00:00Z").getUTCDay()];
    const row = [dateStr, weekday];
    for (const col of REPORT_COLUMNS) {
      const t = taskById[col.id];
      row.push(t ? (t.done ? "Ja" : "Nej") : "–");
    }
    row.push(record.allDoneToday ? "Ja" : "Nej");
    row.push(record.affirmationSent ? record.affirmationSent.replace(/^🌟 Veckans affirmation: /, "") : "");
    rows.push(row);
  }

  const csv = "﻿" + rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");

  return new Response(csv, {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="sassibrass-rapport.csv"'
    }
  });
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

      await mergeHistoryRecord(env, dateStr, {
        tasks: Array.isArray(body.tasks) ? body.tasks : [],
        allDoneToday: !!body.allDoneToday,
        updatedAt: new Date().toISOString()
      });

      return json({ ok: true });
    }

    if (url.pathname === "/report" && request.method === "GET") {
      return buildReportCsv(env);
    }

    if (url.pathname === "/admin/clear-history" && request.method === "GET") {
      let cleared = 0;
      let cursor;
      do {
        const page = await env.PUSH_KV.list({ prefix: HISTORY_PREFIX, cursor });
        for (const key of page.keys) {
          await env.PUSH_KV.delete(key.name);
          cleared++;
        }
        cursor = page.list_complete ? undefined : page.cursor;
      } while (cursor);
      return new Response(`Rensade ${cleared} dagar med historik. Klart! 🧹`, { headers: CORS_HEADERS });
    }

    if (url.pathname === "/admin/status" && request.method === "GET") {
      const subRaw = await env.PUSH_KV.get(SUBSCRIPTION_KEY);
      const stateRaw = await env.PUSH_KV.get(STATE_KEY);
      const { dateStr, minutesOfDay, weekday } = stockholmParts(new Date());
      const todayKey = `reminders:${dateStr}`;
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const yesterdayKey = `reminders:${stockholmParts(yesterday).dateStr}`;
      const sentToday = await env.PUSH_KV.get(todayKey);
      const sentYesterday = await env.PUSH_KV.get(yesterdayKey);

      const lines = [
        "=== Sassibrass push-status ===",
        "",
        `Push-prenumeration finns: ${subRaw ? "JA ✅" : "NEJ ❌ (klockan 🔔 är inte aktiverad på någon enhet just nu)"}`,
        "",
        `Workerns nuvarande tid (svensk lokaltid): ${String(Math.floor(minutesOfDay / 60)).padStart(2, "0")}:${String(minutesOfDay % 60).padStart(2, "0")}, veckodag ${weekday}`,
        "",
        `Notiser skickade idag (${dateStr}): ${sentToday || "inga än"}`,
        `Notiser skickade igår: ${sentYesterday || "inga"}`,
        "",
        `Sync-status (app-aktivitet): ${stateRaw || "appen har aldrig synkat"}`
      ];
      return new Response(lines.join("\n"), { headers: { ...CORS_HEADERS, "Content-Type": "text/plain; charset=utf-8" } });
    }

    if (url.pathname === "/admin/send-test" && request.method === "GET") {
      const ok = await sendPush(env, "Testnotis från Sassibrass! Om du ser den här funkar allt precis som det ska 🦈✅");
      return new Response(
        ok ? "Skickad! Kolla telefonen. 📬" : "Misslyckades, troligen finns ingen aktiv prenumeration just nu (klockan 🔔 inte påslagen).",
        { headers: CORS_HEADERS }
      );
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
