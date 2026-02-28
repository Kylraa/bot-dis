require("dotenv").config();

const { 
  Client, 
  GatewayIntentBits, 
  Partials 
} = require("discord.js");

const { 
  joinVoiceChannel, 
  createAudioPlayer, 
  createAudioResource,
  AudioPlayerStatus,
  entersState,
  VoiceConnectionStatus
} = require("@discordjs/voice");

const play = require("play-dl");

// ===== WEB SERVER (CHO RENDER) =====
const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("Bot is running");
});

app.listen(process.env.PORT || 3000);

// ===== DISCORD CLIENT =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

const PREFIX = "n!";

const queues = new Map();

function getQueue(guildId) {
  if (!queues.has(guildId)) {

    const player = createAudioPlayer();

    // 🔥 DEBUG PLAYER
    player.on("stateChange", (oldState, newState) => {
      console.log(`Player: ${oldState.status} -> ${newState.status}`);
    });

    player.on("error", error => {
      console.log("Player error:", error);
    });

    queues.set(guildId, {
      songs: [],
      connection: null,
      player: player,
      loop: false
    });
  }

  return queues.get(guildId);
}

async function playNext(guildId) {
  const queue = getQueue(guildId);

  if (!queue || queue.songs.length === 0) {
    if (queue?.connection && queue.connection.state.status !== "destroyed") {
      queue.connection.destroy();
    }
    queues.delete(guildId);
    return;
  }

  const song = queue.songs[0];

  if (!song || !song.url) {
    console.log("Song invalid:", song);
    queue.songs.shift();
    return playNext(guildId);
  }

  console.log("Đang phát:", song.url);

  try {
    const stream = await play.stream(song.url);

    const resource = createAudioResource(stream.stream, {
      inputType: stream.type,
      inlineVolume: true
    });

    queue.player.play(resource);

  } catch (err) {
    console.log("Lỗi stream:", err);
    queue.songs.shift();
    playNext(guildId);
  }
}

client.once("ready", () => {
  console.log(`Bot online: ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {

  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  const queue = getQueue(message.guild.id);

  // ===== PLAY =====
  if (command === "play") {

    if (!args[0])
      return message.reply("❌ Nhập link hoặc tên bài!");

    if (!message.member.voice.channel)
      return message.reply("❌ Bạn phải vào voice trước!");

    const channel = message.member.voice.channel;

    if (!queue.connection) {
  queue.connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator
  });

  //  THÊM Ở ĐÂY
  queue.connection.on("error", error => {
    console.log("Voice connection error:", error);
  });

  queue.connection.on("stateChange", (oldState, newState) => {
    console.log(`Connection: ${oldState.status} -> ${newState.status}`);
  });

  try {
    await entersState(queue.connection, VoiceConnectionStatus.Ready, 20000);
  } catch {
    queue.connection.destroy();
    return message.reply("❌ Không thể vào voice!");
  }

  queue.connection.subscribe(queue.player);

  queue.player.on(AudioPlayerStatus.Idle, () => {
    if (!queue.loop) queue.songs.shift();
    playNext(message.guild.id);
  });
}

    const query = args.join(" ");
    let cleanQuery = query;

// Nếu là link YouTube, chỉ giữ phần v=
if (cleanQuery.includes("youtube.com/watch")) {
  const url = new URL(cleanQuery);
  cleanQuery = `https://www.youtube.com/watch?v=${url.searchParams.get("v")}`;
}
    let songInfo;

    try {
      if (play.yt_validate(cleanQuery) === "video") {
  songInfo = { url: cleanQuery };
}
      else if (play.sp_validate(cleanQuery) === "track") {
        const sp = await play.spotify(cleanQuery);
        const yt = await play.search(`${sp.name} ${sp.artists[0].name}`, { limit: 1 });
        songInfo = { url: yt[0].url };
      }
      else if (play.so_validate(cleanQuery) === "track") {
        songInfo = { url: cleanQuery };
      }
      else {
        const yt = await play.search(cleanQuery, { limit: 1 });

if (!yt || yt.length === 0)
  return message.reply("❌ Không tìm thấy bài!");

songInfo = { url: yt[0].url };
      }

      queue.songs.push(songInfo);

      if (queue.songs.length === 1)
        playNext(message.guild.id);

      message.reply("🎵 Đã thêm vào hàng chờ!");

    } catch (err) {
      console.error(err);
      message.reply("❌ Không thể phát bài này!");
    }
  }

  // ===== SKIP =====
  if (command === "skip") {
    queue.player.stop();
    message.reply("⏭ Đã skip!");
  }

  // ===== STOP =====
  if (command === "stop") {
    queue.songs = [];
    queue.player.stop();
    if (queue.connection) queue.connection.destroy();
    queues.delete(message.guild.id);
    message.reply("⏹ Đã dừng và rời voice!");
  }

  // ===== LEAVE =====
  if (command === "leave") {
    const connection = getVoiceConnection(message.guild.id);
    if (connection) {
      connection.destroy();
      queues.delete(message.guild.id);
      message.reply("👋 Đã rời voice!");
    }
  }

  // ===== QUEUE =====
  if (command === "queue") {
    if (queue.songs.length === 0)
      return message.reply("📭 Hàng chờ trống!");

    const list = queue.songs
      .map((s, i) => `${i + 1}. ${s.url}`)
      .join("\n");

    message.reply(`📜 Hàng chờ:\n${list}`);
  }

  // ===== LOOP =====
  if (command === "loop") {
    queue.loop = !queue.loop;
    message.reply(queue.loop ? "🔁 Đã bật loop!" : "➡️ Đã tắt loop!");
  }

});

console.log("ENV TOKEN:", process.env.TOKEN);
client.login(process.env.TOKEN);