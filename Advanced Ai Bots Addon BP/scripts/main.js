/**
 * Advanced Ai Bots – Brain, Emotions & Order System
 *
 * Features
 * ─────────
 * • Groq AI brain – real LLM responses via @minecraft/server-net (BDS only).
 *   Falls back to a rich local brain on regular Minecraft / Realms.
 * • 8-emotion system: happy, excited, tired, scared, determined, curious, sad, angry
 * • Emotions change over time and with game events; shown in chat + name-tag prefix
 * • Natural-language chat detection – just type "mine", "farm", "hunt", "build" etc.
 * • Mine ores → deposit drops into home chest
 * • Farm crops → harvest, replant, deposit into home chest
 * • Collect food items from the ground → deposit into home chest
 * • Home-chest system: type "set home" while near a chest to register it
 * • Build a wooden house block-by-block at bot's feet
 * • Trade with nearest villager (brings back emeralds)
 * • Guard / Hunt / Follow / Idle modes via vanilla entity AI components
 * • Full-UI order menu (right-click bot)
 * • Groq API key stored safely in world dynamic properties (never in code):
 *     .bot setkey <YOUR_GROQ_KEY>
 *
 * @minecraft/server-net is BDS-only. On regular Minecraft the script still
 * loads and runs; Groq calls silently fall back to local responses.
 */

import * as mc from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";

// Try to import server-net (available on BDS only).
// We wrap the actual usage in a helper so a missing module
// doesn't crash the rest of the addon on non-BDS environments.
let _http = null;
let _HttpRequest = null;
let _HttpRequestMethod = null;
let _HttpHeader = null;
try {
  const net = await import("@minecraft/server-net");
  _http           = net.http;
  _HttpRequest    = net.HttpRequest;
  _HttpRequestMethod = net.HttpRequestMethod;
  _HttpHeader     = net.HttpHeader;
} catch (_) {
  // Not on BDS – Groq calls will use the local brain fallback
}

// ─────────────────────────────────────────────────────────────────────────────
// Dynamic-property registration (world-level)
// ─────────────────────────────────────────────────────────────────────────────

mc.world.beforeEvents.worldInitialize.subscribe(({ propertyRegistry }) => {
  propertyRegistry.registerWorldDynamicProperty("groq_api_key", String);
});

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const BOT_TYPES = ["pa:player", "pa:player2"];
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL   = "llama3-8b-8192";
const GROQ_MAX_TOKENS = 120;

const MODE = {
  IDLE:    "idle",
  HUNT:    "hunt",
  MINE:    "mine",
  BUILD:   "build",
  TRADE:   "trade",
  GUARD:   "guard",
  FOLLOW:  "follow",
  FARM:    "farm",
  COLLECT: "collect",
};

const EMOTION = {
  HAPPY:       "happy",
  EXCITED:     "excited",
  TIRED:       "tired",
  SCARED:      "scared",
  DETERMINED:  "determined",
  CURIOUS:     "curious",
  SAD:         "sad",
  ANGRY:       "angry",
};

const EMOTION_EMOJI = {
  happy: "😊", excited: "🎉", tired: "😴", scared: "��",
  determined: "💪", curious: "🔍", sad: "😢", angry: "😤",
};

// Items that ore blocks drop when mined
const ORE_DROPS = {
  "minecraft:coal_ore":              { item: "minecraft:coal",          count: 1 },
  "minecraft:deepslate_coal_ore":    { item: "minecraft:coal",          count: 1 },
  "minecraft:iron_ore":              { item: "minecraft:raw_iron",       count: 1 },
  "minecraft:deepslate_iron_ore":    { item: "minecraft:raw_iron",       count: 1 },
  "minecraft:gold_ore":              { item: "minecraft:raw_gold",       count: 1 },
  "minecraft:deepslate_gold_ore":    { item: "minecraft:raw_gold",       count: 1 },
  "minecraft:diamond_ore":           { item: "minecraft:diamond",        count: 1 },
  "minecraft:deepslate_diamond_ore": { item: "minecraft:diamond",        count: 1 },
  "minecraft:emerald_ore":           { item: "minecraft:emerald",        count: 1 },
  "minecraft:deepslate_emerald_ore": { item: "minecraft:emerald",        count: 1 },
  "minecraft:lapis_ore":             { item: "minecraft:lapis_lazuli",   count: 6 },
  "minecraft:deepslate_lapis_ore":   { item: "minecraft:lapis_lazuli",   count: 6 },
  "minecraft:redstone_ore":          { item: "minecraft:redstone",       count: 5 },
  "minecraft:deepslate_redstone_ore":{ item: "minecraft:redstone",       count: 5 },
  "minecraft:copper_ore":            { item: "minecraft:raw_copper",     count: 2 },
  "minecraft:deepslate_copper_ore":  { item: "minecraft:raw_copper",     count: 2 },
  "minecraft:nether_gold_ore":       { item: "minecraft:gold_nugget",    count: 5 },
  "minecraft:nether_quartz_ore":     { item: "minecraft:quartz",         count: 1 },
  "minecraft:ancient_debris":        { item: "minecraft:ancient_debris", count: 1 },
};

// Fully-grown crops: typeId → { drop, seed, growthKey, maxGrowth }
const CROPS = {
  "minecraft:wheat":      { drop: "minecraft:wheat",          count: 1, seed: "minecraft:wheat_seeds",    growthKey: "growth",          max: 7 },
  "minecraft:carrots":    { drop: "minecraft:carrot",         count: 2, seed: "minecraft:carrot",         growthKey: "growth",          max: 7 },
  "minecraft:potatoes":   { drop: "minecraft:potato",         count: 2, seed: "minecraft:potato",         growthKey: "growth",          max: 7 },
  "minecraft:beetroots":  { drop: "minecraft:beetroot",       count: 1, seed: "minecraft:beetroot_seeds", growthKey: "growth",          max: 3 },
  "minecraft:nether_wart":{ drop: "minecraft:nether_wart",    count: 2, seed: "minecraft:nether_wart",    growthKey: "age",             max: 3 },
};

