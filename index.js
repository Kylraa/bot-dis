require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection } = require('@discordjs/voice');
const express = require('express');

console.log("Bot is starting...");

// ===== WEB SERVER (CHO RENDER) =====
const app = express();
app.get("/", (req, res) => {
  res.send("Bot is running!");
});
app.listen(process.env.PORT || 3000, () => {
  console.log("Web server started");
});

// ===== DISCORD CLIENT =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

client.once("ready", () => {
  console.log(`Bot online: ${client.user.tag}`);
});

// ===== COMMANDS =====
client.on("messageCreate", async (message) => {

  if (message.author.bot) return;

  if (message.content === "n!join") {

    if (!message.member.voice.channel) {
      return message.reply("❌ Bạn phải vào voice trước!");
    }

    const channel = message.member.voice.channel;

    joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator
    });

    message.reply("✅ Bot đã vào voice!");
  }

  if (message.content === "n!leave") {

    const connection = getVoiceConnection(message.guild.id);

    if (connection) {
      connection.destroy();
      message.reply("👋 Bot đã rời voice!");
    } else {
      message.reply("❌ Bot chưa ở trong voice!");
    }
  }

});

// ===== LOGIN =====
client.login(process.env.TOKEN);