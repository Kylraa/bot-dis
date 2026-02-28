require("dotenv").config();
// 1. LUÔN LUÔN KHAI BÁO THƯ VIỆN TRÊN CÙNG
const { Client, GatewayIntentBits } = require("discord.js");
const { 
    joinVoiceChannel, 
    createAudioPlayer, 
    createAudioResource, 
    AudioPlayerStatus, 
    VoiceConnectionStatus, 
    getVoiceConnection 
} = require("@discordjs/voice");
const play = require('play-dl');
const express = require('express');
const libsodium = require('libsodium-wrappers');

// 2. KHỞI TẠO APP EXPRESS
const app = express();
const PREFIX = "n!";
const queues = new Map();

// 3. BÂY GIỜ MỚI GỌI HÀM KHỞI TẠO (Sau khi libsodium đã được định nghĩa)
(async () => {
    try {
        await libsodium.ready;
        
        // Chuỗi JSON gốc (giữ nguyên nội dung của bạn)
        const rawCookie = `[
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
        ]`;

        // LÀM SẠCH COOKIE: Xóa bỏ các dấu xuống dòng và khoảng trắng thừa
        const cleanedCookie = JSON.stringify(JSON.parse(rawCookie));

        await play.setToken({
            youtube: {
                cookie: cleanedCookie
            }
        });
        console.log("✅ Hệ thống mã hóa & Cookie YouTube đã được làm sạch và sẵn sàng!");
    } catch (err) {
        console.error("❌ Lỗi cấu hình Cookie:", err.message);
    }
})();

// 4. WEB SERVER
const startServer = (port) => {
    app.get('/', (req, res) => res.send('Bot is online!'));
    app.listen(port, '0.0.0.0', () => {
        console.log(`✅ Web Server chạy tại port: ${port}`);
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            startServer(port + 1);
        }
    });
};
startServer(3000);

// 5. HÀM PHÁT NHẠC
async function playNext(guildId) {
    const queue = queues.get(guildId);
    if (!queue || queue.songs.length === 0) {
        const connection = getVoiceConnection(guildId);
        if (connection) connection.destroy();
        queues.delete(guildId);
        return;
    }

    const song = queue.songs[0];
    try {
        console.log(`🎵 Đang chuẩn bị luồng cho: ${song.title}`);
        
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
        console.error("❌ Lỗi stream bài hát:", err.message);
        queue.songs.shift();
        playNext(guildId);
    }
}

// 6. KHỞI TẠO BOT CLIENT
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
    ]
});

client.once("ready", () => {
    console.log(`🚀 Bot đã online: ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === "play") {
        const query = args.join(" ");
        if (!query) return message.reply("❌ Nhập tên bài hoặc link!");
        if (!message.member.voice.channel) return message.reply("❌ Bạn phải vào voice trước!");

        let queue = queues.get(message.guild.id);
        if (!queue) {
            const player = createAudioPlayer();
            queue = {
                songs: [],
                connection: joinVoiceChannel({
                    channelId: message.member.voice.channel.id,
                    guildId: message.guild.id,
                    adapterCreator: message.guild.voiceAdapterCreator,
                }),
                player: player
            };
            queues.set(message.guild.id, queue);

            player.on(AudioPlayerStatus.Idle, () => {
                queue.songs.shift();
                playNext(message.guild.id);
            });

            player.on('error', error => {
                console.error(`Lỗi Player: ${error.message}`);
            });
        }

        try {
            const yt = await play.search(query, { limit: 1 });
            if (!yt || yt.length === 0) return message.reply("❌ Không tìm thấy bài hát!");
            
            queue.songs.push({ url: yt[0].url, title: yt[0].title });
            
            if (queue.player.state.status === AudioPlayerStatus.Idle) {
                playNext(message.guild.id);
            }
            message.reply(`✅ Đã thêm: **${yt[0].title}**`);
        } catch (e) {
            console.error(e);
            message.reply("❌ Lỗi tìm kiếm!");
        }
    }

    if (command === "stop") {
        const queue = queues.get(message.guild.id);
        if (queue) {
            queue.songs = [];
            queue.player.stop();
            if (queue.connection) queue.connection.destroy();
            queues.delete(message.guild.id);
            message.reply("⏹ Đã dừng nhạc.");
        }
    }
});

client.login(process.env.TOKEN);