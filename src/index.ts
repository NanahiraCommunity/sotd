import {
  Client,
  Events,
  FetchMessagesOptions,
  GatewayIntentBits,
  Message,
  PartialMessage,
  Partials,
  Snowflake,
  TextChannel,
} from "discord.js";
import * as fs from "fs";

const config = require("../config.json");
const token = fs.readFileSync("token").toString("utf-8").trim();
const history: HistoryEntry[] = JSON.parse(
  fs.readFileSync("history.json").toString("utf-8").trim()
);
if (!Array.isArray(history)) throw new Error("history.json is not an array!");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel],
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

client.on(Events.MessageBulkDelete, (msgs) => msgs.each(onMessageDelete));
client.on(Events.MessageDelete, onMessageDelete);
client.on(Events.MessageCreate, onMessageSendOrEdit);
client.on(Events.MessageUpdate, onMessageSendOrEdit);

client.login(token);

type HistoryEntry = {
  dt: number;
  url: string;
  author: string;
  author_id: string;
  raw: string;
  parsed: SotdMessage;
};

enum MessageState {
  uninterested,
  unparsable,
  added,
  updated,
}

async function onMessageDelete(msg: Message | PartialMessage) {
  let url: string;
  try {
    url = msg.url;
  } catch (e) {
    console.error("ignoring deleted message that we can't fetch");
    return;
  }

  let i = history.findIndex((h) => h.url == url);
  if (i !== -1) {
    const deleted = history[i];
    console.log("Deleting entry ", deleted);
    history.splice(i, 1);
    queueSave();

    try {
      fs.appendFile(
        "_deleted_history.json",
        new Date().toISOString() + " - " + JSON.stringify(deleted) + "\n",
        (e) => {
          if (e) console.error("Failed writing deleted entry: ", e);
        }
      );
    } catch (e) {}
  }
}

async function onMessageSendOrEdit(
  msg: Message | PartialMessage
): Promise<MessageState> {
  if (msg.partial) msg = await msg.fetch();

  try {
    if (/\b(force|4orce)\b/gi.exec(msg.content)) await msg.react("🐴");
  } catch (e) {
    console.error("no horse for " + msg.url);
  }

  if (msg.channelId != config.sotd_channel) return MessageState.uninterested;

  if (!msg.mentions.has(client.user!.id) && !msg.mentions.has(config.role))
    return MessageState.uninterested;

  msg = await msg.fetch();

  let parsed = parseSotdMessage(msg.content);

  if (!parsed) {
    await msg.react(config.fail_reaction);
    return MessageState.unparsable;
  }

  let o: HistoryEntry = {
    dt: msg.createdTimestamp,
    url: msg.url,
    author: msg.author.displayName,
    author_id: msg.author.id,
    raw: msg.content,
    parsed,
  };

  let existing = history.findIndex(
    (h) =>
      (h.parsed.counter === o.parsed.counter || h.url == o.url) &&
      h.author_id == o.author_id
  );
  if (existing != -1) {
    history[existing] = o;
    console.log("Updating history entry #" + o.parsed.counter, JSON.stringify(o));
  }
  else {
    history.push(o);
    console.log("Pushed entry #" + o.parsed.counter, JSON.stringify(o));

    await msg.react(config.reaction);
  }

  queueSave();
  return existing != -1 ? MessageState.updated : MessageState.added;
}

type SotdMessage = {
  counter: number;
  name?: string;
  source?: string;
  releaseDate?: string;
  composer?: string;
  singers?: string;
  links?: string;
  youtube?: string;
  lyrics?: string;
  description?: string;
};

function parseSotdMessage(msg: string): SotdMessage | null {
  let counterRegex = /#\s*(\d+)/g;
  let regexes: { [index in keyof SotdMessage]?: RegExp } = {
    name: /^[*_]*Song Names?[*_]*:?[*_]*(.*)$/gim,
    source: /^([*_]*(?:Album|Game)s?[*_]*:?[*_]*.*)$/gim,
    releaseDate: /^[*_]*Release Dates?[*_]*:?[*_]*(.*)$/gim,
    composer: /^[*_]*Composers?[*_]*:?[*_]*(.*)$/gim,
    singers: /^[*_]*Singers?[*_]*:?[*_]*(.*)$/gim,
    links: /^[*_]*Links?[*_]*:?[*_]*(.*)$/gim,
    lyrics: /^[*_]*Lyrics[*_]*:?[*_]*(.*)$/gim,
    youtube:
      /(https?:\/\/(www\.)?(youtu\.be|youtube\.[a-zA-Z0-9()]{1,3})\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*))/gim,
  };

  let c = counterRegex.exec(msg);
  if (!c) return null;

  let parsed: SotdMessage = {
    counter: parseInt(c[1]),
  };

  if (!(parsed.counter > 0 && parsed.counter < 100000)) return null;

  let lastIndex = counterRegex.lastIndex;
  for (const r of Object.entries(regexes)) {
    let match = r[1].exec(msg);
    if (match) {
      lastIndex = Math.max(lastIndex, r[1].lastIndex);
      (parsed as any)[r[0]] = match[1].trim();
    }
  }

  let remaining = msg.substring(lastIndex).trim();
  parsed.description = remaining;

  return parsed;
}

let _saveTimer: NodeJS.Timeout | undefined;
function queueSave() {
  function saveImpl() {
    history.sort((a, b) => a.dt - b.dt);

    fs.writeFile("history.json", JSON.stringify(history, null, "\t"), (e) => {
      if (e) console.error("Failed writing history: ", e);
    });
  }

  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(saveImpl, 5000);
}

function reparseHistory() {
  for (const h of history) {
    let reparsed = parseSotdMessage(h.raw);
    if (reparsed) h.parsed = reparsed;
  }

  queueSave();
}

// reparseHistory();

async function readHistory() {
  let g = await client.guilds.fetch(config.nanacord);
  if (!g) throw new Error("nanacord not found");
  let c = await client.channels.fetch(config.sotd_channel);
  if (!c) throw new Error("Channel not found");
  if (!c.isTextBased()) throw new Error("Channel not a text channel");
  let found = 0;
  let last: Snowflake | undefined = undefined;
  try {
    Outer: for (let i = 0; i < 5000; i++) {
      let o: FetchMessagesOptions = {
        limit: 100,
      };
      if (last !== undefined) o.before = last;
      let msgs = (await c.messages.fetch(o)).toJSON();
      if (!msgs.length) break;
      last = msgs[msgs.length - 1].id;
      for (let i = msgs.length - 1; i >= 0; i--) {
        const msg = msgs[i];
        let state = await onMessageSendOrEdit(msg);
        if (state == MessageState.added) {
          console.log(
            "Retroactively added #" + history[history.length - 1].parsed.counter
          );
          found++;
        } else if (state == MessageState.updated) {
          console.log(
            "History caught up to latest #" +
              history[history.length - 1].parsed.counter
          );
          break Outer;
        } else if (state == MessageState.unparsable) {
          console.error("Could not parse pinged message " + msg.url);
        }
      }
    }
  } catch (e) {
    console.error(e);
  }

  if (found == 0) {
    console.log("No missed announcements in history");
    return;
  }
}

readHistory();
