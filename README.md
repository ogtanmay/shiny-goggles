# Advanced Ai Bots — NPC Companion Addon

A Minecraft Bedrock addon that adds intelligent NPC companions (bots) to your world.  
They can **mine ores, farm crops, collect food, build your home, trade with villagers, hunt mobs, guard you, and have real emotions** — all controllable just by chatting.

---

## 📦 Installation

1. Download **`Advanced Ai Bots (No Load Chunks).mcaddon`**
2. Double-click it — Minecraft will import both packs automatically
3. Create or open a world and **activate both packs**:
   - `Advanced Ai Bots RP` (Resource Pack)
   - `Advanced Ai Bots BP` (Behavior Pack)
4. Enable **Beta APIs** in your world's Experiments settings

> **Note:** All features (chat commands, mining, farming, etc.) work in **singleplayer and Realms**.  
> The optional Groq AI brain requires a **Bedrock Dedicated Server (BDS)** — see [AI Brain Setup](#-ai-brain-setup-optional) below.

---

## 🤖 Spawning a Bot

Use the **"Spawn Bot"** spawn egg from the creative inventory (search for `Spawn Bot`).

Or run the command:
```
/summon pa:player
```

- **Tame the bot** by right-clicking it with: `diamond`, `emerald`, `iron ingot`, `gold ingot`, or `netherite ingot`
- Once tamed, the bot follows you and has an emoji prefix showing its mood (e.g. `😊 Bot`)
- **Rename** your bot with a name tag or through the Order Menu

---

## 🗣️ Giving Orders — Chat Commands

Just **type in chat** near your bot (within 20 blocks). No prefix needed!

| What you type | What the bot does |
|---|---|
| `mine` | Mines nearby ores and stores them in your home chest |
| `farm` | Harvests fully grown crops, replants, stores in home chest |
| `collect food` | Picks up food items from the ground, stores in home chest |
| `hunt` | Attacks all nearby hostile mobs |
| `guard` | Follows you and attacks any hostile mob that gets close |
| `follow` | Follows you everywhere |
| `build` | Builds a wooden house (7×7) right where it stands |
| `trade` | Walks to the nearest villager and brings back emeralds |
| `stop` | Bot stands idle |
| `set home` | Registers the nearest chest as the **home chest** (drop-off point) |
| `status` | Bot tells you its current task and mood |

> **Any other chat message** near a bot will make it respond naturally — it listens to you!

---

## 📋 Right-Click Order Menu

**Right-click (interact with) any bot** to open the full Order Menu:

```
⚔  Hunt Mobs
⛏  Mine Ores → Chest
🌾  Farm Crops → Chest
🍎  Collect Food → Chest
🏠  Build a Home
💰  Trade with Villagers
🛡  Guard Me
🚶  Follow Me
😴  Idle
📦  Set Home Chest
✏  Rename Bot
```

---

## 📦 Home Chest System

The bot deposits all mined ores, harvested crops, and collected food into a designated **home chest**.

**How to set it up:**
1. Place a chest anywhere you like
2. Stand next to it and type `set home` in chat, **or** open the Order Menu and tap **📦 Set Home Chest**
3. The bot confirms: *"Got it! I'll bring everything to that chest."*

If no home chest is set, items are given directly to nearby players instead.

---

## .bot Commands (Advanced)

Use `.bot` prefix for precise control (message is hidden from chat):

| Command | Description |
|---|---|
| `.bot mine` | Mine mode |
| `.bot farm` | Farm mode |
| `.bot collect` | Collect food |
| `.bot hunt` | Hunt mode |
| `.bot guard` | Guard mode |
| `.bot follow` | Follow mode |
| `.bot build` | Build a house |
| `.bot trade` | Trade mode |
| `.bot idle` / `.bot stop` | Idle |
| `.bot sethome` | Register nearby chest as home |
| `.bot status` | Show current mode, emotion, and home chest |
| `.bot setkey <KEY>` | Set your Groq API key (BDS only) |
| `.bot clearkey` | Remove stored API key |

---

## 😊 Emotion System

Every bot has one of **8 emotions** shown as an emoji on their name:

| Emoji | Emotion | When |
|---|---|---|
| 😊 | Happy | Following, farming, idle |
| 🎉 | Excited | Just found diamonds, build complete, trading |
| 💪 | Determined | Actively mining or guarding |
| 😤 | Angry | Hunt mode, attacking mobs |
| 🔍 | Curious | Idle for a long time, exploring |
| 😴 | Tired | Mining or building for too long |
| 😨 | Scared | Low health, taking lots of damage |
| 😢 | Sad | Responding to sad messages |

Emotions change **automatically** based on what the bot is doing, how long it has been working, and whether it's been hurt.

---

## 🧠 AI Brain Setup (Optional)

By default bots use a **rich local brain** — contextual responses, personality, and emotions — that works everywhere with no setup.

To unlock **real AI responses** powered by [Groq](https://console.groq.com) (Llama 3):

### Requirements
- Minecraft **Bedrock Dedicated Server (BDS)** with Script API enabled
- A free Groq API key from [console.groq.com](https://console.groq.com)
- The BDS `config/default/permissions.json` must allow `@minecraft/server-net` and whitelist `api.groq.com`

### BDS permissions.json
```json
{
  "allowed_modules": ["@minecraft/server-net"],
  "http": {
    "allow_outbound_requests": true,
    "allowed_uris": ["https://api.groq.com"]
  }
}
```

### Setting the API key in-game
```
.bot setkey gsk_xxxxxxxxxxxxxxxxxxxx
```
The key is stored **inside the world save** (never in any file in this repo).  
To remove it: `.bot clearkey`

> ⚠️ **Security:** Never share your API key publicly. Never paste it in a file you commit to git.

---

## 🌾 What Bots Can Farm

| Crop | Harvests when… | Replants? |
|---|---|---|
| Wheat | Fully grown (stage 7) | ✅ |
| Carrots | Fully grown (stage 7) | ✅ |
| Potatoes | Fully grown (stage 7) | ✅ |
| Beetroot | Fully grown (stage 3) | ✅ |
| Nether Wart | Fully grown (stage 3) | ✅ |

---

## ⛏️ What Bots Can Mine

Coal, Iron, Gold, Diamond, Emerald, Lapis, Redstone, Copper, Nether Gold, Nether Quartz, Ancient Debris — all variants including Deepslate ores.

---

## 🏠 House Blueprint

When ordered to **Build**, the bot constructs a **7×7×5** wooden house containing:
- Oak log walls, oak plank floor, oak slab roof
- Door opening in the front
- Crafting table, furnace, chest, bed, and torch inside

---

## ❓ FAQ

**Q: The bot isn't responding to my chat.**  
A: Make sure you're within **20 blocks** of the bot. The bot must be spawned and tamed.

**Q: Items aren't going into the chest.**  
A: Type `set home` while standing next to your chest, or use the Order Menu → 📦 Set Home Chest.

**Q: The bot stops mining after a while.**  
A: It ran out of ores nearby. Move to a new area and say `mine` again.

**Q: Can I have multiple bots?**  
A: Yes! Each bot tracks its own mode, emotion, and home chest independently.

**Q: The script won't load / I see an error about @minecraft/server-net.**  
A: You're on regular Minecraft (not BDS). The local brain handles all features except real Groq AI. Everything else works normally.

---

## 📜 Credits

Original addon base: **Standardcuz** (Advanced Ai Bots)  
NPC Order System, AI Brain & Emotion System: extended for this project
