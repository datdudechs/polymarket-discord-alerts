import {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  MessageFlags,
} from "discord.js";
import { normalizeAddress } from "./watchlist.js";
import { profileUrl } from "./format.js";

/**
 * Slash commands. Restricted to members with "Manage Server" by default so a
 * random member of a public server can't edit the owner's watchlist. The
 * server owner can further adjust access in Server Settings → Integrations,
 * or lock it to specific users with TRACK_ALLOWED_USER_IDS.
 */
function buildCommands() {
  return [
    new SlashCommandBuilder()
      .setName("track")
      .setDescription("Add a Polymarket wallet to your watchlist")
      .addStringOption((o) =>
        o.setName("address").setDescription("Wallet address (0x…)").setRequired(true)
      )
      .addStringOption((o) =>
        o.setName("name").setDescription("Optional label for this wallet").setRequired(false)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .setContexts(InteractionContextType.Guild),
    new SlashCommandBuilder()
      .setName("untrack")
      .setDescription("Remove a wallet from your watchlist")
      .addStringOption((o) =>
        o
          .setName("address")
          .setDescription("Wallet address to remove")
          .setRequired(true)
          .setAutocomplete(true)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .setContexts(InteractionContextType.Guild),
    new SlashCommandBuilder()
      .setName("watchlist")
      .setDescription("Show the wallets currently on your watchlist")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .setContexts(InteractionContextType.Guild),
  ].map((c) => c.toJSON());
}

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });

/**
 * Start the Discord gateway bot. Returns the client, or null if no token is
 * configured (the bot is optional — the poll loop runs fine without it).
 */
export async function startBot(cfg, watchlist) {
  if (!cfg.discordBotToken) {
    console.log("[bot] DISCORD_BOT_TOKEN not set — slash commands disabled.");
    return null;
  }

  const allowedUserIds = (cfg.trackAllowedUserIds || [])
    .map((s) => s.trim())
    .filter(Boolean);
  const userAllowed = (id) => allowedUserIds.length === 0 || allowedUserIds.includes(id);

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once("clientReady", async () => {
    console.log(`[bot] logged in as ${client.user.tag}`);
    const commands = buildCommands();
    try {
      if (cfg.discordGuildId) {
        const guild = await client.guilds.fetch(cfg.discordGuildId);
        await guild.commands.set(commands);
        console.log(`[bot] registered ${commands.length} guild command(s) in ${guild.name}`);
      } else {
        await client.application.commands.set(commands);
        console.log(
          `[bot] registered ${commands.length} global command(s) ` +
            "(may take up to ~1h to appear; set DISCORD_GUILD_ID for instant registration)"
        );
      }
    } catch (err) {
      console.error(`[bot] command registration failed: ${err.message}`);
    }
  });

  client.on("interactionCreate", async (interaction) => {
    try {
      if (interaction.isAutocomplete()) {
        const focused = interaction.options.getFocused(true);
        if (interaction.commandName === "untrack" && focused.name === "address") {
          const q = focused.value.toLowerCase();
          const choices = watchlist
            .list()
            .filter((w) => w.address.includes(q) || (w.name || "").toLowerCase().includes(q))
            .slice(0, 25)
            .map((w) => ({
              name: `${w.name || w.address}`.slice(0, 100),
              value: w.address,
            }));
          await interaction.respond(choices);
        }
        return;
      }

      if (!interaction.isChatInputCommand()) return;
      if (!userAllowed(interaction.user.id)) {
        await interaction.reply(ephemeral("⛔ You're not allowed to edit the watchlist."));
        return;
      }

      if (interaction.commandName === "track") {
        const address = interaction.options.getString("address", true);
        const name = interaction.options.getString("name") || "";
        const result = watchlist.add({
          address,
          name,
          addedBy: interaction.user.tag,
        });
        if (!result.ok) {
          const msg =
            result.reason === "invalid"
              ? `❌ \`${address}\` is not a valid wallet address (expected \`0x\` + 40 hex chars).`
              : `ℹ️ \`${normalizeAddress(address)}\` is already on the watchlist.`;
          await interaction.reply(ephemeral(msg));
          return;
        }
        const e = result.entry;
        const label = e.name ? `**${e.name}** (\`${e.address}\`)` : `\`${e.address}\``;
        await interaction.reply(
          ephemeral(
            `✅ Now tracking ${label}.\n` +
              `New trades will post to the watchlist channel. [Profile](${profileUrl(e.address)})`
          )
        );
        console.log(`[track] ${interaction.user.tag} added ${e.address} (${e.name || "no name"})`);
        return;
      }

      if (interaction.commandName === "untrack") {
        const address = interaction.options.getString("address", true);
        const removed = watchlist.remove(address);
        if (!removed) {
          await interaction.reply(
            ephemeral(`ℹ️ \`${normalizeAddress(address)}\` isn't on the watchlist.`)
          );
          return;
        }
        const label = removed.name ? `**${removed.name}** (\`${removed.address}\`)` : `\`${removed.address}\``;
        await interaction.reply(ephemeral(`🗑️ Removed ${label} from the watchlist.`));
        console.log(`[track] ${interaction.user.tag} removed ${removed.address}`);
        return;
      }

      if (interaction.commandName === "watchlist") {
        const entries = watchlist.list();
        if (entries.length === 0) {
          await interaction.reply(
            ephemeral("Your watchlist is empty. Add one with `/track <address>`.")
          );
          return;
        }
        const lines = entries.map((w, i) => {
          const label = w.name || `${w.address.slice(0, 6)}…${w.address.slice(-4)}`;
          return `\`${String(i + 1).padStart(2)}\` [${label}](${profileUrl(w.address)}) — \`${w.address}\``;
        });
        await interaction.reply(
          ephemeral(`👁️ **Watchlist (${entries.length})**\n${lines.join("\n")}`.slice(0, 2000))
        );
        return;
      }
    } catch (err) {
      console.error(`[bot] interaction error: ${err.message}`);
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        interaction.reply(ephemeral("⚠️ Something went wrong handling that command.")).catch(() => {});
      }
    }
  });

  client.on("error", (err) => console.error(`[bot] client error: ${err.message}`));

  try {
    await client.login(cfg.discordBotToken);
  } catch (err) {
    console.error(`[bot] login failed: ${err.message} — continuing without slash commands.`);
    return null;
  }
  return client;
}
