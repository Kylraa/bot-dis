const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection } = require('@discordjs/voice');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const TOKEN = process.env.TOKEN;

client.once("ready", () => {
    console.log(`✅ Bot đã online: ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {

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

        message.reply("✅ Bot đã vào voice và sẽ treo tại đây!");
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

client.login(TOKEN);