// Food items the bot will pick up from the ground in COLLECT mode
const FOOD_ITEMS = new Set([
  "minecraft:apple", "minecraft:bread", "minecraft:cooked_beef", "minecraft:cooked_chicken",
  "minecraft:cooked_porkchop", "minecraft:cooked_rabbit", "minecraft:cooked_salmon",
  "minecraft:cooked_mutton", "minecraft:cooked_cod", "minecraft:golden_apple",
  "minecraft:enchanted_golden_apple", "minecraft:pumpkin_pie", "minecraft:cookie",
  "minecraft:melon_slice", "minecraft:sweet_berries", "minecraft:glow_berries",
  "minecraft:wheat", "minecraft:carrot", "minecraft:potato", "minecraft:beetroot",
  "minecraft:mushroom_stew", "minecraft:rabbit_stew", "minecraft:suspicious_stew",
]);

// Simple 7×5×7 house blueprint (offsets from build origin)
const HOUSE_BLUEPRINT = (() => {
  const W = 7, H = 5, D = 7;
  const blocks = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      for (let z = 0; z < D; z++) {
        const isDoor  = y <= 1 && x === 3 && z === 0;
        const isFloor = y === 0;
        const isRoof  = y === H - 1;
        const isWall  = x === 0 || x === W - 1 || z === 0 || z === D - 1;
        if (isDoor) continue;
        if (isFloor)      blocks.push({ x, y, z, b: "minecraft:oak_planks" });
        else if (isRoof)  blocks.push({ x, y, z, b: "minecraft:oak_slab" });
        else if (isWall)  blocks.push({ x, y, z, b: "minecraft:oak_log" });
      }
    }
  }
  // Furnishings
  blocks.push({ x: 3, y: 1, z: 3, b: "minecraft:torch" });
  blocks.push({ x: 1, y: 1, z: 1, b: "minecraft:crafting_table" });
  blocks.push({ x: 5, y: 1, z: 1, b: "minecraft:chest" });
  blocks.push({ x: 1, y: 1, z: 5, b: "minecraft:red_bed" });
  blocks.push({ x: 5, y: 1, z: 5, b: "minecraft:furnace" });
  return blocks;
})();

// ─────────────────────────────────────────────────────────────────────────────
// Natural-language command patterns
// ─────────────────────────────────────────────────────────────────────────────

