require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const { 
    joinVoiceChannel, 
    createAudioPlayer, 
    createAudioResource, 
    AudioPlayerStatus, 
    getVoiceConnection 
} = require("@discordjs/voice");
const play = require('play-dl');
const express = require('express');
const libsodium = require('libsodium-wrappers');

const app = express();
const PREFIX = "n!";
const queues = new Map();

// 1. KHỞI TẠO HỆ THỐNG (Mã hóa & Cookie)
(async () => {
    try {
        await libsodium.ready;

        // Dữ liệu Cookie của bạn
        const myCookie = [
            {
                "domain": ".youtube.com",
                "expirationDate": 1772309216,
                "hostOnly": false,
                "httpOnly": false,
                "name": "ST-yve142",
                "path": "/",
                "sameSite": "unspecified",
                "secure": false,
                "session": false,
                "storeId": "0",
                "value": "session_logininfo=AFmmF2swRAIgRJtN1T0a0Fy1IzU0kLx74Cb_hI-Drhd6zzTCgvKwKRACIHZGVdJhxEm9AbTx7mBwyQdss48nyFnUjOMDuvU3oq0P%3AQUQ3MjNmemxlVERTN3ZWaG9IVmpyYU5IdFpNMjNrc05SUzM1VTBTNkJkemQ1TlF2ZWpoeHItUm1EaXpGNXhOcGZ5cUZDeE0wTkxDck9pNVRZZzhUUHRHLW5Ud0o5Vmd3VUMxTWV1RnRpdjEweVFyMFhDZzlxcVRMX1oycmZvWC05X2QwaVQ0TzBVSUpnaXlNNXYxNkt3SV9aXzlnTXo1aV9R",
                "id": 20
            }
        ];

        // Làm sạch Cookie (Xóa khoảng trắng/xuống dòng thừa)
        const cleanedCookie = JSON.stringify(myCookie);

        await play.setToken({
            youtube: {
                cookie: cleanedCookie
            }
        });
        console.log("✅ Hệ thống mã hóa & Cookie YouTube đã sẵn sàng!");
    } catch (err) {
        console.error("❌ Lỗi cấu hình ban đầu:", err.message);
    }
})();

// 2. WEB SERVER (Tránh lỗi Port bận)
const startServer = (port) => {
    app.get('/', (req, res) => res.send('Bot is running!'));
    const server = app.listen(port, '0.0.0.0', () => {
        console.log(`✅ Web Server: http://localhost:${port}`);
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') startServer(port + 1);
    });
};
startServer(3000);

// 3. HÀM PHÁT NHẠC (Sửa lỗi Invalid URL & Stream)
async function playNext(guildId) {
    const queue = queues.get(guildId);
    if (!queue || queue.songs.length === 0) {
        const conn = getVoiceConnection(guildId);
        if (conn) conn.destroy();
        queues.delete(guildId);
        return;
    }

    const song = queue.songs[0];
    try {
        console.log(`🎵 Đang chuẩn bị luồng cho: ${song.title}`);

        // Ép kiểu stream với cookie đã nạp
        const stream = await play.stream(song.url, { 
            discordPlayerCompatibility: true,
            quality: 1,
            htm: true
        });

        const resource = createAudioResource(stream.stream, { 
            inputType: stream.type,
            inlineVolume: true 
        });
        
        resource.volume.setVolume(0.5);
        queue.player.play(resource);
        queue.connection.subscribe(queue.player);

    } catch (err) {
        console.error("❌ Lỗi phát nhạc:", err.message);
        queue.songs.shift();
        playNext(guildId);
    }
}

// 4. KHỞI TẠO BOT
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
    ]
});

client.once("clientReady", (c) => {
    console.log(`🚀 Bot đã online: ${c.user.tag}`);
});

client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === "play") {
        const query = args.join(" ");
        if (!query) return message.reply("❌ Nhập tên bài hoặc link!");
        if (!message.member.voice.channel) return message.reply("❌ Vào Voice trước nhé!");

        let queue = queues.get(message.guild.id);
        if (!queue) {
            queue = {
                songs: [],
                connection: joinVoiceChannel({
                    channelId: message.member.voice.channel.id,
                    guildId: message.guild.id,
                    adapterCreator: message.guild.voiceAdapterCreator,
                }),
                player: createAudioPlayer()
            };
            queues.set(message.guild.id, queue);

            queue.player.on(AudioPlayerStatus.Idle, () => {
                queue.songs.shift();
                playNext(message.guild.id);
            });
        }

        try {
            const yt = await play.search(query, { limit: 1 });
            if (!yt.length) return message.reply("❌ Không tìm thấy bài này!");
            
            queue.songs.push({ url: yt[0].url, title: yt[0].title });
            if (queue.player.state.status === AudioPlayerStatus.Idle) {
                playNext(message.guild.id);
            }
            message.reply(`✅ Đã thêm: **${yt[0].title}**`);
        } catch (e) {
            message.reply("❌ Lỗi tìm kiếm YouTube!");
        }
    }

    if (command === "stop") {
        const q = queues.get(message.guild.id);
        if (q) {
            q.songs = [];
            q.player.stop();
            q.connection.destroy();
            queues.delete(message.guild.id);
            message.reply("⏹ Đã dừng nhạc.");
        }
    }
});

client.login(process.env.TOKEN);