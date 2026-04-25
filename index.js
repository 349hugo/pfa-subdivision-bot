require("dotenv").config();

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

const requiredEnv = ["DISCORD_TOKEN", "GUILD_ID", "LOG_CHANNEL_ID"];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);

if (missingEnv.length > 0) {
  console.error(
    `Faltan variables de entorno: ${missingEnv.join(", ")}. Revisa tu archivo .env.`,
  );
  process.exit(1);
}

const APPLICATION_NAME = process.env.APPLICATION_NAME || "PFA-SUBDIVISION";
const OPEN_MODAL_BUTTON_ID = "open_application_modal";
const STEP_1_MODAL_ID = "application_step_1";
const STEP_2_MODAL_ID = "application_step_2";
const STEP_3_MODAL_ID = "application_step_3";
const CONTINUE_STEP_2_BUTTON_ID = "continue_application_step_2";
const CONTINUE_STEP_3_BUTTON_ID = "continue_application_step_3";
const REVIEW_BUTTON_PREFIX = "review_application";
const COOLDOWN_DURATION_MS = 72 * 60 * 60 * 1000;
const COOLDOWN_LOOKUP_LIMIT = 500;
const EMBED_COLORS = {
  primary: 0x5865f2,
  success: 0x57f287,
  warning: 0xf5b041,
  danger: 0xed4245,
};
const APPROVED_TEXT =
  "Desde el departamento de subdivisiones tenemos el agrado de confirmar que su postulacion escrita ha sido aprobada, bienvenido.";
const REJECTED_TEXT =
  "Desde el departamento de Subdivisiones lamentamos informarle que su postulacion escrita ha sido desaprobada. Debes esperar 72hs para volver a enviarla nuevamente.";

const RESULT_CHANNEL_IDS = {
  geof: process.env.RESULTS_GEOF_CHANNEL_ID,
  halcon: process.env.RESULTS_HALCON_CHANNEL_ID,
};

const REVIEW_MENTION_ROLE_NAMES = parseRoleNames(
  process.env.REVIEW_MENTION_ROLE_NAMES || "Head Halcon,Head Geof",
);
const UPDATE_CHANNEL_IDS = {
  geof: process.env.UPDATES_GEOF_CHANNEL_ID || "1493838384416952392",
  halcon: process.env.UPDATES_HALCON_CHANNEL_ID || "1493446131663896626",
};
const UPDATE_ROLE_NAMES = {
  geof: process.env.UPDATES_GEOF_ROLE_NAME || "Tactico",
  halcon: process.env.UPDATES_HALCON_ROLE_NAME || "Cadete Halcon",
};

const COOLDOWN_MANAGER_ROLE_NAMES = parseRoleNames(
  process.env.COOLDOWN_MANAGER_ROLE_NAMES || "🦅・Head Halcon,🪽・Head Geof",
);

const ROLE_NAMES_BY_SUBDIVISION = {
  geof: parseRoleNames(process.env.GEOF_ROLE_NAMES || "G.E.O.F,tactico"),
  halcon: parseRoleNames(
    process.env.HALCON_ROLE_NAMES || "HALCON,cadete Halcon",
  ),
};

const STEP_1_QUESTIONS = [
  {
    id: "ic_name",
    label: "Nombre IC",
    placeholder: "Escribe tu nombre IC",
    style: TextInputStyle.Short,
    minLength: 2,
    maxLength: 100,
  },
  {
    id: "maturity",
    label: "Nivel de madurez (1-10)",
    placeholder: "Ej. 8",
    style: TextInputStyle.Short,
    minLength: 1,
    maxLength: 2,
  },
  {
    id: "tactic_level",
    label: "Nivel de tactica (1-10)",
    placeholder: "Ej. 7",
    style: TextInputStyle.Short,
    minLength: 1,
    maxLength: 2,
  },
  {
    id: "sanctions",
    label: "Has sido sancionado? (si/no)",
    placeholder: "Escribe si o no",
    style: TextInputStyle.Short,
    minLength: 2,
    maxLength: 10,
  },
  {
    id: "rank",
    label: "Que rango eres?",
    placeholder: "Ej. Cabo",
    style: TextInputStyle.Short,
    minLength: 2,
    maxLength: 60,
  },
];