const CHAT_PATTERNS = [
  { re: /\bmine\b|\bdig\b|\bores?\b|\bmining\b|\bget ore\b/i,                        mode: MODE.MINE    },
  { re: /\bfarm\b|\bharve?st\b|\bgrow\b|\bplant\b|\bcrops?\b|\bwheat\b|\bcarrot\b|\bpotato\b/i, mode: MODE.FARM  },
  { re: /\bcollect food\b|\bget food\b|\bgather food\b|\bfood\b|\bfetch food\b/i,    mode: MODE.COLLECT },
  { re: /\bhunt\b|\bfight\b|\bkill mobs?\b|\battack\b|\beliminate\b/i,               mode: MODE.HUNT    },
  { re: /\bguard\b|\bprotect\b|\bdefend\b|\bstay close\b/i,                          mode: MODE.GUARD   },
  { re: /\bfollow\b|\bcome here\b|\bcome with me\b|\bfollow me\b/i,                  mode: MODE.FOLLOW  },
  { re: /\bbuild\b|\bhouse\b|\bmake home\b|\bconstruct\b/i,                          mode: MODE.BUILD   },
  { re: /\btrade\b|\bvillager\b|\bsell\b|\bbuy\b/i,                                  mode: MODE.TRADE   },
  { re: /\bstop\b|\bidle\b|\bwait\b|\brest\b|\bstand by\b|\brelax\b|\bdo nothing\b/i, mode: MODE.IDLE  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Bot runtime state  (botId → object)
// ─────────────────────────────────────────────────────────────────────────────

const botState   = new Map();   // job tick data
const botEmotion = new Map();   // { emotion, ticks, taskTicks, hitsReceived }
const botMemory  = new Map();   // last 6 chat exchanges per bot

function getState(bot) {
  if (!botState.has(bot.id)) {
    botState.set(bot.id, {
      tick: 0, busy: false,
      buildIndex: 0, buildOrigin: null,
      tradeTraded: false, tradeMoving: false,
      oreCount: 0, cropCount: 0, foodCount: 0,
    });
  }
  return botState.get(bot.id);
}

function getEmotion(bot) {
  if (!botEmotion.has(bot.id)) {
    botEmotion.set(bot.id, { emotion: EMOTION.HAPPY, ticks: 0, taskTicks: 0, hitsReceived: 0 });
  }
  return botEmotion.get(bot.id);
}

function setEmotion(bot, emotion) {
  const e = getEmotion(bot);
  e.emotion = emotion;
  e.ticks   = 0;
  updateNameTag(bot);
}

function updateNameTag(bot) {
  const base    = getTag(bot, "pa_basename") ?? (bot.nameTag?.replace(/^.+ /, "") ?? "Bot");
  const emo     = getEmotion(bot).emotion;
  const emoji   = EMOTION_EMOJI[emo] ?? "🤖";
  bot.nameTag = `${emoji} ${base}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tag helpers
// ─────────────────────────────────────────────────────────────────────────────

function getTag(entity, key) {
  for (const t of entity.getTags()) {
    if (t.startsWith(key + "=")) return t.slice(key.length + 1);
  }
  return null;
}

function setTag(entity, key, value) {
  for (const t of entity.getTags()) {
    if (t.startsWith(key + "=")) entity.removeTag(t);
  }
  entity.addTag(`${key}=${value}`);
}

function getMode(bot)       { return getTag(bot, "pa_mode") ?? MODE.IDLE; }

function setMode(bot, mode) {
  setTag(bot, "pa_mode", mode);
  try { bot.triggerEvent(`pa:set_mode_${mode}`); } catch (_) {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Groq AI brain
// ─────────────────────────────────────────────────────────────────────────────

/** Build the Groq system prompt that defines the bot's personality. */
function buildSystemPrompt(botName, personality, emotion, mode) {
  return (
    `You are ${botName}, a friendly Minecraft NPC companion bot. ` +
    `Your personality is: ${personality}. ` +
    `Your current emotion is: ${emotion}. ` +
    `Your current task is: ${mode}. ` +
    `You care about your owner and want to help them. ` +
    `Reply in 1-2 sentences, staying in character as a Minecraft bot. ` +
    `Start your reply with [EMOTION:<one of happy/excited/tired/scared/determined/curious/sad/angry>] ` +
    `then your message. Example: [EMOTION:excited] Found diamonds! Grabbing them now!`
  );
}

/** Call Groq API. Returns { emotion, text } or null if unavailable. */
async function callGroq(botName, personality, emotion, mode, playerMessage) {
  if (!_http || !_HttpRequest || !_HttpRequestMethod || !_HttpHeader) return null;

  const apiKey = mc.world.getDynamicProperty("groq_api_key");
  if (!apiKey) return null;

  try {
    const history = botMemory.get(botName) ?? [];
    const messages = [
      { role: "system", content: buildSystemPrompt(botName, personality, emotion, mode) },
      ...history.slice(-4),
      { role: "user", content: playerMessage },
    ];

    const req = new _HttpRequest(GROQ_API_URL);
    req.method = _HttpRequestMethod.Post;
    req.headers = [
      new _HttpHeader("Content-Type", "application/json"),
      new _HttpHeader("Authorization", `Bearer ${apiKey}`),
    ];
    req.body = JSON.stringify({
      model:       GROQ_MODEL,
      messages,
      temperature: 0.85,
      max_tokens:  GROQ_MAX_TOKENS,
    });

    const res  = await _http.request(req);
    const data = JSON.parse(res.body);
    const raw  = data?.choices?.[0]?.message?.content ?? "";

    // Update conversation memory
    history.push({ role: "user",      content: playerMessage });
    history.push({ role: "assistant", content: raw });
    botMemory.set(botName, history.slice(-8));

    // Parse [EMOTION:xxx]
    const emoMatch = raw.match(/\[EMOTION:(\w+)\]/i);
    const parsedEmotion = emoMatch ? emoMatch[1].toLowerCase() : null;
    const text = raw.replace(/\[EMOTION:\w+\]\s*/i, "").trim();

    return { emotion: parsedEmotion, text };
  } catch (_) {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LOCAL AI BRAIN — rich fallback (works on all platforms)
// ─────────────────────────────────────────────────────────────────────────────

const LOCAL_RESPONSES = {
  mine: {
    start:     ["Off to find ores! I'll put everything in the chest.", "Mining time! Watch me work!", "I love mining — let's see what I can dig up!"],
    found:     ["Found some {ore}! Going for it!", "Ooh, {ore}! That's a good one!", "Score — {ore} incoming!"],
    deposited: ["Dropped everything in your chest!", "Your chest is looking richer!", "All stored safely."],
    none:      ["No ores nearby... should we go deeper?", "This area seems dry. Maybe check underground?"],
  },
  farm: {
    start:     ["Time to tend the fields! I'll store the harvest.", "Farming mode! Fresh food coming right up.", "I love farming — so peaceful out here."],
    harvest:   ["Harvested some {crop}! Replanting now.", "Nice yield of {crop}!", "Fresh {crop} for the chest!"],
    deposited: ["Crops are in the chest!", "Harvest stored!", "All tucked away for you."],
    none:      ["Nothing's ready yet... I'll keep an eye on it.", "The fields need more time to grow."],
  },
  collect: {
    start:     ["I'll gather up the food lying around!", "Food collection time — nothing goes to waste!", "On it! Picking up everything edible."],
    found:     ["Grabbed some {food}!", "Found {food} on the ground!", "Snagged {food}!"],
    deposited: ["All the food's in the chest!", "Stocked the chest with food.", "Done collecting!"],
    none:      ["No food items on the ground nearby.", "Area's clean — nothing to collect."],
  },
  hunt: {
    start:     ["Time to fight! Nobody threatens my owner!", "Engaging hostiles! Stay back!", "I'll clear out those mobs!"],
    kill:      ["Got one! {mob} down.", "{mob} eliminated!", "Cleared a {mob}!"],
    danger:    ["Watch out — hostile mob nearby!", "I see a threat! Engaging!", "Stay back, I'll handle this!"],
    clear:     ["Area is clear! Standing watch.", "All hostiles gone. Staying alert.", "Nice and safe now!"],
  },
  build: {
    start:     ["Construction starting! Stand back!", "I'll build you a cozy home right here!", "Let's get building — this'll be great!"],
    progress:  ["Building... {pct}% done!", "Coming along nicely — {pct}% complete!", "Almost there, {pct}% done!"],
    done:      ["Your home is ready! I added a bed, chest, and furnace!", "Construction complete! Come take a look!", "Done! I even put a crafting table inside!"],
  },
  trade: {
    start:     ["Going to find a villager to trade with!", "Trading run! I'll bring back emeralds.", "On my way to negotiate some deals!"],
    going:     ["Heading to the villager...", "Almost there..."],
    done:      ["Traded successfully! Check your inventory — I got emeralds!", "Deal done! Got you some emeralds.", "The villager drove a hard bargain, but I got emeralds!"],
    none:      ["No villagers around... maybe we need to find a village?"],
  },
  guard: {
    start:     ["Guard mode activated! I'll stick close and protect you.", "Nobody gets past me while I'm on guard!", "Staying by your side. Any threats — I'll handle them."],
  },
  follow: {
    start:     ["Right behind you! Lead the way.", "On your heels!", "I'll keep up — just keep moving!"],
  },
  idle: {
    start:     ["Taking a breather. Call me if you need anything!", "Relaxing... this is nice.", "I'll wait here. Just say the word!"],
  },
  chat: {
    greeting:  ["Hey! Good to see you!", "Hi there! Ready for adventure?", "Hello! What are we doing today?"],
    thanks:    ["Anytime! That's what I'm here for.", "Happy to help — always!", "Of course! Always glad to assist."],
    praise:    ["Aw, thanks! That means a lot!", "You're the best owner ever!", "That makes me so happy!"],
    sad:       ["Aww... don't be sad. I'm here for you!", "Everything will be okay. I've got your back.", "Cheer up! We can fix this."],
    hurt:      ["Ouch! That really stings...", "Ow! I'll shake it off.", "That hurt! I'm okay though."],
    bored:     ["Getting a bit restless over here...", "I wonder what's out there...", "Nothing to do... I could use a task!"],
    generic:   ["Interesting! Tell me more.", "Hmm, I hadn't thought of that.", "You know, I was thinking the same thing!", "Good point! Let's do it.", "Leave it to me!"],
  },
  sethome: ["Got it! I'll bring everything to that chest.", "Home chest registered! All my drops go there.", "Perfect spot for a chest — noted!"],
};

/** Pick a random item from an array. */
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/** Build a response from the local brain given context. */
function localBrainResponse(bot, playerMessage) {
  const mode     = getMode(bot);
  const emotion  = getEmotion(bot).emotion;
  const msg      = playerMessage.toLowerCase();

  // Detect emotional cues in player message
  if (/\bthank(s| you)\b/.test(msg)) return { emotion: EMOTION.HAPPY,    text: pick(LOCAL_RESPONSES.chat.thanks) };
  if (/\bgood\b|\bnice\b|\bgreat\b|\bamazing\b|\bbest\b|\bawesome\b/.test(msg)) return { emotion: EMOTION.HAPPY, text: pick(LOCAL_RESPONSES.chat.praise) };
  if (/\bhello\b|\bhi\b|\bhey\b/.test(msg)) return { emotion: EMOTION.HAPPY, text: pick(LOCAL_RESPONSES.chat.greeting) };
  if (/\bsad\b|\bupset\b|\bcry\b|\bdepressed\b/.test(msg)) return { emotion: EMOTION.SAD, text: pick(LOCAL_RESPONSES.chat.sad) };

  // Context-aware reply
  const modeMap = {
    [MODE.MINE]:    { emotion: EMOTION.DETERMINED, text: pick(LOCAL_RESPONSES.mine.deposited) },
    [MODE.FARM]:    { emotion: EMOTION.HAPPY,      text: pick(LOCAL_RESPONSES.farm.deposited) },
    [MODE.COLLECT]: { emotion: EMOTION.HAPPY,      text: pick(LOCAL_RESPONSES.collect.deposited) },
    [MODE.HUNT]:    { emotion: EMOTION.DETERMINED, text: pick(LOCAL_RESPONSES.hunt.clear) },
    [MODE.BUILD]:   { emotion: EMOTION.EXCITED,    text: pick(LOCAL_RESPONSES.build.start) },
    [MODE.TRADE]:   { emotion: EMOTION.EXCITED,    text: pick(LOCAL_RESPONSES.trade.going) },
    [MODE.GUARD]:   { emotion: EMOTION.DETERMINED, text: pick(LOCAL_RESPONSES.guard.start) },
    [MODE.FOLLOW]:  { emotion: EMOTION.HAPPY,      text: pick(LOCAL_RESPONSES.follow.start) },
    [MODE.IDLE]:    { emotion: EMOTION.CURIOUS,    text: pick(LOCAL_RESPONSES.idle.start) },
  };
  return modeMap[mode] ?? { emotion: EMOTION.CURIOUS, text: pick(LOCAL_RESPONSES.chat.generic) };
}

/** Main entry: respond to player chat. Uses Groq if available, else local brain. */
async function botRespondToChat(bot, playerMessage) {
  const name        = getTag(bot, "pa_basename") ?? "Bot";
  const personality = getTag(bot, "pa_personality") ?? "adventurous and cheerful";
  const emoData     = getEmotion(bot);
  const mode        = getMode(bot);

  let result = null;

  // Try Groq first
  result = await callGroq(name, personality, emoData.emotion, mode, playerMessage);

  // Fall back to local brain
  if (!result) result = localBrainResponse(bot, playerMessage);

  if (result.emotion && Object.values(EMOTION).includes(result.emotion)) {
    setEmotion(bot, result.emotion);
  }

  botSay(bot, result.text);
}

// ─────────────────────────────────────────────────────────────────────────────
// Emotion tick: update emotion based on elapsed time and game state
// ─────────────────────────────────────────────────────────────────────────────

function tickEmotion(bot) {
  const e    = getEmotion(bot);
  const mode = getMode(bot);
  e.ticks++;
  e.taskTicks = (e.taskTicks ?? 0) + 1;

  // Health-based fear
  try {
    const health = bot.getComponent("minecraft:health");
    if (health && health.currentValue < 10) {
      if (e.emotion !== EMOTION.SCARED) setEmotion(bot, EMOTION.SCARED);
      return;
    }
  } catch (_) {}

  // Task-based emotions
  if (e.taskTicks < 200) return; // Don't shift emotion too fast

  const taskEmotions = {
    [MODE.MINE]:    e.taskTicks > 1200 ? EMOTION.TIRED    : EMOTION.DETERMINED,
    [MODE.FARM]:    e.taskTicks > 1200 ? EMOTION.TIRED    : EMOTION.HAPPY,
    [MODE.COLLECT]: EMOTION.HAPPY,
    [MODE.HUNT]:    EMOTION.ANGRY,
    [MODE.GUARD]:   EMOTION.DETERMINED,
    [MODE.BUILD]:   e.taskTicks > 2400 ? EMOTION.TIRED    : EMOTION.EXCITED,
    [MODE.TRADE]:   EMOTION.EXCITED,
    [MODE.FOLLOW]:  EMOTION.HAPPY,
    [MODE.IDLE]:    e.taskTicks > 2400 ? EMOTION.CURIOUS  : EMOTION.HAPPY,
  };

  const target = taskEmotions[mode] ?? EMOTION.HAPPY;
  if (e.emotion !== target) {
    setEmotion(bot, target);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Home-chest helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Get the home-chest location stored on a bot. Returns { x,y,z } or null. */
function getHomeChest(bot) {
  const x = getTag(bot, "home_x");
  const y = getTag(bot, "home_y");
  const z = getTag(bot, "home_z");
  if (x === null || y === null || z === null) return null;
  return { x: parseInt(x), y: parseInt(y), z: parseInt(z) };
}

/** Set the home-chest location on a bot. */
function setHomeChest(bot, loc) {
  setTag(bot, "home_x", String(Math.floor(loc.x)));
  setTag(bot, "home_y", String(Math.floor(loc.y)));
  setTag(bot, "home_z", String(Math.floor(loc.z)));
}

/** Find the nearest chest within radius blocks of origin. */
function findNearestChest(dimension, origin, radius) {
  const ox = Math.floor(origin.x), oy = Math.floor(origin.y), oz = Math.floor(origin.z);
  for (let r = 0; r <= radius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -3; dy <= 3; dy++) {
        for (let dz = -r; dz <= r; dz++) {
          if (r > 0 && Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          try {
            const loc = { x: ox + dx, y: oy + dy, z: oz + dz };
            const b = dimension.getBlock(loc);
            if (b && (b.typeId === "minecraft:chest" || b.typeId === "minecraft:trapped_chest")) {
              return { block: b, location: loc };
            }
          } catch (_) {}
        }
      }
    }
  }
  return null;
}

/** Put items into a chest at the given location. Returns true if succeeded. */
function depositToChest(dimension, chestLoc, item, count) {
  try {
    const block = dimension.getBlock(chestLoc);
    if (!block) return false;
    const invComp = block.getComponent("inventory");
    if (!invComp?.container) return false;
    invComp.container.addItem(new mc.ItemStack(item, count));
    return true;
  } catch (_) {
    return false;
  }
}

/** Give items directly to nearby players as fallback when no chest is set. */
function giveToNearbyPlayers(dimension, origin, item, count) {
  try {
    dimension.runCommand(`give @a[r=32] ${item} ${count}`);
  } catch (_) {}
}

/** Store mined/farmed drops: chest if home is set, otherwise give to player. */
function storeItem(bot, item, count) {
  const chest = getHomeChest(bot);
  if (chest) {
    const ok = depositToChest(bot.dimension, chest, item, count);
    if (!ok) giveToNearbyPlayers(bot.dimension, bot.location, item, count);
  } else {
    giveToNearbyPlayers(bot.dimension, bot.location, item, count);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Block finders
// ─────────────────────────────────────────────────────────────────────────────

function findNearestOre(bot, radius) {
  const ox = Math.floor(bot.location.x);
  const oy = Math.floor(bot.location.y);
  const oz = Math.floor(bot.location.z);
  for (let r = 1; r <= radius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r && Math.abs(dz) !== r) continue;
          try {
            const loc = { x: ox + dx, y: oy + dy, z: oz + dz };
            const b = bot.dimension.getBlock(loc);
            if (b && ORE_DROPS[b.typeId]) return { block: b, location: loc };
          } catch (_) {}
        }
      }
    }
  }
  return null;
}

function findNearestReadyCrop(bot, radius) {
  const ox = Math.floor(bot.location.x);
  const oy = Math.floor(bot.location.y);
  const oz = Math.floor(bot.location.z);
  for (let r = 0; r <= radius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        for (let dz = -r; dz <= r; dz++) {
          if (r > 0 && Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          try {
            const loc = { x: ox + dx, y: oy + dy, z: oz + dz };
            const b = bot.dimension.getBlock(loc);
            if (!b) continue;
            const crop = CROPS[b.typeId];
            if (!crop) continue;
            const growth = b.permutation.getState(crop.growthKey);
            if (growth === crop.max) return { block: b, location: loc, crop };
          } catch (_) {}
        }
      }
    }
  }
  return null;
}

function findNearestVillager(bot, radius) {
  for (const type of ["minecraft:villager_v2", "minecraft:villager"]) {
    try {
      const list = bot.dimension.getEntities({ type, location: bot.location, maxDistance: radius });
      if (list.length > 0) return list[0];
    } catch (_) {}
  }
  return null;
}

function findNearestFoodItem(bot, radius) {
  try {
    const items = bot.dimension.getEntities({ type: "minecraft:item", location: bot.location, maxDistance: radius });
    for (const ent of items) {
      const comp = ent.getComponent("item");
      if (comp && FOOD_ITEMS.has(comp.itemStack?.typeId)) return ent;
    }
  } catch (_) {}
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-tick job handlers
// ─────────────────────────────────────────────────────────────────────────────

function tickMine(bot, s) {
  if (s.busy) return;
  s.tick++;
  if (s.tick % 20 !== 0) return;     // Once per second

  const ore = findNearestOre(bot, 16);
  if (!ore) {
    if (s.tick % 100 === 0) botSay(bot, pick(LOCAL_RESPONSES.mine.none));
    return;
  }
  s.busy = true;
  const { location, block } = ore;
  const drop = ORE_DROPS[block.typeId];
  const oreName = block.typeId.replace("minecraft:", "").replace(/_/g, " ");

  try { bot.dimension.runCommand(`setblock ${location.x} ${location.y} ${location.z} air destroy`); } catch (_) {}
  try { bot.teleport({ x: location.x, y: location.y, z: location.z }, { dimension: bot.dimension }); } catch (_) {}

  if (drop) storeItem(bot, drop.item, drop.count);

  s.oreCount = (s.oreCount ?? 0) + 1;
  if (s.tick % 40 === 0) botSay(bot, pick(LOCAL_RESPONSES.mine.found).replace("{ore}", oreName));
  if (s.oreCount % 10 === 0) {
    setEmotion(bot, EMOTION.EXCITED);
    botSay(bot, pick(LOCAL_RESPONSES.mine.deposited));
  }
  s.busy = false;
}

function tickFarm(bot, s) {
  s.tick++;
  if (s.tick % 20 !== 0) return;

  const found = findNearestReadyCrop(bot, 24);
  if (!found) {
    if (s.tick % 120 === 0) botSay(bot, pick(LOCAL_RESPONSES.farm.none));
    return;
  }
  const { location, crop } = found;
  const cropName = crop.drop.replace("minecraft:", "").replace(/_/g, " ");

  // Harvest
  try { bot.dimension.runCommand(`setblock ${location.x} ${location.y} ${location.z} air destroy`); } catch (_) {}
  // Replant
  try { bot.dimension.runCommand(`setblock ${location.x} ${location.y} ${location.z} ${found.block.typeId} 0`); } catch (_) {}
  // Move to crop
  try { bot.teleport({ x: location.x, y: location.y + 1, z: location.z }, { dimension: bot.dimension }); } catch (_) {}

  storeItem(bot, crop.drop, crop.count);
  s.cropCount = (s.cropCount ?? 0) + 1;

  if (s.cropCount % 5 === 0) botSay(bot, pick(LOCAL_RESPONSES.farm.harvest).replace("{crop}", cropName));
  if (s.cropCount % 20 === 0) {
    setEmotion(bot, EMOTION.HAPPY);
    botSay(bot, pick(LOCAL_RESPONSES.farm.deposited));
  }
}

function tickCollect(bot, s) {
  s.tick++;
  if (s.tick % 15 !== 0) return;

  const item = findNearestFoodItem(bot, 20);
  if (!item) {
    if (s.tick % 120 === 0) botSay(bot, pick(LOCAL_RESPONSES.collect.none));
    return;
  }

  try {
    const comp     = item.getComponent("item");
    const typeId   = comp?.itemStack?.typeId ?? "minecraft:apple";
    const count    = comp?.itemStack?.amount ?? 1;
    const foodName = typeId.replace("minecraft:", "").replace(/_/g, " ");

    item.remove();
    storeItem(bot, typeId, count);

    s.foodCount = (s.foodCount ?? 0) + 1;
    if (s.foodCount % 5 === 0) botSay(bot, pick(LOCAL_RESPONSES.collect.found).replace("{food}", foodName));
    if (s.foodCount % 15 === 0) {
      setEmotion(bot, EMOTION.HAPPY);
      botSay(bot, pick(LOCAL_RESPONSES.collect.deposited));
    }
  } catch (_) {}
}

function tickBuild(bot, s) {
  s.tick++;
  if (s.tick % 4 !== 0) return;
  if (!s.buildOrigin) { s.buildOrigin = { ...bot.location }; }
  if (s.buildIndex >= HOUSE_BLUEPRINT.length) {
    if (s.tick % 200 === 0) botSay(bot, pick(LOCAL_RESPONSES.build.done));
    return;
  }
  const bp = HOUSE_BLUEPRINT[s.buildIndex];
  const ox = Math.floor(s.buildOrigin.x), oy = Math.floor(s.buildOrigin.y), oz = Math.floor(s.buildOrigin.z);
  try { bot.dimension.runCommand(`setblock ${ox + bp.x} ${oy + bp.y} ${oz + bp.z} ${bp.b}`); } catch (_) {}
  s.buildIndex++;

  if (s.buildIndex === 1)                                        botSay(bot, pick(LOCAL_RESPONSES.build.start));
  if (s.buildIndex === Math.floor(HOUSE_BLUEPRINT.length / 2)) {
    const pct = Math.round(s.buildIndex / HOUSE_BLUEPRINT.length * 100);
    botSay(bot, pick(LOCAL_RESPONSES.build.progress).replace("{pct}", pct));
  }
  if (s.buildIndex === HOUSE_BLUEPRINT.length) {
    setEmotion(bot, EMOTION.EXCITED);
    botSay(bot, pick(LOCAL_RESPONSES.build.done));
  }
}

function tickTrade(bot, s) {
  s.tick++;
  if (s.tick % 40 !== 0) return;

  const villager = findNearestVillager(bot, 64);
  if (!villager) {
    if (s.tick % 200 === 0) botSay(bot, pick(LOCAL_RESPONSES.trade.none));
    return;
  }

  const dx = villager.location.x - bot.location.x;
  const dz = villager.location.z - bot.location.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  if (dist > 3) {
    try { bot.teleport(villager.location, { dimension: bot.dimension }); } catch (_) {}
    if (!s.tradeMoving) { botSay(bot, pick(LOCAL_RESPONSES.trade.going)); s.tradeMoving = true; }
  } else {
    s.tradeMoving = false;
    if (!s.tradeTraded) {
      setEmotion(bot, EMOTION.EXCITED);
      botSay(bot, pick(LOCAL_RESPONSES.trade.done));
      storeItem(bot, "minecraft:emerald", 3);
      s.tradeTraded = true;
    }
    if (s.tick % 200 === 0) s.tradeTraded = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main tick loop
// ─────────────────────────────────────────────────────────────────────────────

mc.system.runInterval(() => {
  for (const dimId of ["overworld", "nether", "the_end"]) {
    let dim;
    try { dim = mc.world.getDimension(dimId); } catch (_) { continue; }

    for (const botType of BOT_TYPES) {
      let bots;
      try { bots = dim.getEntities({ type: botType }); } catch (_) { continue; }

      for (const bot of bots) {
        try {
          tickEmotion(bot);

          const mode = getMode(bot);
          if (mode === MODE.IDLE || mode === MODE.HUNT ||
              mode === MODE.FOLLOW || mode === MODE.GUARD) continue;

          const s = getState(bot);
          if (mode === MODE.MINE)    tickMine(bot, s);
          if (mode === MODE.FARM)    tickFarm(bot, s);
          if (mode === MODE.COLLECT) tickCollect(bot, s);
          if (mode === MODE.BUILD)   tickBuild(bot, s);
          if (mode === MODE.TRADE)   tickTrade(bot, s);
        } catch (_) {}
      }
    }
  }
}, 1);

// ─────────────────────────────────────────────────────────────────────────────
// Speech helper
// ─────────────────────────────────────────────────────────────────────────────

function botSay(bot, text) {
  const name  = getTag(bot, "pa_basename") ?? bot.nameTag ?? "Bot";
  const emo   = getEmotion(bot).emotion;
  const emoji = EMOTION_EMOJI[emo] ?? "🤖";
  try { bot.dimension.runCommand(`say §e[${emoji} ${name}]§r ${text}`); } catch (_) {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Order UI
// ─────────────────────────────────────────────────────────────────────────────

async function showOrderMenu(player, bot) {
  const mode    = getMode(bot);
  const emo     = getEmotion(bot).emotion;
  const emoji   = EMOTION_EMOJI[emo] ?? "🤖";
  const botName = getTag(bot, "pa_basename") ?? bot.nameTag ?? "Bot";
  const chest   = getHomeChest(bot);
  const chestTxt = chest ? `§aHome chest: §e(${chest.x}, ${chest.y}, ${chest.z})` : "§cNo home chest set";

  const form = new ActionFormData()
    .title(`§l§6${emoji} ${botName}`)
    .body(`Mood: §e${emo}§r   Task: §e${mode.toUpperCase()}§r\n${chestTxt}\n\nGive ${botName} an order:`)
    .button("⚔  Hunt Mobs",             "textures/items/iron_sword")
    .button("⛏  Mine Ores → Chest",     "textures/items/iron_pickaxe")
    .button("🌾  Farm Crops → Chest",   "textures/blocks/farmland_dry")
    .button("🍎  Collect Food → Chest", "textures/items/apple")
    .button("🏠  Build a Home",         "textures/blocks/planks_oak")
    .button("💰  Trade w/ Villagers",   "textures/items/emerald")
    .button("🛡  Guard Me",             "textures/items/iron_chestplate")
    .button("🚶  Follow Me",            "textures/items/lead")
    .button("😴  Idle",                 "textures/items/clock_item")
    .button("📦  Set Home Chest",       "textures/blocks/chest_front")
    .button("✏  Rename",               "textures/items/name_tag")
    .button("❌  Close",               "textures/ui/cancel");

  const r = await form.show(player);
  if (r.canceled) return;

  switch (r.selection) {
    case 0:  activateMode(bot, player, MODE.HUNT);    break;
    case 1:  activateMode(bot, player, MODE.MINE);    break;
    case 2:  activateMode(bot, player, MODE.FARM);    break;
    case 3:  activateMode(bot, player, MODE.COLLECT); break;
    case 4:  await confirmBuild(player, bot);         break;
    case 5:  activateMode(bot, player, MODE.TRADE);   break;
    case 6:  activateMode(bot, player, MODE.GUARD);   break;
    case 7:  activateMode(bot, player, MODE.FOLLOW);  break;
    case 8:  activateMode(bot, player, MODE.IDLE);    break;
    case 9:  setHomeChestNearPlayer(player, bot);     break;
    case 10: await renameForm(player, bot);           break;
    default: break;
  }
}

function activateMode(bot, player, mode) {
  setMode(bot, mode);
  const s = getState(bot);
  s.tick = 0; s.busy = false; s.tradeTraded = false; s.tradeMoving = false;
  s.oreCount = 0; s.cropCount = 0; s.foodCount = 0;
  if (mode === MODE.BUILD) { s.buildIndex = 0; s.buildOrigin = { ...bot.location }; }

  const startMap = {
    [MODE.HUNT]:    [EMOTION.ANGRY,      LOCAL_RESPONSES.hunt.start],
    [MODE.MINE]:    [EMOTION.DETERMINED, LOCAL_RESPONSES.mine.start],
    [MODE.FARM]:    [EMOTION.HAPPY,      LOCAL_RESPONSES.farm.start],
    [MODE.COLLECT]: [EMOTION.HAPPY,      LOCAL_RESPONSES.collect.start],
    [MODE.BUILD]:   [EMOTION.EXCITED,    LOCAL_RESPONSES.build.start],
    [MODE.TRADE]:   [EMOTION.EXCITED,    LOCAL_RESPONSES.trade.start],
    [MODE.GUARD]:   [EMOTION.DETERMINED, LOCAL_RESPONSES.guard.start],
    [MODE.FOLLOW]:  [EMOTION.HAPPY,      LOCAL_RESPONSES.follow.start],
    [MODE.IDLE]:    [EMOTION.CURIOUS,    LOCAL_RESPONSES.idle.start],
  };
  const [emo, lines] = startMap[mode] ?? [EMOTION.HAPPY, ["On it!"]];
  setEmotion(bot, emo);
  botSay(bot, pick(lines));
  const botName = getTag(bot, "pa_basename") ?? bot.nameTag ?? "Bot";
  player.sendMessage(`§a${botName} → §e${mode.toUpperCase()}§a mode.`);
}

function setHomeChestNearPlayer(player, bot) {
  const found = findNearestChest(player.dimension, player.location, 8);
  if (!found) {
    player.sendMessage("§cNo chest found within 8 blocks. Place a chest near yourself first!");
    return;
  }
  setHomeChest(bot, found.location);
  setEmotion(bot, EMOTION.HAPPY);
  botSay(bot, pick(LOCAL_RESPONSES.sethome));
  player.sendMessage(`§aHome chest set at §e(${found.location.x}, ${found.location.y}, ${found.location.z})§a!`);
}

async function confirmBuild(player, bot) {
  const form = new ActionFormData()
    .title("§l§6Build a Home")
    .body("Your bot will build a 7×7 wooden house starting at their position.\n\nMake sure there is a flat open area.\n\n§aProceed?")
    .button("§aYes, build here!")
    .button("§cCancel");
  const r = await form.show(player);
  if (!r.canceled && r.selection === 0) activateMode(bot, player, MODE.BUILD);
}

async function renameForm(player, bot) {
  const old = getTag(bot, "pa_basename") ?? bot.nameTag ?? "Bot";
  const form = new ModalFormData()
    .title("§l§6Rename Bot")
    .textField("New name:", "My Bot", old);
  const r = await form.show(player);
  if (r.canceled) return;
  const name = String(r.formValues[0]).trim().slice(0, 32);
  if (!name) return;
  setTag(bot, "pa_basename", name);
  updateNameTag(bot);
  player.sendMessage(`§aBot renamed to §e${name}§a!`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Right-click → order menu
// ─────────────────────────────────────────────────────────────────────────────

mc.world.afterEvents.playerInteractWithEntity.subscribe(({ player, target }) => {
  if (!BOT_TYPES.includes(target.typeId)) return;
  mc.system.run(() => {
    showOrderMenu(player, target).catch(err => {
      player.sendMessage(`§cBot menu error: ${err}`);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Natural-language chat detection (message still shows in chat)
// ─────────────────────────────────────────────────────────────────────────────

mc.world.afterEvents.chatSend.subscribe(({ sender: player, message }) => {
  // Skip .bot commands — those are handled by beforeEvents
  if (message.startsWith(".bot")) return;

  // Find bots within 20 blocks of the player
  const nearbyBots = [];
  for (const botType of BOT_TYPES) {
    try {
      const found = player.dimension.getEntities({ type: botType, location: player.location, maxDistance: 20 });
      nearbyBots.push(...found);
    } catch (_) {}
  }
  if (nearbyBots.length === 0) return;

  // Special: "set home" → register chest on all nearby bots
  if (/^set\s*home$|^home\s*chest$|^sethome$|^set\s*chest$/i.test(message.trim())) {
    nearbyBots.forEach(bot => setHomeChestNearPlayer(player, bot));
    return;
  }

  // "status" → report current mode
  if (/^status$|^what are you doing\?*$|^your task\?*$/i.test(message.trim())) {
    nearbyBots.forEach(bot => {
      const mode = getMode(bot);
      const emo  = getEmotion(bot).emotion;
      botSay(bot, `I'm ${mode === MODE.IDLE ? "idle" : "currently " + mode + "ing"}. Feeling ${emo}!`);
    });
    return;
  }

  // Mode-switch commands
  for (const { re, mode } of CHAT_PATTERNS) {
    if (re.test(message)) {
      nearbyBots.forEach(bot => activateMode(bot, player, mode));
      return;
    }
  }

  // General chat → bot responds with AI brain
  nearbyBots.forEach(bot => {
    mc.system.run(async () => {
      try { await botRespondToChat(bot, message); } catch (_) {}
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// .bot <command> – precise prefixed commands (cancels the chat message)
// ─────────────────────────────────────────────────────────────────────────────

mc.world.beforeEvents.chatSend.subscribe(event => {
  const { sender: player, message } = event;
  if (!message.startsWith(".bot")) return;

  event.cancel = true;
  const args = message.slice(4).trim().split(/\s+/);
  const cmd  = args[0]?.toLowerCase() ?? "";

  // Find nearest bot
  let bot = null;
  for (const t of BOT_TYPES) {
    try {
      const f = player.dimension.getEntities({ type: t, location: player.location, maxDistance: 32 });
      if (f.length > 0) { bot = f[0]; break; }
    } catch (_) {}
  }

  // .bot setkey <api_key> — stores the Groq key in world dynamic property
  if (cmd === "setkey") {
    const key = args.slice(1).join(" ").trim();
    if (!key) { player.sendMessage("§cUsage: .bot setkey <YOUR_GROQ_API_KEY>"); return; }
    mc.world.setDynamicProperty("groq_api_key", key);
    player.sendMessage("§aGroq API key saved! Your bots now have real AI brains. 🧠");
    return;
  }

  // .bot clearkey
  if (cmd === "clearkey") {
    mc.world.setDynamicProperty("groq_api_key", "");
    player.sendMessage("§aGroq API key cleared. Bots using local brain.");
    return;
  }

  // .bot sethome
  if (cmd === "sethome" || cmd === "set" && args[1] === "home") {
    if (!bot) { player.sendMessage("§cNo bot nearby!"); return; }
    setHomeChestNearPlayer(player, bot);
    return;
  }

  // .bot status
  if (cmd === "status") {
    if (!bot) { player.sendMessage("§cNo bot nearby!"); return; }
    const mode  = getMode(bot);
    const emo   = getEmotion(bot).emotion;
    const chest = getHomeChest(bot);
    player.sendMessage(
      `§6Bot status§r — Mode: §e${mode}§r  Emotion: §e${emo}§r  ` +
      `Home chest: ${chest ? `§e(${chest.x},${chest.y},${chest.z})` : "§cnone"}`
    );
    return;
  }

  if (!bot) { player.sendMessage("§cNo bot within 32 blocks!"); return; }

  const modeMap = {
    hunt: MODE.HUNT, mine: MODE.MINE, farm: MODE.FARM, collect: MODE.COLLECT,
    build: MODE.BUILD, trade: MODE.TRADE, guard: MODE.GUARD,
    follow: MODE.FOLLOW, idle: MODE.IDLE, stop: MODE.IDLE,
  };

  const mode = modeMap[cmd];
  if (mode) {
    if (mode === MODE.BUILD) {
      mc.system.run(async () => { await confirmBuild(player, bot); });
    } else {
      activateMode(bot, player, mode);
    }
  } else {
    player.sendMessage(
      "§eCommands:§r .bot <hunt|mine|farm|collect|build|trade|guard|follow|idle|stop>\n" +
      "           .bot sethome   — register nearby chest as home\n" +
      "           .bot status    — show current mode & emotion\n" +
      "           .bot setkey <GROQ_KEY>  — enable real AI (BDS only)\n" +
      "           .bot clearkey  — remove stored key"
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Hurt event → emotion change
// ─────────────────────────────────────────────────────────────────────────────

mc.world.afterEvents.entityHurt.subscribe(({ hurtEntity }) => {
  if (!BOT_TYPES.includes(hurtEntity.typeId)) return;
  const e = getEmotion(hurtEntity);
  e.hitsReceived = (e.hitsReceived ?? 0) + 1;
  if (e.hitsReceived % 3 === 0) {
    setEmotion(hurtEntity, EMOTION.SCARED);
    if (Math.random() < 0.3) botSay(hurtEntity, pick(LOCAL_RESPONSES.chat.hurt));
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Welcome message
// ─────────────────────────────────────────────────────────────────────────────

mc.world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  mc.system.runTimeout(() => {
    const hasKey = !!mc.world.getDynamicProperty("groq_api_key");
    player.sendMessage(
      "§6§lAdvanced Ai Bots — AI Brain Edition§r\n" +
      "§7• Spawn a bot with the §eSpawn Player§7 egg.\n" +
      "§7• §eRight-click§7 a bot for the full order menu.\n" +
      "§7• Just §echat naturally§7 near a bot: §e\"mine\"§7, §e\"farm\"§7, §e\"build\"§7…\n" +
      "§7• Type §e\"set home\"§7 near a chest to register it as the drop-off point.\n" +
      (hasKey
        ? "§a• Groq AI brain active! 🧠 Bots have real intelligence."
        : "§e• Want real AI? Run: §r.bot setkey <your-groq-api-key>§e  (BDS only)")
    );
  }, 60);
});
