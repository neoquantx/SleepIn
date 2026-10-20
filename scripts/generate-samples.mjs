// Generates the demo chat exports in public/samples/.
// Deterministic (seeded) so the committed files are reproducible:
//   node scripts/generate-samples.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "samples");
mkdirSync(OUT, { recursive: true });

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const at = (day, h, m, s = 0) => new Date(2026, 9, day, h, m, s);
const pad = (n) => String(n).padStart(2, "0");

/** Spreads `count` noise messages over [start, end], denser in the evening and early morning. */
function noiseTimes(rand, count, start, end) {
  const times = [];
  while (times.length < count) {
    const t = start.getTime() + rand() * (end.getTime() - start.getTime());
    const hour = new Date(t).getHours();
    const sleepy = hour >= 2 && hour < 6;
    if (sleepy && rand() > 0.12) continue;
    times.push(new Date(t));
  }
  return times;
}

function weave(rand, keyMessages, pools, count, start, end) {
  const noise = noiseTimes(rand, count, start, end).map((time) => {
    const [sender, lines] = pools[Math.floor(rand() * pools.length)];
    return { time, sender, text: lines[Math.floor(rand() * lines.length)] };
  });
  return [...keyMessages, ...noise].sort((a, b) => a.time - b.time);
}

// ---------------------------------------------------------------------------
// 1. WhatsApp (Android format): family group — mom wants a call.
// ---------------------------------------------------------------------------
{
  const rand = mulberry32(19);
  const key = [
    { time: at(19, 9, 12), sender: "Neha Didi", text: "Reached Pune safely 🙏" },
    { time: at(19, 9, 15), sender: "Mom", text: "Good. Eat something proper, not maggi" },
    { time: at(19, 21, 3), sender: "Papa", text: "Dev's phone is on silent again I think" },
    {
      time: at(20, 6, 52),
      sender: "Mom",
      text: "Dev beta call me when you wake up. It's about Nani's visit, need to decide dates",
    },
    { time: at(20, 6, 53), sender: "Mom", text: "Not urgent-urgent but call before 11, I have to tell Mama ji" },
    { time: at(20, 7, 18), sender: "Papa", text: "Let him sleep 😂 he will call" },
    { time: at(20, 7, 21), sender: "Mom", text: "Dev??" },
    {
      time: at(19, 22, 40),
      sender: "Sunita Aunty",
      text: "Methi thepla recipe as promised:\n2 cups atta, 1 cup methi\nAjwain, haldi, chilli, curd\nKnead soft, rest 15 min, roast with ghee",
    },
  ];
  const pools = [
    ["Mom", ["Good morning 🌞🙏", "Very nice 👍", "Jai Shri Krishna 🙏", "<Media omitted>", "Haha", "Who made this? So cute 😍", "Everyone drink water, weather is very dry"]],
    ["Papa", ["Good morning all", "<Media omitted>", "Forwarded as received.", "👍", "India will win this series, mark my words", "Ok"]],
    ["Chachaji", ["<Media omitted>", "Drinking warm water with lemon cures 99% of diseases. Doctors don't want you to know!!", "This is 100% true news, my friend's cousin works at NASA", "Good night ji 🌙", "Share with 10 groups for good luck 🍀", "Jai Hind 🇮🇳"]],
    ["Sunita Aunty", ["Beautiful pic 😍", "So sweet 🥰", "<Media omitted>", "Haha 😂😂", "Good morning everyone, have a blessed day 🌸", "Yes yes"]],
    ["Neha Didi", ["Chachaji this is fake 😭", "lol", "<Media omitted>", "Please stop forwarding these", "😂😂😂", "Mom can you send the pic again"]],
  ];
  const msgs = weave(rand, key, pools, 150, at(19, 19, 50), at(20, 7, 40));
  const fmt = (d) =>
    `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const lines = [
    `${fmt(at(19, 8, 0))} - Messages and calls are end-to-end encrypted. Only people in this chat can read, listen to, or share them. Learn more.`,
    `${fmt(at(19, 8, 1))} - Chachaji added Sunita Aunty`,
    ...msgs.map((m) => `${fmt(m.time)} - ${m.sender}: ${m.text}`),
  ];
  writeFileSync(join(OUT, "WhatsApp Chat with Sharma Family.txt"), lines.join("\n") + "\n");
}

// ---------------------------------------------------------------------------
// 2. WhatsApp (iOS format): friends group — Rahul's birthday moves to Saturday.
// ---------------------------------------------------------------------------
{
  const rand = mulberry32(7);
  const key = [
    { time: at(18, 16, 5), sender: "Priya", text: "Okay final: Rahul's bday Friday 8pm at Arbor 🎉" },
    { time: at(18, 16, 9), sender: "Kabir", text: "Done, blocking my calendar" },
    { time: at(19, 23, 41, 7), sender: "Rahul", text: "Guys change of plans 🙈 my parents are visiting Friday" },
    { time: at(19, 23, 41, 52), sender: "Rahul", text: "Birthday moved to Saturday instead. Same time?" },
    { time: at(19, 23, 44, 10), sender: "Priya", text: "Saturday works! Arbor or Toit?" },
    { time: at(19, 23, 58, 31), sender: "Rahul", text: "Saturday 8pm, Toit Indiranagar. Final final 🙏" },
    { time: at(20, 0, 2, 3), sender: "Ananya", text: "I'll handle the gift, will share the split later, no rush" },
    { time: at(20, 0, 5, 44), sender: "Arjun", text: "Dev will be asleep obviously 😴 someone tell him" },
  ];
  const pools = [
    ["Rahul", ["lmaooo", "bro 😭", "\u200esticker omitted", "who's bringing the speaker", "I'm not old ok", "😂😂", "\u200eimage omitted"]],
    ["Priya", ["Toit has better food tbh", "Arbor music is better though", "\u200eimage omitted", "ok but who's booking", "haha", "guys focus", "🎂🎂🎂"]],
    ["Kabir", ["\u200esticker omitted", "brb charging phone", "did anyone watch the match??", "Kohli 🐐", "bro that last over 😭", "lol", "\u200eGIF omitted"]],
    ["Ananya", ["omg", "can we do a cake from Glen's", "\u200eimage omitted", "hahahaha", "that meme 💀", "send the reel again"]],
    ["Arjun", ["\u200evideo omitted", "first", "Toit Toit Toit", "I'm voting Arbor just to be annoying", "😂", "who changed the group icon"]],
  ];
  const msgs = weave(rand, key, pools, 190, at(19, 19, 55), at(20, 7, 30));
  const fmt = (d) => {
    const h12 = d.getHours() % 12 === 0 ? 12 : d.getHours() % 12;
    const ampm = d.getHours() < 12 ? "AM" : "PM";
    return `[${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}, ${h12}:${pad(d.getMinutes())}:${pad(d.getSeconds())}\u202f${ampm}]`;
  };
  const lines = [
    `${fmt(at(1, 10, 0))} Rahul Bday Squad 🎂: \u200eMessages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.`,
    ...msgs.map((m) => `${fmt(m.time)} ${m.sender}: ${m.text}`),
  ];
  writeFileSync(join(OUT, "WhatsApp Chat - Rahul Bday Squad.txt"), lines.join("\n") + "\n");
}

// ---------------------------------------------------------------------------
// 3. Telegram (Desktop JSON export): apartment society — noise, one thing for later.
// ---------------------------------------------------------------------------
{
  const rand = mulberry32(42);
  const key = [
    {
      time: at(19, 20, 30),
      sender: "Secretary – Lakeside",
      text: [
        { type: "bold", text: "Notice:" },
        " Water tank cleaning on Thursday, 10am–2pm. Please store water the night before.",
      ],
    },
    { time: at(19, 21, 10), sender: "Deepa (C-303)", text: "Found a grey cat near B block, very friendly. Whose is it?" },
    { time: at(19, 21, 48), sender: "Farhan (A-101)", text: "That's Biscuit! Ours. Coming down now, thank you 🙏" },
  ];
  const pools = [
    ["Mr. Iyer (B-402)", ["Whose car is KA-03-MX-4411? It is parked in the visitor slot AGAIN", "This is the third time this week", "Please follow the rules, we are educated people", "Agreed 👍", "I will raise this in the AGM"]],
    ["Kavita Rao", ["+1", "Can we please keep this group for important things only", "Diwali committee meeting is Sunday 6pm in clubhouse, volunteers welcome", "Lift in B block is making noise again", "Agreed"]],
    ["Farhan (A-101)", ["Sorry, that was my guest's car, moving it", "👍", "Anyone has a drill machine to lend?", "Thanks all"]],
    ["Deepa (C-303)", ["Lost & found: blue umbrella near the gym", "Good morning neighbours ☀️", "Can we get more lights near the park? It's very dark", "🙏"]],
    ["Security Desk", ["Amazon delivery for C-303 kept at gate", "Swiggy delivery for B-402 at gate", "Visitor parking full", "Garbage collection at 7am tomorrow"]],
  ];
  const msgs = weave(rand, key, pools, 165, at(19, 19, 45), at(20, 7, 45));
  const iso = (d) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

  let id = 4100;
  const messages = [
    {
      id: id++,
      type: "service",
      date: iso(at(19, 19, 40)),
      date_unixtime: String(Math.floor(at(19, 19, 40).getTime() / 1000)),
      actor: "Secretary – Lakeside",
      actor_id: "user1001",
      action: "pin_message",
      text: "",
      text_entities: [],
    },
    ...msgs.map((m, i) => {
      const base = {
        id: id++,
        type: "message",
        date: iso(m.time),
        date_unixtime: String(Math.floor(m.time.getTime() / 1000)),
        from: m.sender,
        from_id: `user${1000 + (m.sender.length * 37) % 900}`,
      };
      if (i % 23 === 5) {
        return {
          ...base,
          file: "(File not included. Change data exporting settings to download.)",
          media_type: "sticker",
          sticker_emoji: "👍",
          text: "",
          text_entities: [],
        };
      }
      if (i % 31 === 9) {
        return { ...base, photo: `photos/photo_${i}@19-10-2026.jpg`, width: 1280, height: 960, text: "", text_entities: [] };
      }
      const textEntities = Array.isArray(m.text)
        ? m.text.map((p) => (typeof p === "string" ? { type: "plain", text: p } : p))
        : [{ type: "plain", text: m.text }];
      return { ...base, text: m.text, text_entities: textEntities };
    }),
  ];

  const exportJson = { name: "Prestige Lakeside Residents", type: "private_supergroup", id: 1789234567, messages };
  writeFileSync(join(OUT, "telegram-lakeside-residents.json"), JSON.stringify(exportJson, null, 1) + "\n");
}

console.log(`Samples written to ${OUT}`);