const STEP_2_QUESTIONS = [
  {
    id: "subdivision",
    label: "Que subdivision quieres? (Halcon/Geof)",
    placeholder: "Ej. Halcon",
    style: TextInputStyle.Short,
    minLength: 4,
    maxLength: 20,
  },
  {
    id: "contribution",
    label: "Que puedes aportar a la subdivision?",
    placeholder: "Explica que puedes aportar",
    style: TextInputStyle.Paragraph,
    minLength: 10,
    maxLength: 500,
  },
  {
    id: "tactical_experience",
    label: "Sabes jugar con tactica?",
    placeholder: "Explica brevemente tu experiencia",
    style: TextInputStyle.Paragraph,
    minLength: 5,
    maxLength: 500,
  },
  {
    id: "motivation",
    label: "Por que quieres entrar a la subdivision?",
    placeholder: "Explica por que quieres entrar",
    style: TextInputStyle.Paragraph,
    minLength: 10,
    maxLength: 500,
  },
  {
    id: "weekly_hours",
    label: "Horas semanales que le dedicarias",
    placeholder: "Ej. 15 horas",
    style: TextInputStyle.Short,
    minLength: 1,
    maxLength: 50,
  },
];

const STEP_3_QUESTIONS = [
  {
    id: "time_in_kilombo",
    label: "Cuanto tiempo tienes en Kilombo?",
    placeholder: "Ej. 6 meses",
    style: TextInputStyle.Short,
    minLength: 2,
    maxLength: 60,
  },
];

const ALL_QUESTIONS = [
  ...STEP_1_QUESTIONS,
  ...STEP_2_QUESTIONS,
  ...STEP_3_QUESTIONS,
];

const applicationSessions = new Map();
const activeReapplyCooldowns = new Map();

