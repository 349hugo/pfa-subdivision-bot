const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

const {
  QUESTION_STYLES,
  applicationSteps,
  allQuestions,
} = require("./questions");

const IDS = {
  openModalButton: "open_application_modal",
  reviewPrefix: "review_application",
  stepModalIds: [
    "application_step_1",
    "application_step_2",
    "application_step_3",
  ],
  continueButtonIds: [
    "continue_application_step_2",
    "continue_application_step_3",
  ],
};

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

function createApplicationsFeature({ config }) {
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

  async function onReady(client) {
    const activeCooldownCount = await hydrateReapplyCooldowns(client);
    console.log(`Cooldowns activos cargados: ${activeCooldownCount}`);
  }

  async function handleInteraction(interaction) {
    if (interaction.isChatInputCommand()) {
      return handleChatInputCommand(interaction);
    }

    if (interaction.isButton()) {
      return handleButtonInteraction(interaction);
    }

    if (interaction.isModalSubmit()) {
      return handleModalSubmit(interaction);
    }

    return false;
  }

  async function handleChatInputCommand(interaction) {
    if (interaction.commandName === "panel-postulacion") {
      await sendApplicationPanel(interaction);
      return true;
    }

    if (interaction.commandName === "postularme") {
      await tryStartApplication(interaction);
      return true;
    }

    if (interaction.commandName === "quitar-cooldown") {
      await handleRemoveCooldownCommand(interaction);
      return true;
    }

    return false;
  }

  async function handleButtonInteraction(interaction) {
    if (interaction.customId === IDS.openModalButton) {
      await tryStartApplication(interaction);
      return true;
    }

    const continueStepIndex = IDS.continueButtonIds.indexOf(interaction.customId);
    if (continueStepIndex !== -1) {
      await interaction.showModal(
        buildApplicationModal({
          customId: IDS.stepModalIds[continueStepIndex + 1],
          title: buildStepTitle(continueStepIndex + 1),
          questions: applicationSteps[continueStepIndex + 1].questions,
        }),
      );
      return true;
    }

    if (interaction.customId.startsWith(IDS.reviewPrefix)) {
      await handleReviewButton(interaction);
      return true;
    }

    return false;
  }

  async function handleModalSubmit(interaction) {
    const stepIndex = IDS.stepModalIds.indexOf(interaction.customId);

    if (stepIndex === -1) {
      return false;
    }

    await handleStepSubmission(interaction, stepIndex);
    return true;
  }

  async function handleStepSubmission(interaction, stepIndex) {
    const stepQuestions = applicationSteps[stepIndex].questions;
    const stepAnswers = collectAnswers(interaction, stepQuestions);
    const validationError = validateStepAnswers(stepIndex, stepAnswers);

    if (validationError) {
      await interaction.reply({
        content: validationError,
        ephemeral: true,
      });
      return;
    }

    let session = applicationSessions.get(interaction.user.id);

    if (stepIndex > 0 && !session) {
      await interaction.reply({
        content:
          "No encontre tu postulacion en curso. Vuelve a empezar con /postularme.",
        ephemeral: true,
      });
      return;
    }

    if (!session) {
      session = {
        answers: {},
        createdAt: Date.now(),
      };
    }

    session.answers = {
      ...session.answers,
      ...stepAnswers,
    };
    session.updatedAt = Date.now();
    applicationSessions.set(interaction.user.id, session);

    if (stepIndex === applicationSteps.length - 1) {
      await handleFinalSubmission(interaction, session.answers);
      applicationSessions.delete(interaction.user.id);
      return;
    }

    const nextStep = stepIndex + 1;
    const buttonRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(IDS.continueButtonIds[stepIndex])
        .setLabel(`Continuar al paso ${nextStep + 1}`)
        .setStyle(ButtonStyle.Primary),
    );

    await interaction.reply({
      embeds: [
        buildNoticeEmbed({
          color: EMBED_COLORS.success,
          title: `Paso ${nextStep} completado`,
          description: `Pulsa el boton para seguir con el paso ${nextStep + 1}.`,
        }),
      ],
      components: [buttonRow],
      ephemeral: true,
    });
  }

  function buildApplicationModal({ customId, title, questions }) {
    const modal = new ModalBuilder().setCustomId(customId).setTitle(title);

    questions.forEach((question) => {
      const input = new TextInputBuilder()
        .setCustomId(question.id)
        .setLabel(question.label)
        .setPlaceholder(question.placeholder)
        .setRequired(true)
        .setStyle(resolveTextInputStyle(question.style))
        .setMinLength(question.minLength)
        .setMaxLength(question.maxLength);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
    });

    return modal;
  }

  async function sendApplicationPanel(interaction) {
    const panelEmbed = new EmbedBuilder()
      .setColor(EMBED_COLORS.primary)
      .setTitle(`Formulario de Postulacion ${config.applicationName}`)
      .setDescription(
        "Pulsa el boton de abajo para abrir el formulario. Se completa en varios pasos y llega al canal de revision automaticamente.",
      )
      .addFields(
        {
          name: "Que se solicita",
          value:
            "Datos IC, tactica, subdivision, experiencia y disponibilidad.",
        },
        {
          name: "Importante",
          value:
            "No compartas contrasenas ni informacion confidencial en ninguna respuesta.",
        },
      )
      .setFooter({ text: "Solo necesitas pulsar el boton para comenzar." });

    const buttonRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(IDS.openModalButton)
        .setLabel("Postularme")
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
          title: "Panel publicado",
          description: "El panel de postulacion ya fue enviado a este canal.",
        }),
      ],
      ephemeral: true,
    });
  }

  async function handleFinalSubmission(interaction, answers) {
    const logChannel = await interaction.client.channels
      .fetch(config.logChannelId)
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
      .setTitle(`Nueva postulacion para ${config.applicationName}`)
      .setDescription(`Solicitud enviada por ${interaction.user}`)
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields(
        {
          name: "Usuario",
          value: `${interaction.user.tag}\nID: ${interaction.user.id}`,
        },
        ...allQuestions.map((question) => ({
          name: question.label,
          value: answers[question.id],
        })),
        {
          name: "Estado",
          value: "Pendiente de revision",
        },
      )
      .setFooter({ text: "Usa los botones de abajo para revisar la postulacion." })
      .setTimestamp();

    const subdivision = normalizeAnswer(answers.subdivision);
    const reviewRow = buildReviewButtons(subdivision, interaction.user.id);
    const reviewMentionRoles = await resolveRolesByNames(
      interaction.guild,
      config.reviewMentionRoleNames,
    );

    await logChannel.send({
      content: buildRoleMentionContent(reviewMentionRoles.roles),
      allowedMentions: buildRoleAllowedMentions(reviewMentionRoles.roles),
      embeds: [logEmbed],
      components: [reviewRow],
    });

    await interaction.reply({
      embeds: [
        buildNoticeEmbed({
          color: EMBED_COLORS.success,
          title: "Postulacion enviada",
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

  function validateStepAnswers(stepIndex, answers) {
    if (stepIndex === 0) {
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
    }

    if (stepIndex === 1) {
      const normalizedSubdivision = normalizeAnswer(answers.subdivision);
      if (!["halcon", "geof"].includes(normalizedSubdivision)) {
        return "La subdivision debe ser Halcon o Geof.";
      }
    }

    return null;
  }

  function isYesOrNo(value) {
    return ["si", "no"].includes(normalizeAnswer(value));
  }

  function normalizeAnswer(value) {
    return String(value)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function buildReviewButtons(subdivision, userId) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${IDS.reviewPrefix}:approve:${subdivision}:${userId}`)
        .setLabel("Aprobar")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`${IDS.reviewPrefix}:reject:${subdivision}:${userId}`)
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

    const resultChannelId = config.resultChannelIds[subdivision];
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
          value: action === "approve" ? "Aprobada" : "Rechazada",
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

    const roleNames = config.subdivisionRoleNames[subdivision] || [];
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
      const role = findRoleByName(guild, roleName);

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
    const channelId = config.updateChannelIds[subdivision];
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

    const targetRoleName = config.updateRoleNames[subdivision];
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
            title: "Debes esperar para volver a postularte",
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
        customId: IDS.stepModalIds[0],
        title: buildStepTitle(0),
        questions: applicationSteps[0].questions,
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
            title: "Sin permisos",
            description: "Solo los rangos autorizados pueden usar este comando.",
            fields: [
              {
                name: "Roles permitidos",
                value: config.cooldownManagerRoleNames.join(", "),
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
          title: "Cooldown removido",
          description,
          fields: [
            {
              name: "Usuario",
              value: `${targetUser.tag}\nID: ${targetUser.id}`,
            },
            {
              name: "Registro actualizado",
              value: logUpdated
                ? "Si"
                : "No encontre una postulacion rechazada reciente para editar.",
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

    return config.cooldownManagerRoleNames.some((roleName) => {
      const normalizedTargetRoleName = normalizeRoleLookup(roleName);

      return member.roles.cache.some(
        (role) => normalizeRoleLookup(role.name) === normalizedTargetRoleName,
      );
    });
  }

  async function hydrateReapplyCooldowns(client) {
    activeReapplyCooldowns.clear();

    const logChannel = await client.channels
      .fetch(config.logChannelId)
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

        const endsAt =
          (message.editedTimestamp || message.createdTimestamp) +
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

      if (
        oldestMessage.createdTimestamp <
        Date.now() - (COOLDOWN_DURATION_MS + 86400000)
      ) {
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
          ? `Postulacion aprobada - ${config.applicationName}`
          : `Postulacion rechazada - ${config.applicationName}`,
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
          ? "Tu postulacion fue aprobada"
          : "Tu postulacion fue rechazada",
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
      .setFooter({ text: config.applicationName })
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
        message:
          "No pude enviarle DM al usuario. Seguramente tiene los mensajes privados cerrados.",
      };
    }
  }

  function formatDiscordTimestamp(timestamp) {
    const unixTimestamp = Math.floor(timestamp / 1000);
    return `<t:${unixTimestamp}:F>\n<t:${unixTimestamp}:R>`;
  }

  async function findLatestApplicationLogMessage(client, userId) {
    const logChannel = await client.channels
      .fetch(config.logChannelId)
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

  function buildStepTitle(stepIndex) {
    return `Formulario de ${config.applicationName} - Paso ${stepIndex + 1}`;
  }

  function resolveTextInputStyle(style) {
    return style === QUESTION_STYLES.PARAGRAPH
      ? TextInputStyle.Paragraph
      : TextInputStyle.Short;
  }

  return {
    commands,
    onReady,
    handleInteraction,
  };
}

module.exports = {
  createApplicationsFeature,
};
