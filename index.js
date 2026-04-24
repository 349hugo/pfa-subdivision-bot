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
const APPROVED_TEXT =
  "Desde el departamento de subdivisiones tenemos el agrado de confirmar que su postulacion escrita ha sido aprobada, bienvenido.";
const REJECTED_TEXT =
  "Desde el departamento de Subdivisiones lamentamos informarle que su postulacion escrita ha sido desaprobada. Debes esperar 72hs para volver a enviarla nuevamente.";

const RESULT_CHANNEL_IDS = {
  geof: process.env.RESULTS_GEOF_CHANNEL_ID,
  halcon: process.env.RESULTS_HALCON_CHANNEL_ID,
};

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

const commands = [
  new SlashCommandBuilder()
    .setName("panel-postulacion")
    .setDescription("Publica el panel para que los usuarios se postulen")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("postularme")
    .setDescription("Abre el formulario de postulacion"),
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
        await interaction.showModal(
          buildApplicationModal({
            customId: STEP_1_MODAL_ID,
            title: `Formulario de ${APPLICATION_NAME} - Paso 1`,
            questions: STEP_1_QUESTIONS,
          }),
        );
      }

      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId === OPEN_MODAL_BUTTON_ID) {
        await interaction.showModal(
          buildApplicationModal({
            customId: STEP_1_MODAL_ID,
            title: `Formulario de ${APPLICATION_NAME} - Paso 1`,
            questions: STEP_1_QUESTIONS,
          }),
        );
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
    .setColor(0xf5b041)
    .setTitle(`Formulario de Postulacion ${APPLICATION_NAME}`)
    .setDescription(
      "Pulsa el boton de abajo para abrir el formulario. No compartas contrasenas ni informacion confidencial.",
    )
    .addFields(
      {
        name: "Que se solicita",
        value:
          "Datos IC, tactica, subdivision, experiencia y disponibilidad.",
      },
      {
        name: "Como funciona",
        value:
          "El usuario completa 3 pasos y el bot envia toda la postulacion al canal de logs.",
      },
    )
    .setFooter({ text: "Solo necesitas pulsar el boton para comenzar." });

  const buttonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(OPEN_MODAL_BUTTON_ID)
      .setLabel("Postularme")
      .setStyle(ButtonStyle.Primary),
  );

  await interaction.channel.send({
    embeds: [panelEmbed],
    components: [buttonRow],
  });

  await interaction.reply({
    content: "El panel de postulacion ya fue enviado a este canal.",
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
      .setLabel("Continuar al paso 2")
      .setStyle(ButtonStyle.Primary),
  );

  await interaction.reply({
    content: "Paso 1 completado. Pulsa el boton para seguir con el paso 2.",
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
      .setLabel("Continuar al paso 3")
      .setStyle(ButtonStyle.Primary),
  );

  await interaction.reply({
    content: "Paso 2 completado. Pulsa el boton para terminar tu postulacion.",
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
    .setColor(0x57f287)
    .setTitle(`Nueva postulacion para ${APPLICATION_NAME}`)
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
        value: "Pendiente de revision",
      },
    )
    .setTimestamp();

  const subdivision = normalizeAnswer(answers.subdivision);
  const reviewRow = buildReviewButtons(subdivision, interaction.user.id);

  await logChannel.send({
    embeds: [logEmbed],
    components: [reviewRow],
  });

  applicationSessions.delete(interaction.user.id);

  await interaction.reply({
    content: "Tu postulacion fue enviada correctamente. Mucha suerte.",
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
      .setLabel("Aprobar")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(
        `${REVIEW_BUTTON_PREFIX}:reject:${subdivision}:${userId}`,
      )
      .setLabel("Rechazar")
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

  const resultEmbed = new EmbedBuilder()
    .setColor(action === "approve" ? 0x57f287 : 0xed4245)
    .setTitle(
      action === "approve"
        ? `Postulacion aprobada - ${APPLICATION_NAME}`
        : `Postulacion rechazada - ${APPLICATION_NAME}`,
    )
    .setDescription(action === "approve" ? APPROVED_TEXT : REJECTED_TEXT)
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
        value: `${interaction.user}`,
      },
    )
    .setTimestamp();

  await resultChannel.send({
    content: `<@${applicantId}>`,
    embeds: [resultEmbed],
  });

  let roleSummary = "No se asignaron roles.";
  if (action === "approve") {
    const roleResult = await assignSubdivisionRoles({
      guild: interaction.guild,
      member,
      subdivision,
    });
    roleSummary = roleResult.message;
  }

  const updatedEmbed = new EmbedBuilder(interaction.message.embeds[0].toJSON());
  const fieldsWithoutOldStatus = (updatedEmbed.data.fields || []).filter(
    (field) => field.name !== "Estado" && field.name !== "Revision",
  );

  updatedEmbed
    .setColor(action === "approve" ? 0x57f287 : 0xed4245)
    .setFields(
      ...fieldsWithoutOldStatus,
      {
        name: "Estado",
        value:
          action === "approve"
            ? "Aprobada"
            : "Rechazada",
      },
      {
        name: "Revision",
        value: `${interaction.user}`,
      },
    );

  await interaction.message.edit({
    embeds: [updatedEmbed],
    components: disableMessageButtons(interaction.message.components),
  });

  await interaction.followUp({
    content:
      action === "approve"
        ? `Postulacion aprobada. ${roleSummary}`
        : "Postulacion rechazada y enviada al canal de resultados.",
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
      message: "No pude asignar roles porque el usuario ya no esta en el servidor.",
    };
  }

  const roleNames = ROLE_NAMES_BY_SUBDIVISION[subdivision] || [];
  if (roleNames.length === 0) {
    return {
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
        message:
          "La postulacion se aprobo, pero no pude asignar los roles. Revisa permisos y jerarquia del bot.",
      };
    }
  }

  if (missingRoles.length > 0) {
    return {
      message: `Se aprobo, pero no encontre estos roles: ${missingRoles.join(", ")}.`,
    };
  }

  return {
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

client.login(process.env.DISCORD_TOKEN);
