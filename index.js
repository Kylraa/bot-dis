require("dotenv").config();
const play = require('play-dl');

// Hàm này phải được chạy và đợi (await) xong xuôi
async function authorizeSpotify() {
    try {
        await play.setToken({
            spotify: {
                client_id: process.env.SPOTIFY_ID,
                client_secret: process.env.SPOTIFY_SECRET,
                market: 'VN'
            }
        });

        // Kiểm tra xem token có thực sự hoạt động không
        if (await play.is_expired()) {
            await play.refreshToken();
        }
        console.log("✅ Spotify đã xác thực thành công!");
    } catch (err) {
        console.error("❌ Lỗi Spotify Auth: Kiểm tra lại ID/Secret trong .env!");
    }
}

// Gọi hàm ngay lập tức
authorizeSpotify();

const queues = new Map();
const PREFIX = "n!";

// 2. Hàm cấu hình hệ thống (Gom Spotify + Libsodium vào một chỗ)
// Thay đổi đoạn setupSystem cũ bằng đoạn này
// Cập nhật lại đoạn setupSystem trong index.js
async function setupSystem() {
    await libsodium.ready;
    try {
        await play.setToken({
            spotify: {
                client_id: process.env.SPOTIFY_ID,
                client_secret: process.env.SPOTIFY_SECRET,
                market: 'VN'
            },
            // Giả lập User-Agent để YouTube bớt soi
            youtube: { 
                cookie: "", // Nếu có cookie sạch thì dán vào đây
            }
        });
        
        // Cấu hình play-dl ưu tiên dùng các phương thức lách luật mới nhất
        play.getFreeToken(); 
        
        console.log("🚀 Hệ thống Render đã sẵn sàng!");
    } catch (err) {
        console.error("❌ Lỗi cấu hình:", err.message);
    }
}
setupSystem();

// 3. Hàm xử lý phát bài tiếp theo
async function playNext(guildId) {
    const queue = queues.get(guildId);
    if (!queue || queue.songs.length === 0) {
        getVoiceConnection(guildId)?.destroy();
        queues.delete(guildId);
        return;
    }

    let song = queue.songs[0];
    try {
        // Nếu là Spotify chưa có link, tìm trên YouTube ngay lúc này
        if (song.isSpotify && !song.url) {
            const search = await play.search(song.title, { limit: 1 });
            if (search.length > 0) song.url = search[0].url;
            else throw new Error("Không tìm thấy nhạc trên YouTube");
        }

        const stream = await play.stream(song.url, { discordPlayerCompatibility: true, quality: 1 });
        const resource = createAudioResource(stream.stream, { inputType: stream.type, inlineVolume: true });
        
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

// 4. Sự kiện khi Bot online
client.once("ready", () => {
    console.log(`✅ Bot Online: ${client.user.tag}`);
});

// 5. Xử lý lệnh Play
client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === "play") {
        const query = args.join(" ");
        if (!query || !message.member.voice.channel) {
            return message.reply("❌ Bạn cần nhập link/tên bài và vào phòng Voice!");
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
                    // Search ngay để lấy thông tin title chuẩn
                    const search = await play.search(`${sp_data.name} ${sp_data.artists[0].name}`, { limit: 1 });
                    queue.songs.push({ url: search[0].url, title: sp_data.name });
                    message.reply(`✅ Đã thêm bài hát Spotify: **${sp_data.name}**`);
                } else {
                    const allTracks = await sp_data.all_tracks();
                    message.reply(`⏳ Đang nạp **${allTracks.length}** bài từ Spotify...`);
                    for (const track of allTracks) {
                        queue.songs.push({ 
                            url: null, 
                            title: `${track.name} - ${track.artists[0].name}`, 
                            isSpotify: true 
                        });
                    }
                    message.channel.send(`✅ Đã nạp xong playlist/album!`);
                }
            } else {
                const search = await play.search(query, { limit: 1 });
                if (!search.length) return message.reply("❌ Không tìm thấy bài!");
                queue.songs.push({ url: search[0].url, title: search[0].title });
                message.reply(`✅ Đã thêm: **${search[0].title}**`);
            }

            if (queue.player.state.status === AudioPlayerStatus.Idle) {
                playNext(message.guild.id);
            }
        } catch (e) {
            console.error(e);
            message.reply("❌ Lỗi khi xử lý yêu cầu!");
        }
    }
});

client.login(process.env.TOKEN);
const http = require('http');
http.createServer((req, res) => {
    res.write("Bot is running!");
    res.end();
}).listen(8080); // Render yêu cầu một cổng để giữ service online