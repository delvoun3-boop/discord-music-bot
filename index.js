const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
const ytdl = require('ytdl-core');
const queue = new Map();

const { REST, Routes } = require('discord.js');

const commands = [
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('Putar lagu dari YouTube')
        .addStringOption(option => 
            option.setName('query')
                .setDescription('Judul lagu atau link YouTube')
                .setRequired(true)
        ),
    new SlashCommandBuilder().setName('skip').setDescription('Skip lagu yang sedang diputar'),
    new SlashCommandBuilder().setName('stop').setDescription('Stop musik dan keluar voice channel')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken('MTUyMzEwNTM1Njk2Njc5MzM1Ng.GlPFYh.sL950VzJ_vocxzQkTgwPhRc2Qa3bE8SgAk1L8Q');

(async () => {
    try {
        console.log('Sedang mendaftarkan slash commands...');
        await rest.put(
            Routes.applicationCommands('1523105356966793356'), 
            { body: commands }
        );
        console.log('✅ Slash commands berhasil didaftarkan!');
    } catch (error) {
        console.error(error);
    }
})();

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

    const { commandName } = interaction;
    const voiceChannel = interaction.member.voice.channel;

    if (!voiceChannel) {
        return interaction.reply({ content: '❌ Kamu harus masuk voice channel dulu!', ephemeral: true });
    }

    const serverQueue = queue.get(interaction.guild.id);

    if (commandName === 'play') {
        const query = interaction.options.getString('query');
        await interaction.deferReply();

        try {
            const songInfo = await ytdl.getInfo(query);
            const song = {
                title: songInfo.videoDetails.title,
                url: songInfo.videoDetails.video_url,
                duration: songInfo.videoDetails.lengthSeconds
            };

            if (!serverQueue) {
                const queueConstruct = {
                    textChannel: interaction.channel,
                    voiceChannel: voiceChannel,
                    connection: null,
                    songs: [],
                    player: null
                };

                queue.set(interaction.guild.id, queueConstruct);
                queueConstruct.songs.push(song);

                try {
                    const connection = joinVoiceChannel({
                        channelId: voiceChannel.id,
                        guildId: interaction.guild.id,
                        adapterCreator: interaction.guild.voiceAdapterCreator,
                    });

                    queueConstruct.connection = connection;
                    playSong(interaction.guild, queueConstruct.songs[0]);
                    await interaction.editReply(`🎵 **Mulai memutar:** ${song.title}`);
                } catch (err) {
                    console.error(err);
                    queue.delete(interaction.guild.id);
                }
            } else {
                serverQueue.songs.push(song);
                await interaction.editReply(`✅ **Ditambahkan ke antrian:** ${song.title}`);
            }
        } catch (error) {
            console.error(error);
            await interaction.editReply('❌ Gagal mencari lagu!');
        }
    }

    else if (commandName === 'skip') {
        if (!serverQueue || !serverQueue.songs.length) return interaction.reply('Tidak ada lagu yang sedang diputar!');
        serverQueue.player.stop();
        interaction.reply('⏭️ Lagu diskip!');
    }

    else if (commandName === 'pause') {
        if (serverQueue && serverQueue.player) {
            serverQueue.player.pause();
            interaction.reply('⏸️ Musik dijeda!');
        }
    }

    else if (commandName === 'resume') {
        if (serverQueue && serverQueue.player) {
            serverQueue.player.unpause();
            interaction.reply('▶️ Musik dilanjutkan!');
        }
    }

    else if (commandName === 'stop') {
        if (serverQueue) {
            serverQueue.songs = [];
            if (serverQueue.player) serverQueue.player.stop();
            if (serverQueue.connection) serverQueue.connection.destroy();
            queue.delete(interaction.guild.id);
            interaction.reply('🛑 Musik dihentikan dan bot keluar!');
        }
    }

    else if (commandName === 'queue') {
        if (!serverQueue || serverQueue.songs.length === 0) return interaction.reply('Antrian kosong!');
        
        const embed = new EmbedBuilder()
            .setTitle('📜 Antrian Lagu')
            .setDescription(serverQueue.songs.map((song, i) => `${i + 1}. ${song.title}`).join('\n'))
            .setColor(0x00ff00);
        
        interaction.reply({ embeds: [embed] });
    }
});

function playSong(guild, song) {
    const serverQueue = queue.get(guild.id);
    if (!song) {
        serverQueue.connection.destroy();
        queue.delete(guild.id);
        return;
    }

    const resource = createAudioResource(ytdl(song.url, { filter: 'audioonly', quality: 'highestaudio' }));
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

client.login('MTUyMzEwNTM1Njk2Njc5MzM1Ng.GlPFYh.sL950VzJ_vocxzQkTgwPhRc2Qa3bE8SgAk1L8Q');