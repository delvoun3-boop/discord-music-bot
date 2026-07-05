const { Client, GatewayIntentBits, SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const ytdl = require('ytdl-core');

const queue = new Map();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once('ready', () => {
    console.log(`✅ Bot ${client.user.tag} sudah online!`);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) {
        return interaction.reply({ content: '❌ Masuk voice channel dulu!', ephemeral: true });
    }

    const serverQueue = queue.get(interaction.guild.id);

    if (interaction.commandName === 'play') {
        const query = interaction.options.getString('query');
        await interaction.deferReply();

        try {
            const songInfo = await ytdl.getInfo(query);
            const song = {
                title: songInfo.videoDetails.title,
                url: songInfo.videoDetails.video_url
            };

            if (!serverQueue) {
                const queueConstruct = { textChannel: interaction.channel, voiceChannel, songs: [], connection: null, player: null };
                queue.set(interaction.guild.id, queueConstruct);
                queueConstruct.songs.push(song);

                const connection = joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: interaction.guild.id,
                    adapterCreator: interaction.guild.voiceAdapterCreator,
                });
                queueConstruct.connection = connection;
                playSong(interaction.guild, queueConstruct.songs[0]);
                await interaction.editReply(`🎵 **Memutar:** ${song.title}`);
            } else {
                serverQueue.songs.push(song);
                await interaction.editReply(`✅ **Ditambahkan:** ${song.title}`);
            }
        } catch (e) {
            console.error(e);
            await interaction.editReply('❌ Gagal! Coba link YouTube biasa (bukan Shorts).');
        }
    } 
    else if (interaction.commandName === 'skip') {
        if (serverQueue && serverQueue.player) {
            serverQueue.player.stop();
            interaction.reply('⏭️ Lagu diskip!');
        }
    } 
    else if (interaction.commandName === 'stop') {
        if (serverQueue) {
            serverQueue.songs = [];
            if (serverQueue.player) serverQueue.player.stop();
            if (serverQueue.connection) serverQueue.connection.destroy();
            queue.delete(interaction.guild.id);
            interaction.reply('🛑 Stopped!');
        }
    }
});

function playSong(guild, song) {
    const serverQueue = queue.get(guild.id);
    if (!song) {
        serverQueue.connection.destroy();
        queue.delete(guild.id);
        return;
    }

    const resource = createAudioResource(ytdl(song.url, { filter: 'audioonly' }));
    const player = createAudioPlayer();
    serverQueue.player = player;
    player.play(resource);
    serverQueue.connection.subscribe(player);

    player.on(AudioPlayerStatus.Idle, () => {
        serverQueue.songs.shift();
        playSong(guild, serverQueue.songs[0]);
    });

    serverQueue.textChannel.send(`🎶 **Sedang memutar:** ${song.title}`);
}

client.login(process.env.TOKEN);
