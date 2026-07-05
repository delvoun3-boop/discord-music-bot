const { Client, GatewayIntentBits, SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const play = require('play-dl');

const queue = new Map();

// Register Slash Commands
const { REST, Routes } = require('discord.js');

const commands = [
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('Putar lagu')
        .addStringOption(option => 
            option.setName('query')
                .setDescription('Judul lagu atau link')
                .setRequired(true)
        ),
    new SlashCommandBuilder().setName('skip').setDescription('Skip lagu'),
    new SlashCommandBuilder().setName('stop').setDescription('Stop musik')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
    try {
        console.log('Sedang mendaftarkan slash commands...');
        await rest.put(Routes.applicationCommands('1523105356966793356'), { body: commands });
        console.log('✅ Slash commands berhasil didaftarkan!');
    } catch (error) {
        console.error(error);
    }
})();

// Main Bot
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
            const search = await play.search(query, { limit: 1 });
            const song = search[0];

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
            await interaction.editReply('❌ Gagal memutar lagu!');
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
            interaction.reply('🛑 Musik dihentikan!');
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

    play.stream(song.url).then(stream => {
        const resource = createAudioResource(stream.stream, { inputType: stream.type });
        const player = createAudioPlayer();
        serverQueue.player = player;
        player.play(resource);
        serverQueue.connection.subscribe(player);

        player.on(AudioPlayerStatus.Idle, () => {
            serverQueue.songs.shift();
            playSong(guild, serverQueue.songs[0]);
        });
    });

    serverQueue.textChannel.send(`🎶 **Sedang memutar:** ${song.title}`);
}

client.login(process.env.TOKEN);
