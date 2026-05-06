const REQUIRED_ENV = ["DISCORD_TOKEN", "LOG_CHANNEL_ID"];

function loadConfig(env = process.env) {
  const missing = REQUIRED_ENV.filter((key) => !env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Faltan variables de entorno: ${missing.join(", ")}. Revisa tu archivo .env.`,
    );
  }

  return {
    token: env.DISCORD_TOKEN,
    guildId: env.GUILD_ID || null,
    logChannelId: env.LOG_CHANNEL_ID,
    applicationName: env.APPLICATION_NAME || "PFA-SUBDIVISION",
    verification: {
      channelId: env.VERIFICATION_CHANNEL_ID || "1332474049762427004",
      roleName: env.VERIFIED_ROLE_NAME || "🔥┃Hispanos RP",
      onlyAllowMembersWithoutRoles: env.VERIFICATION_ONLY_NO_ROLES !== "false",
    },
    resultChannelIds: {
      geof: env.RESULTS_GEOF_CHANNEL_ID,
      halcon: env.RESULTS_HALCON_CHANNEL_ID,
    },
    reviewMentionRoleNames: parseCommaList(
      env.REVIEW_MENTION_ROLE_NAMES || "Head Halcon,Head Geof",
    ),
    updateChannelIds: {
      geof: env.UPDATES_GEOF_CHANNEL_ID || "1493838384416952392",
      halcon: env.UPDATES_HALCON_CHANNEL_ID || "1493446131663896626",
    },
    updateRoleNames: {
      geof: env.UPDATES_GEOF_ROLE_NAME || "Tactico",
      halcon: env.UPDATES_HALCON_ROLE_NAME || "Cadete Halcon",
    },
    cooldownManagerRoleNames: parseCommaList(
      env.COOLDOWN_MANAGER_ROLE_NAMES || "Head Halcon,Head Geof",
    ),
    subdivisionRoleNames: {
      geof: parseCommaList(env.GEOF_ROLE_NAMES || "G.E.O.F,tactico"),
      halcon: parseCommaList(env.HALCON_ROLE_NAMES || "HALCON,cadete Halcon"),
    },
  };
}

function parseCommaList(value) {
  return String(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

module.exports = {
  loadConfig,
  parseCommaList,
};