const commands = [
  new SlashCommandBuilder()
    .setName("panel-postulacion")
    .setDescription("Publica el panel para que los usuarios se postulen")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("postularme")
    .setDescription("Abre el formulario de postulacion"),
  new SlashCommandBuilder()
    .setName("quitar-cooldown")
    .setDescription("Quita manualmente el cooldown de repostulacion a un usuario")
    .addUserOption((option) =>
      option
        .setName("usuario")
        .setDescription("Usuario al que quieres quitarle el cooldown")
        .setRequired(true),
    ),
];

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Bot listo como ${readyClient.user.tag}`);

  try {
    const guild = await readyClient.guilds.fetch(process.env.GUILD_ID);
    await guild.commands.set(commands.map((command) => command.toJSON()));
    console.log(`Comandos registrados en el servidor ${guild.name}`);

    const activeCooldownCount = await hydrateReapplyCooldowns(readyClient);
    console.log(`Cooldowns activos cargados: ${activeCooldownCount}`);
  } catch (error) {
    console.error("No pude registrar los comandos del servidor.", error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "panel-postulacion") {
        await sendApplicationPanel(interaction);
        return;
      }

      if (interaction.commandName === "postularme") {
        await tryStartApplication(interaction);
        return;
      }

      if (interaction.commandName === "quitar-cooldown") {
        await handleRemoveCooldownCommand(interaction);
      }

      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId === OPEN_MODAL_BUTTON_ID) {
        await tryStartApplication(interaction);
      }

      if (interaction.customId === CONTINUE_STEP_2_BUTTON_ID) {
        await interaction.showModal(
          buildApplicationModal({
            customId: STEP_2_MODAL_ID,
            title: `Formulario de ${APPLICATION_NAME} - Paso 2`,
            questions: STEP_2_QUESTIONS,
          }),
        );
      }

      if (interaction.customId === CONTINUE_STEP_3_BUTTON_ID) {
        await interaction.showModal(
          buildApplicationModal({
            customId: STEP_3_MODAL_ID,
            title: `Formulario de ${APPLICATION_NAME} - Paso 3`,
            questions: STEP_3_QUESTIONS,
          }),
        );
      }

      if (interaction.customId.startsWith(REVIEW_BUTTON_PREFIX)) {
        await handleReviewButton(interaction);
      }

      return;
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === STEP_1_MODAL_ID) {
        await handleStepOneSubmission(interaction);
        return;
      }

      if (interaction.customId === STEP_2_MODAL_ID) {
        await handleStepTwoSubmission(interaction);
        return;
      }

      if (interaction.customId === STEP_3_MODAL_ID) {
        await handleFinalSubmission(interaction);
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

function buildApplicationModal({ customId, title, questions }) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);

  questions.forEach((question) => {
    const input = new TextInputBuilder()
      .setCustomId(question.id)
      .setLabel(question.label)
      .setPlaceholder(question.placeholder)
      .setRequired(true)
      .setStyle(question.style)
      .setMinLength(question.minLength)
      .setMaxLength(question.maxLength);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
  });

  return modal;
}

async function sendApplicationPanel(interaction) {
  const panelEmbed = new EmbedBuilder()
    .setColor(EMBED_COLORS.primary)
    .setTitle(`📝 Formulario de Postulacion ${APPLICATION_NAME}`)
    .setDescription(
      "Pulsa el boton de abajo para abrir el formulario.\nSe completa en 3 pasos y llega al canal de revision automaticamente.",
    )
    .addFields(
      {
        name: "📋 Que se solicita",
        value:
          "Datos IC, tactica, subdivision, experiencia y disponibilidad.",
      },
      {
        name: "🛡️ Importante",
        value:
          "No compartas contrasenas ni informacion confidencial en ninguna respuesta.",
      },
    )
    .setFooter({ text: "Solo necesitas pulsar el boton para comenzar." });

  const buttonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(OPEN_MODAL_BUTTON_ID)
      .setLabel("📝 Postularme")
      .setStyle(ButtonStyle.Primary),
  );

  await interaction.channel.send({
    embeds: [panelEmbed],
    components: [buttonRow],
  });

  await interaction.reply({
    embeds: [
      buildNoticeEmbed({
        color: EMBED_COLORS.success,
        title: "✅ Panel publicado",
        description: "El panel de postulacion ya fue enviado a este canal.",
      }),
    ],
    ephemeral: true,
  });
}

async function handleStepOneSubmission(interaction) {
  const answers = collectAnswers(interaction, STEP_1_QUESTIONS);
  const validationError = validateStepOneAnswers(answers);

  if (validationError) {
    await interaction.reply({
      content: validationError,
      ephemeral: true,
    });
    return;
  }

  applicationSessions.set(interaction.user.id, {
    answers,
    createdAt: Date.now(),
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CONTINUE_STEP_2_BUTTON_ID)
      .setLabel("➡️ Continuar al paso 2")
      .setStyle(ButtonStyle.Primary),
  );

  await interaction.reply({
    embeds: [
      buildNoticeEmbed({
        color: EMBED_COLORS.success,
        title: "✅ Paso 1 completado",
        description: "Pulsa el boton para seguir con el paso 2 del formulario.",
      }),
    ],
    components: [row],
    ephemeral: true,
  });
}

async function handleStepTwoSubmission(interaction) {
  const session = applicationSessions.get(interaction.user.id);

  if (!session) {
    await interaction.reply({
      content:
        "No encontre tu postulacion en curso. Vuelve a empezar con /postularme.",
      ephemeral: true,
    });
    return;
  }

  const answers = collectAnswers(interaction, STEP_2_QUESTIONS);
  const validationError = validateStepTwoAnswers(answers);

  if (validationError) {
    await interaction.reply({
      content: validationError,
      ephemeral: true,
    });
    return;
  }

  session.answers = {
    ...session.answers,
    ...answers,
  };
  session.updatedAt = Date.now();
  applicationSessions.set(interaction.user.id, session);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CONTINUE_STEP_3_BUTTON_ID)
      .setLabel("➡️ Continuar al paso 3")
      .setStyle(ButtonStyle.Primary),
  );

  await interaction.reply({
    embeds: [
      buildNoticeEmbed({
        color: EMBED_COLORS.success,
        title: "✅ Paso 2 completado",
        description: "Pulsa el boton para terminar tu postulacion en el paso 3.",
      }),
    ],
    components: [row],
    ephemeral: true,
  });
}

async function handleFinalSubmission(interaction) {
  const session = applicationSessions.get(interaction.user.id);

  if (!session) {
    await interaction.reply({
      content:
        "No encontre tu postulacion en curso. Vuelve a empezar con /postularme.",
      ephemeral: true,
    });
    return;
  }

  const finalAnswers = collectAnswers(interaction, STEP_3_QUESTIONS);
  const answers = {
    ...session.answers,
    ...finalAnswers,
  };

  const logChannel = await interaction.client.channels
    .fetch(process.env.LOG_CHANNEL_ID)
    .catch(() => null);

  if (!logChannel || !logChannel.isTextBased()) {
    await interaction.reply({
      content:
        "No encontre el canal de logs. Revisa LOG_CHANNEL_ID y los permisos del bot.",
      ephemeral: true,
    });
    return;
  }

  const logEmbed = new EmbedBuilder()
    .setColor(EMBED_COLORS.primary)
    .setTitle(`📥 Nueva postulacion para ${APPLICATION_NAME}`)
    .setDescription(`Solicitud enviada por ${interaction.user}`)
    .setThumbnail(interaction.user.displayAvatarURL())
    .addFields(
      {
        name: "Usuario",
        value: `${interaction.user.tag}\nID: ${interaction.user.id}`,
      },
      ...ALL_QUESTIONS.map((question) => ({
        name: question.label,
        value: answers[question.id],
      })),
      {
        name: "Estado",
        value: "⏳ Pendiente de revision",
      },
    )
    .setFooter({ text: "Usa los botones de abajo para revisar la postulacion." })
    .setTimestamp();

  const subdivision = normalizeAnswer(answers.subdivision);
  const reviewRow = buildReviewButtons(subdivision, interaction.user.id);
  const reviewMentionRoles = await resolveRolesByNames(
    interaction.guild,
    REVIEW_MENTION_ROLE_NAMES,
  );

  await logChannel.send({
    content: buildRoleMentionContent(reviewMentionRoles.roles),
    allowedMentions: buildRoleAllowedMentions(reviewMentionRoles.roles),
    embeds: [logEmbed],
    components: [reviewRow],
  });

  applicationSessions.delete(interaction.user.id);

  await interaction.reply({
    embeds: [
      buildNoticeEmbed({
        color: EMBED_COLORS.success,
        title: "✅ Postulacion enviada",
        description:
          "Tu postulacion fue enviada correctamente. Quedara en revision del departamento.",
      }),
    ],
    ephemeral: true,
  });
}

function collectAnswers(interaction, questions) {
  return Object.fromEntries(
    questions.map((question) => [
      question.id,
      interaction.fields.getTextInputValue(question.id).trim(),
    ]),
  );
}

function validateStepOneAnswers(answers) {
  const maturity = Number.parseInt(answers.maturity, 10);
  if (!Number.isInteger(maturity) || maturity < 1 || maturity > 10) {
    return "El nivel de madurez debe ser un numero del 1 al 10.";
  }

  const tacticLevel = Number.parseInt(answers.tactic_level, 10);
  if (!Number.isInteger(tacticLevel) || tacticLevel < 1 || tacticLevel > 10) {
    return "El nivel de tactica debe ser un numero del 1 al 10.";
  }

  if (!isYesOrNo(answers.sanctions)) {
    return "En sanciones debes responder solo si o no.";
  }

  return null;
}

function validateStepTwoAnswers(answers) {
  const normalizedSubdivision = normalizeAnswer(answers.subdivision);
  if (!["halcon", "geof"].includes(normalizedSubdivision)) {
    return "La subdivision debe ser Halcon o Geof.";
  }

  return null;
}

function isYesOrNo(value) {
  return ["si", "no"].includes(normalizeAnswer(value));
}

function normalizeAnswer(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function buildReviewButtons(subdivision, userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(
        `${REVIEW_BUTTON_PREFIX}:approve:${subdivision}:${userId}`,
      )
      .setLabel("✅ Aprobar")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(
        `${REVIEW_BUTTON_PREFIX}:reject:${subdivision}:${userId}`,
      )
      .setLabel("❌ Rechazar")
      .setStyle(ButtonStyle.Danger),
  );
}

async function handleReviewButton(interaction) {
  const [, action, subdivision, applicantId] = interaction.customId.split(":");

  if (!["approve", "reject"].includes(action) || !applicantId) {
    await interaction.reply({
      content: "No pude entender esta accion.",
      ephemeral: true,
    });
    return;
  }

  const resultChannelId = RESULT_CHANNEL_IDS[subdivision];
  if (!resultChannelId) {
    await interaction.reply({
      content:
        "Falta configurar el canal de resultados de esta subdivision en el archivo .env.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferUpdate();

  const resultChannel = await interaction.client.channels
    .fetch(resultChannelId)
    .catch(() => null);

  if (!resultChannel || !resultChannel.isTextBased()) {
    await interaction.followUp({
      content:
        "No pude encontrar el canal de resultados configurado para esta subdivision.",
      ephemeral: true,
    });
    return;
  }

  const member = await interaction.guild.members.fetch(applicantId).catch(() => null);

  let roleSummary = "No se asignaron roles.";
  let approvalUpdateMessage = "";
  let cooldownEndsAt = null;
  if (action === "approve") {
    clearReapplyCooldown(applicantId);
    const roleResult = await assignSubdivisionRoles({
      guild: interaction.guild,
      member,
      subdivision,
    });
    roleSummary = roleResult.message;

    if (roleResult.ok) {
      const approvalUpdateResult = await sendApprovalUpdate({
        client: interaction.client,
        guild: interaction.guild,
        applicantId,
        subdivision,
      });
      approvalUpdateMessage = approvalUpdateResult.message;
    } else {
      approvalUpdateMessage =
        "No envie el update al canal correspondiente porque la asignacion de roles no quedo completa.";
    }
  } else {
    cooldownEndsAt = setReapplyCooldown(applicantId, subdivision);
  }

  const resultEmbed = buildDecisionEmbed({
    action,
    subdivision,
    applicantId,
    reviewer: interaction.user,
    roleSummary,
    cooldownEndsAt,
  });

  await resultChannel.send({
    content: `<@${applicantId}>`,
    embeds: [resultEmbed],
  });

  const dmResult = await sendDecisionDm({
    client: interaction.client,
    guild: interaction.guild,
    applicantId,
    action,
    subdivision,
    reviewer: interaction.user,
    roleSummary,
    cooldownEndsAt,
  });

  const updatedEmbed = new EmbedBuilder(interaction.message.embeds[0].toJSON());
  const fieldsWithoutOldStatus = (updatedEmbed.data.fields || []).filter(
    (field) =>
      field.name !== "Estado" &&
      field.name !== "Revision" &&
      field.name !== "Roles asignados" &&
      field.name !== "Repostulacion disponible",
  );

  updatedEmbed
    .setColor(action === "approve" ? EMBED_COLORS.success : EMBED_COLORS.danger)
    .setFields(
      ...fieldsWithoutOldStatus,
      {
        name: "Estado",
        value: action === "approve" ? "✅ Aprobada" : "❌ Rechazada",
      },
      {
        name: "Revision",
        value: `${interaction.user}`,
      },
      ...(action === "approve"
        ? [
            {
              name: "Roles asignados",
              value: roleSummary,
            },
          ]
        : [
            {
              name: "Repostulacion disponible",
              value: formatDiscordTimestamp(cooldownEndsAt),
            },
          ]),
    );

  await interaction.message.edit({
    embeds: [updatedEmbed],
    components: disableMessageButtons(interaction.message.components),
  });

  await interaction.followUp({
    content:
      action === "approve"
        ? `Postulacion aprobada. ${roleSummary} ${approvalUpdateMessage} ${dmResult.message}`
        : `Postulacion rechazada y enviada al canal de resultados. ${dmResult.message}`,
    ephemeral: true,
  });
}

function disableMessageButtons(componentRows) {
  return componentRows.map((row) =>
    new ActionRowBuilder().addComponents(
      ...row.components.map((component) =>
        ButtonBuilder.from(component).setDisabled(true),
      ),
    ),
  );
}

async function assignSubdivisionRoles({ guild, member, subdivision }) {
  if (!member) {
    return {
      ok: false,
      message: "No pude asignar roles porque el usuario ya no esta en el servidor.",
    };
  }

  const roleNames = ROLE_NAMES_BY_SUBDIVISION[subdivision] || [];
  if (roleNames.length === 0) {
    return {
      ok: false,
      message: "No hay roles configurados para esta subdivision.",
    };
  }

  await guild.roles.fetch();

  const rolesToAdd = [];
  const missingRoles = [];

  roleNames.forEach((roleName) => {
    const normalizedTargetRoleName = normalizeRoleLookup(roleName);
    const role = guild.roles.cache.find(
      (candidate) =>
        normalizeRoleLookup(candidate.name) === normalizedTargetRoleName,
    );

    if (role) {
      rolesToAdd.push(role);
    } else {
      missingRoles.push(roleName);
    }
  });

  if (rolesToAdd.length > 0) {
    try {
      await member.roles.add(rolesToAdd);
    } catch (error) {
      console.error("No pude asignar los roles.", error);
      return {
        ok: false,
        message:
          "La postulacion se aprobo, pero no pude asignar los roles. Revisa permisos y jerarquia del bot.",
      };
    }
  }

  if (missingRoles.length > 0) {
    return {
      ok: false,
      message: `Se aprobo, pero no encontre estos roles: ${missingRoles.join(", ")}.`,
    };
  }

  return {
    ok: true,
    message: `Roles asignados: ${roleNames.join(", ")}.`,
  };
}

function parseRoleNames(value) {
  return value
    .split(",")
    .map((roleName) => roleName.trim())
    .filter(Boolean);
}

function formatSubdivision(subdivision) {
  if (subdivision === "geof") {
    return "G.E.O.F";
  }

  if (subdivision === "halcon") {
    return "Halcon";
  }

  return subdivision;
}

function normalizeRoleLookup(value) {
  return normalizeAnswer(value)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function resolveRolesByNames(guild, roleNames) {
  await guild.roles.fetch().catch(() => null);

  const roles = [];
  const missing = [];

  roleNames.forEach((roleName) => {
    const role = findRoleByName(guild, roleName);

    if (role) {
      roles.push(role);
    } else {
      missing.push(roleName);
    }
  });

  return { roles, missing };
}

function findRoleByName(guild, roleName) {
  const normalizedTargetRoleName = normalizeRoleLookup(roleName);

  return guild.roles.cache.find(
    (candidate) =>
      normalizeRoleLookup(candidate.name) === normalizedTargetRoleName,
  );
}

function buildRoleMentionContent(roles) {
  if (!roles || roles.length === 0) {
    return undefined;
  }

  return roles.map((role) => `<@&${role.id}>`).join(" ");
}

function buildRoleAllowedMentions(roles) {
  if (!roles || roles.length === 0) {
    return undefined;
  }

  return {
    roles: roles.map((role) => role.id),
  };
}

async function sendApprovalUpdate({ client, guild, applicantId, subdivision }) {
  const channelId = UPDATE_CHANNEL_IDS[subdivision];
  if (!channelId) {
    return {
      ok: false,
      message: "No encontre configurado el canal de updates para esta subdivision.",
    };
  }

  const updateChannel = await client.channels.fetch(channelId).catch(() => null);
  if (!updateChannel || !updateChannel.isTextBased()) {
    return {
      ok: false,
      message: "No pude encontrar el canal de updates correspondiente.",
    };
  }

  const targetRoleName = UPDATE_ROLE_NAMES[subdivision];
  const targetRole = findRoleByName(guild, targetRoleName);

  if (!targetRole) {
    return {
      ok: false,
      message: `No pude encontrar el rol de update para ${formatSubdivision(subdivision)}.`,
    };
  }

  await updateChannel.send({
    content: `**NEW** <@${applicantId}> > <@&${targetRole.id}>`,
    allowedMentions: {
      users: [applicantId],
      roles: [targetRole.id],
    },
  });

  return {
    ok: true,
    message: "Envie el update al canal correspondiente.",
  };
}

async function tryStartApplication(interaction) {
  const activeCooldown = getActiveReapplyCooldown(interaction.user.id);

  if (activeCooldown) {
    await interaction.reply({
      embeds: [
        buildNoticeEmbed({
          color: EMBED_COLORS.warning,
          title: "⏳ Debes esperar para volver a postularte",
          description:
            "Tu ultima postulacion fue rechazada y aun no termina el cooldown de 72 horas.",
          fields: [
            {
              name: "Subdivision",
              value: formatSubdivision(activeCooldown.subdivision || "No disponible"),
              inline: true,
            },
            {
              name: "Disponible nuevamente",
              value: formatDiscordTimestamp(activeCooldown.endsAt),
              inline: true,
            },
          ],
        }),
      ],
      ephemeral: true,
    });
    return;
  }

  await interaction.showModal(
    buildApplicationModal({
      customId: STEP_1_MODAL_ID,
      title: `Formulario de ${APPLICATION_NAME} - Paso 1`,
      questions: STEP_1_QUESTIONS,
    }),
  );
}

async function handleRemoveCooldownCommand(interaction) {
  const canManageCooldown = await memberCanManageCooldown(interaction);

  if (!canManageCooldown) {
    await interaction.reply({
      embeds: [
        buildNoticeEmbed({
          color: EMBED_COLORS.danger,
          title: "❌ Sin permisos",
          description:
            "Solo los rangos autorizados pueden usar este comando.",
          fields: [
            {
              name: "Roles permitidos",
              value: COOLDOWN_MANAGER_ROLE_NAMES.join(", "),
            },
          ],
        }),
      ],
      ephemeral: true,
    });
    return;
  }

  const targetUser = interaction.options.getUser("usuario", true);
  const existingCooldown = getActiveReapplyCooldown(targetUser.id);

  clearReapplyCooldown(targetUser.id);

  const latestLogMessage = await findLatestApplicationLogMessage(
    interaction.client,
    targetUser.id,
  );

  let logUpdated = false;
  if (latestLogMessage?.embeds?.[0]) {
    const latestEmbed = latestLogMessage.embeds[0];
    const statusField = findEmbedField(latestEmbed, "Estado");
    const normalizedStatus = statusField
      ? normalizeStatusValue(statusField.value)
      : "";

    if (normalizedStatus.includes("rechazada")) {
      await markCooldownAsRemovedOnLog({
        message: latestLogMessage,
        reviewer: interaction.user,
      });
      logUpdated = true;
    }
  }

  const description = existingCooldown || logUpdated
    ? `${targetUser} ya puede volver a postularse.`
    : `${targetUser} no tenia un cooldown activo, pero deje la memoria limpia por si acaso.`;

  await interaction.reply({
    embeds: [
      buildNoticeEmbed({
        color: EMBED_COLORS.success,
        title: "✅ Cooldown removido",
        description,
        fields: [
          {
            name: "Usuario",
            value: `${targetUser.tag}\nID: ${targetUser.id}`,
          },
          {
            name: "Registro actualizado",
            value: logUpdated ? "Si" : "No encontre una postulacion rechazada reciente para editar.",
          },
        ],
      }),
    ],
    ephemeral: true,
  });
}

async function memberCanManageCooldown(interaction) {
  if (!interaction.inGuild()) {
    return false;
  }

  const member = await interaction.guild.members
    .fetch(interaction.user.id)
    .catch(() => null);

  if (!member) {
    return false;
  }

  await interaction.guild.roles.fetch().catch(() => null);

  return COOLDOWN_MANAGER_ROLE_NAMES.some((roleName) => {
    const normalizedTargetRoleName = normalizeRoleLookup(roleName);

    return member.roles.cache.some(
      (role) => normalizeRoleLookup(role.name) === normalizedTargetRoleName,
    );
  });
}

async function hydrateReapplyCooldowns(client) {
  activeReapplyCooldowns.clear();

  const logChannel = await client.channels
    .fetch(process.env.LOG_CHANNEL_ID)
    .catch(() => null);

  if (!logChannel || !logChannel.isTextBased() || !logChannel.messages?.fetch) {
    return 0;
  }

  const resolvedApplicants = new Set();
  let before;
  let scannedMessages = 0;

  while (scannedMessages < COOLDOWN_LOOKUP_LIMIT) {
    const batchSize = Math.min(100, COOLDOWN_LOOKUP_LIMIT - scannedMessages);
    const messages = await logChannel.messages
      .fetch({ limit: batchSize, before })
      .catch(() => null);

    if (!messages || messages.size === 0) {
      break;
    }

    const orderedMessages = [...messages.values()].sort(
      (first, second) => second.createdTimestamp - first.createdTimestamp,
    );

    for (const message of orderedMessages) {
      scannedMessages += 1;

      const embed = message.embeds[0];
      if (!embed) {
        continue;
      }

      const applicantId = extractApplicantIdFromEmbed(embed);
      if (!applicantId || resolvedApplicants.has(applicantId)) {
        continue;
      }

      const statusField = findEmbedField(embed, "Estado");
      const normalizedStatus = statusField
        ? normalizeStatusValue(statusField.value)
        : "";
      const cooldownField = findEmbedField(embed, "Cooldown");
      const normalizedCooldown = cooldownField
        ? normalizeRoleLookup(cooldownField.value)
        : "";

      if (!normalizedStatus) {
        continue;
      }

      if (normalizedCooldown.includes("removido manualmente")) {
        resolvedApplicants.add(applicantId);
        continue;
      }

      if (normalizedStatus.includes("aprobada")) {
        resolvedApplicants.add(applicantId);
        continue;
      }

      if (!normalizedStatus.includes("rechazada")) {
        continue;
      }

      resolvedApplicants.add(applicantId);

      const endsAt = (message.editedTimestamp || message.createdTimestamp) +
        COOLDOWN_DURATION_MS;

      if (endsAt > Date.now()) {
        activeReapplyCooldowns.set(applicantId, {
          endsAt,
          subdivision: extractSubdivisionFromEmbed(embed),
        });
      }
    }

    const oldestMessage = orderedMessages[orderedMessages.length - 1];
    if (!oldestMessage) {
      break;
    }

    if (oldestMessage.createdTimestamp < Date.now() - (COOLDOWN_DURATION_MS + 86400000)) {
      break;
    }

    before = oldestMessage.id;
  }

  pruneExpiredReapplyCooldowns();
  return activeReapplyCooldowns.size;
}

function getActiveReapplyCooldown(userId) {
  pruneExpiredReapplyCooldowns();
  return activeReapplyCooldowns.get(userId) || null;
}

function pruneExpiredReapplyCooldowns() {
  const now = Date.now();

  for (const [userId, cooldown] of activeReapplyCooldowns.entries()) {
    if (cooldown.endsAt <= now) {
      activeReapplyCooldowns.delete(userId);
    }
  }
}

function setReapplyCooldown(userId, subdivision) {
  const endsAt = Date.now() + COOLDOWN_DURATION_MS;

  activeReapplyCooldowns.set(userId, {
    endsAt,
    subdivision,
  });

  return endsAt;
}

function clearReapplyCooldown(userId) {
  activeReapplyCooldowns.delete(userId);
}

function extractApplicantIdFromEmbed(embed) {
  const userField = findEmbedField(embed, "Usuario");
  const match = userField?.value.match(/ID:\s*(\d+)/);

  return match ? match[1] : null;
}

function extractSubdivisionFromEmbed(embed) {
  const subdivisionField = embed.fields.find((field) =>
    normalizeRoleLookup(field.name).includes("subdivision"),
  );

  return subdivisionField ? normalizeAnswer(subdivisionField.value) : null;
}

function findEmbedField(embed, expectedName) {
  return embed.fields.find(
    (field) => normalizeRoleLookup(field.name) === normalizeRoleLookup(expectedName),
  );
}

function normalizeStatusValue(value) {
  return normalizeRoleLookup(value);
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

function buildDecisionEmbed({
  action,
  subdivision,
  applicantId,
  reviewer,
  roleSummary,
  cooldownEndsAt,
}) {
  const isApproval = action === "approve";

  return new EmbedBuilder()
    .setColor(isApproval ? EMBED_COLORS.success : EMBED_COLORS.danger)
    .setTitle(
      isApproval
        ? `✅ Postulacion aprobada - ${APPLICATION_NAME}`
        : `❌ Postulacion rechazada - ${APPLICATION_NAME}`,
    )
    .setDescription(isApproval ? APPROVED_TEXT : REJECTED_TEXT)
    .addFields(
      {
        name: "Postulante",
        value: `<@${applicantId}>`,
      },
      {
        name: "Subdivision",
        value: formatSubdivision(subdivision),
      },
      {
        name: "Revisado por",
        value: reviewer.tag,
      },
      ...(isApproval
        ? [
            {
              name: "Roles asignados",
              value: roleSummary,
            },
          ]
        : [
            {
              name: "Repostulacion disponible",
              value: formatDiscordTimestamp(cooldownEndsAt),
            },
          ]),
    )
    .setTimestamp();
}

async function sendDecisionDm({
  client,
  guild,
  applicantId,
  action,
  subdivision,
  reviewer,
  roleSummary,
  cooldownEndsAt,
}) {
  const applicantUser = await client.users.fetch(applicantId).catch(() => null);

  if (!applicantUser) {
    return {
      ok: false,
      message: "No pude encontrar al usuario para enviarle DM.",
    };
  }

  const isApproval = action === "approve";
  const dmEmbed = new EmbedBuilder()
    .setColor(isApproval ? EMBED_COLORS.success : EMBED_COLORS.danger)
    .setTitle(
      isApproval
        ? `✅ Tu postulacion fue aprobada`
        : `❌ Tu postulacion fue rechazada`,
    )
    .setDescription(isApproval ? APPROVED_TEXT : REJECTED_TEXT)
    .addFields(
      {
        name: "Subdivision",
        value: formatSubdivision(subdivision),
      },
      {
        name: "Revisado por",
        value: reviewer.tag,
      },
      ...(isApproval
        ? [
            {
              name: "Roles asignados",
              value: roleSummary,
            },
          ]
        : [
            {
              name: "Podras volver a postularte",
              value: formatDiscordTimestamp(cooldownEndsAt),
            },
          ]),
    )
    .setFooter({ text: APPLICATION_NAME })
    .setTimestamp();

  const guildIconUrl = guild.iconURL();
  if (guildIconUrl) {
    dmEmbed.setThumbnail(guildIconUrl);
  }

  try {
    await applicantUser.send({
      embeds: [dmEmbed],
    });

    return {
      ok: true,
      message: "Le envie un DM al usuario.",
    };
  } catch (error) {
    console.error("No pude enviar el DM al usuario.", error);

    return {
      ok: false,
      message: "No pude enviarle DM al usuario. Seguramente tiene los mensajes privados cerrados.",
    };
  }
}

function formatDiscordTimestamp(timestamp) {
  const unixTimestamp = Math.floor(timestamp / 1000);
  return `<t:${unixTimestamp}:F>\n<t:${unixTimestamp}:R>`;
}

async function findLatestApplicationLogMessage(client, userId) {
  const logChannel = await client.channels
    .fetch(process.env.LOG_CHANNEL_ID)
    .catch(() => null);

  if (!logChannel || !logChannel.isTextBased() || !logChannel.messages?.fetch) {
    return null;
  }

  let before;
  let scannedMessages = 0;

  while (scannedMessages < COOLDOWN_LOOKUP_LIMIT) {
    const batchSize = Math.min(100, COOLDOWN_LOOKUP_LIMIT - scannedMessages);
    const messages = await logChannel.messages
      .fetch({ limit: batchSize, before })
      .catch(() => null);

    if (!messages || messages.size === 0) {
      break;
    }

    const orderedMessages = [...messages.values()].sort(
      (first, second) => second.createdTimestamp - first.createdTimestamp,
    );

    for (const message of orderedMessages) {
      scannedMessages += 1;

      const embed = message.embeds[0];
      if (!embed) {
        continue;
      }

      if (extractApplicantIdFromEmbed(embed) === userId) {
        return message;
      }
    }

    const oldestMessage = orderedMessages[orderedMessages.length - 1];
    if (!oldestMessage) {
      break;
    }

    before = oldestMessage.id;
  }

  return null;
}

async function markCooldownAsRemovedOnLog({ message, reviewer }) {
  const updatedEmbed = new EmbedBuilder(message.embeds[0].toJSON());
  const fieldsWithoutCooldown = (updatedEmbed.data.fields || []).filter(
    (field) =>
      !["repostulacion disponible", "cooldown"].includes(
        normalizeRoleLookup(field.name),
      ),
  );

  updatedEmbed.setFields(
    ...fieldsWithoutCooldown,
    {
      name: "Cooldown",
      value: `Removido manualmente por ${reviewer}.\n${formatDiscordTimestamp(Date.now())}`,
    },
  );

  await message.edit({
    embeds: [updatedEmbed],
    components: message.components,
  });
}

client.login(process.env.DISCORD_TOKEN);
