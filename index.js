require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const { 
    joinVoiceChannel, 
    createAudioPlayer, 
    createAudioResource, 
    AudioPlayerStatus, 
    getVoiceConnection, 
    NoSubscriberBehavior,
    StreamType
} = require("@discordjs/voice");
const play = require('play-dl');
const libsodium = require('libsodium-wrappers');
const ffmpeg = require('ffmpeg-static');
const fs = require('fs');
const http = require('http');

// Khởi tạo Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const queues = new Map();
const PREFIX = "n!";

// TẠO SERVER GIẢ ĐỂ RENDER KHÔNG "NGỦ"
http.createServer((req, res) => {
    res.write("Bot is alive!");
    res.end();
}).listen(process.env.PORT || 8080);

// CẤU HÌNH HỆ THỐNG
async function setupSystem() {
    await libsodium.ready;
    try {
        let youtubeCookie = "";
        // Kiểm tra và đọc file cookies.txt nếu có
        if (fs.existsSync('./cookies.txt')) {
            youtubeCookie = fs.readFileSync('./cookies.txt', 'utf8');
            console.log("✅ Đã nạp file cookies.txt thành công!");
        } else {
            console.log("⚠️ Không tìm thấy cookies.txt. Bot có thể bị YouTube chặn trên Render.");
        }

        await play.setToken({
            spotify: {
                client_id: process.env.SPOTIFY_ID,
                client_secret: process.env.SPOTIFY_SECRET,
                market: 'VN'
            },
            youtube: { cookie: youtubeCookie }
        });

        console.log("🚀 Hệ thống âm nhạc (FFmpeg Static) đã sẵn sàng!");
    } catch (err) {
        console.error("❌ Lỗi cấu hình:", err.message);
    }
}
setupSystem();

// HÀM PHÁT NHẠC TIẾP THEO
async function playNext(guildId) {
    const queue = queues.get(guildId);
    if (!queue || queue.songs.length === 0) {
        getVoiceConnection(guildId)?.destroy();
        queues.delete(guildId);
        return;
    }

    let song = queue.songs[0];
    try {
        // Nếu là Spotify chưa có link, tìm trên YouTube
        if (song.isSpotify && !song.url) {
            const search = await play.search(song.title, { limit: 1 });
            if (search.length > 0) song.url = search[0].url;
            else throw new Error("Không tìm thấy nhạc trên YouTube");
        }

        // Tạo stream với cấu hình tối ưu cho Discord
        const stream = await play.stream(song.url, { 
            discordPlayerCompatibility: true, 
            quality: 1 
        });

        const resource = createAudioResource(stream.stream, {
            inputType: stream.type,
            inlineVolume: true
        });

        resource.volume.setVolume(0.5);
        queue.player.play(resource);
        queue.connection.subscribe(queue.player);
        
        console.log(`🎵 Đang phát: ${song.title}`);
    } catch (err) {
        console.error("❌ Lỗi PlayNext:", err.message);
        queue.songs.shift();
        playNext(guildId);
    }
}

// SỰ KIỆN KHI BOT ONLINE
client.once("clientReady", (c) => {
    console.log(`✅ Bot Online: ${c.user.tag}`);
});

// XỬ LÝ LỆNH PLAY
client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === "play") {
        const query = args.join(" ");
        if (!query || !message.member.voice.channel) {
            return message.reply("❌ Nhập link/tên bài và vào Voice!");
        }

        let queue = queues.get(message.guild.id);
        if (!queue) {
            queue = {
                songs: [],
                connection: joinVoiceChannel({
                    channelId: message.member.voice.channel.id,
                    guildId: message.guild.id,
                    adapterCreator: message.guild.voiceAdapterCreator,
                }),
                player: createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } })
            };
            queues.set(message.guild.id, queue);
            queue.player.on(AudioPlayerStatus.Idle, () => {
                queue.songs.shift();
                playNext(message.guild.id);
            });
        }

        try {
            const sp_type = play.sp_validate(query);

            if (sp_type && sp_type !== 'search') {
                const sp_data = await play.spotify(query);
                if (sp_type === 'track') {
                    const search = await play.search(`${sp_data.name} ${sp_data.artists[0].name}`, { limit: 1 });
                    queue.songs.push({ url: search[0].url, title: sp_data.name });
                    message.reply(`✅ Đã thêm bài hát Spotify: **${sp_data.name}**`);
                } else {
                    const allTracks = await sp_data.all_tracks();
                    message.reply(`⏳ Đang nạp **${allTracks.length}** bài từ Spotify...`);
                    for (const track of allTracks) {
                        queue.songs.push({ url: null, title: `${track.name} - ${track.artists[0].name}`, isSpotify: true });
                    }
                    message.channel.send(`✅ Đã nạp xong playlist!`);
                }
            } else {
                const search = await play.search(query, { limit: 1 });
                if (!search.length) return message.reply("❌ Không tìm thấy bài!");
                queue.songs.push({ url: search[0].url, title: search[0].title });
                message.reply(`✅ Đã thêm: **${search[0].title}**`);
            }

            if (queue.player.state.status === AudioPlayerStatus.Idle) playNext(message.guild.id);
        } catch (e) {
            console.error(e);
            message.reply("❌ Lỗi khi xử lý link (Kiểm tra lại Cookie/IP)!");
        }
    }
});

client.login(process.env.TOKEN);