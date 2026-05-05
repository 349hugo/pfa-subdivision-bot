require("dotenv").config();

const { Client, Events, GatewayIntentBits } = require("discord.js");

const { loadConfig } = require("./config");
const { createApplicationsFeature } = require("./features/applications");

const config = loadConfig(process.env);
const features = [createApplicationsFeature({ config })];
const commands = features.flatMap((feature) => feature.commands || []);

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Bot listo como ${readyClient.user.tag}`);

  try {
    const guild = await readyClient.guilds.fetch(config.guildId);
    await guild.commands.set(commands.map((command) => command.toJSON()));
    console.log(`Comandos registrados en el servidor ${guild.name}`);

    for (const feature of features) {
      if (typeof feature.onReady === "function") {
        await feature.onReady(readyClient);
      }
    }
  } catch (error) {
    console.error("No pude completar la inicializacion del bot.", error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    for (const feature of features) {
      if (typeof feature.handleInteraction !== "function") {
        continue;
      }

      const handled = await feature.handleInteraction(interaction);
      if (handled) {
        return;
      }
    }
  } catch (error) {
    console.error("Ocurrio un error procesando la interaccion.", error);

    const payload = {
      content: "Hubo un problema al procesar la solicitud. Intentalo otra vez.",
      ephemeral: true,
    };

    if (interaction.isRepliable()) {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload).catch(() => null);
      } else {
        await interaction.reply(payload).catch(() => null);
      }
    }
  }
});

client.login(config.token);
