const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require("discord.js");

const IDS = {
  verifyButton: "verification_claim_role",
};

const EMBED_COLORS = {
  primary: 0x5865f2,
  success: 0x57f287,
  danger: 0xed4245,
  warning: 0xf5b041,
};

function createVerificationFeature({ config }) {
  const commands = [
    new SlashCommandBuilder()
      .setName("panel-verificacion")
      .setDescription("Publica el panel de verificacion en el canal configurado")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  ];

  async function handleInteraction(interaction) {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "panel-verificacion") {
        await sendVerificationPanel(interaction);
        return true;
      }

      return false;
    }

    if (interaction.isButton()) {
      if (interaction.customId === IDS.verifyButton) {
        await handleVerificationButton(interaction);
        return true;
      }
    }

    return false;
  }

  async function sendVerificationPanel(interaction) {
    const verificationChannel = await interaction.client.channels
      .fetch(config.verification.channelId)
      .catch(() => null);

    if (!verificationChannel || !verificationChannel.isTextBased()) {
      await interaction.reply({
        embeds: [
          buildNoticeEmbed({
            color: EMBED_COLORS.danger,
            title: "Canal no disponible",
            description:
              "No pude encontrar el canal configurado para verificacion. Revisa VERIFICATION_CHANNEL_ID.",
          }),
        ],
        ephemeral: true,
      });
      return;
    }

    const panelEmbed = new EmbedBuilder()
      .setColor(EMBED_COLORS.primary)
      .setTitle("Verificacion del servidor")
      .setDescription(
        "Pulsa el boton de abajo para verificarte y recibir acceso al resto del servidor.",
      )
      .addFields(
        {
          name: "Rol que recibes",
          value: config.verification.roleName,
        },
        {
          name: "Importante",
          value:
            "Este panel es para usuarios nuevos. Si ya estas verificado, el bot no te dara el rol otra vez.",
        },
      )
      .setFooter({ text: "Si el boton falla, avisa a un staff." });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(IDS.verifyButton)
        .setLabel("Verificarme")
        .setStyle(ButtonStyle.Success),
    );

    await verificationChannel.send({
      embeds: [panelEmbed],
      components: [row],
    });

    await interaction.reply({
      embeds: [
        buildNoticeEmbed({
          color: EMBED_COLORS.success,
          title: "Panel publicado",
          description: `El panel de verificacion fue enviado a <#${config.verification.channelId}>.`,
        }),
      ],
      ephemeral: true,
    });
  }

  async function handleVerificationButton(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: "Este boton solo funciona dentro del servidor.",
        ephemeral: true,
      });
      return;
    }

    const member = await interaction.guild.members
      .fetch(interaction.user.id)
      .catch(() => null);

    if (!member) {
      await interaction.reply({
        content: "No pude encontrarte dentro del servidor.",
        ephemeral: true,
      });
      return;
    }

    await interaction.guild.roles.fetch().catch(() => null);

    const verifiedRole = findRoleByName(interaction.guild, config.verification.roleName);

    if (!verifiedRole) {
      await interaction.reply({
        embeds: [
          buildNoticeEmbed({
            color: EMBED_COLORS.danger,
            title: "Rol no encontrado",
            description:
              `No pude encontrar el rol ${config.verification.roleName}. Revisa VERIFIED_ROLE_NAME.`,
          }),
        ],
        ephemeral: true,
      });
      return;
    }

    if (member.roles.cache.has(verifiedRole.id)) {
      await interaction.reply({
        embeds: [
          buildNoticeEmbed({
            color: EMBED_COLORS.warning,
            title: "Ya estabas verificado",
            description: `Ya tienes el rol ${config.verification.roleName}.`,
          }),
        ],
        ephemeral: true,
      });
      return;
    }

    try {
      await member.roles.add(verifiedRole);
    } catch (error) {
      console.error("No pude asignar el rol de verificacion.", error);

      await interaction.reply({
        embeds: [
          buildNoticeEmbed({
            color: EMBED_COLORS.danger,
            title: "No pude verificarte",
            description:
              "No pude darte el rol de verificacion. Revisa permisos y jerarquia del bot.",
          }),
        ],
        ephemeral: true,
      });
      return;
    }

    const nonEveryoneRoles = member.roles.cache.filter(
      (role) => role.id !== interaction.guild.id,
    );

    await interaction.reply({
      embeds: [
        buildNoticeEmbed({
          color: EMBED_COLORS.success,
          title: "Verificacion completada",
          description: `Ya recibiste el rol ${config.verification.roleName}. Bienvenido.`,
          fields: [
            {
              name: "Roles actuales",
              value: nonEveryoneRoles.map((role) => role.name).join(", "),
            },
          ],
        }),
      ],
      ephemeral: true,
    });
  }

  return {
    commands,
    handleInteraction,
  };
}

function buildNoticeEmbed({ color, title, description, fields = [] }) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description);

  if (fields.length > 0) {
    embed.addFields(fields);
  }

  return embed;
}

function normalizeValue(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findRoleByName(guild, roleName) {
  const normalizedTargetRoleName = normalizeValue(roleName);

  return guild.roles.cache.find(
    (role) => normalizeValue(role.name) === normalizedTargetRoleName,
  );
}

module.exports = {
  createVerificationFeature,
};
