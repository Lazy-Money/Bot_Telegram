import { Bot, GrammyError, InlineKeyboard, type Api, type Context } from "grammy";
import type { User, UserFromGetMe } from "grammy/types";
import type { Env } from "./env.ts";
import {
  CATEGORIES,
  MAX_PHOTOS,
  findCategory,
  isOptional,
  nextStep,
  promptFor,
  type Category,
  type Data,
  type DateField,
} from "./categories.ts";
import { addDays, calendarKeyboard, formatDate, isValidIso, monthOf, todayIso } from "./dates.ts";
import { MAX_CAPTION, parseNumber, renderPost, type Author } from "./format.ts";

/** Almacenamiento del usuario (en producción, el storage de su Durable Object). */
export interface Store {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<unknown>;
}

/** Publicación en armado. `step` es el campo que se está pidiendo; `fields.length` = vista previa. */
interface Draft {
  category: string;
  step: number;
  data: Data;
  photos: string[];
  /** Último álbum del que ya se avisó recepción, para no responder una vez por cada foto. */
  lastAlbum?: string;
}

const DRAFT = "draft";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Arma el bot. Cada usuario tiene su propio `store`, y sus mensajes se procesan de a uno
 * (ver session.ts), así que acá no hay condiciones de carrera entre updates del mismo usuario.
 */
export function createBot(
  env: Env,
  store: Store,
  botInfo?: UserFromGetMe,
  now: () => Date = () => new Date(),
): Bot {
  const bot = new Bot(env.BOT_TOKEN, { botInfo });
  bot.catch((err) => console.error("Error procesando update", err.error));

  const loadDraft = () => store.get<Draft>(DRAFT);
  const saveDraft = (draft: Draft) => store.put(DRAFT, draft);

  async function waitRemaining(category: Category): Promise<number> {
    if (!category.weeklyLimit) return 0;
    const last = await store.get<number>(`last:${category.key}`);
    return last ? Math.max(0, last + WEEK_MS - Date.now()) : 0;
  }

  async function begin(ctx: Context, category: Category): Promise<void> {
    const wait = await waitRemaining(category);
    if (wait > 0) {
      await ctx.reply(
        `⏳ Ya publicaste en ${category.label} en los últimos 7 días.\n` +
          `Para evitar spam podés volver a publicar en ${formatWait(wait)}.`,
      );
      return;
    }
    const draft: Draft = { category: category.key, step: nextStep(category, {}, 0), data: {}, photos: [] };
    await saveDraft(draft);
    await ctx.reply(
      `${category.emoji} Vamos a armar tu publicación en *${category.label}*.\n` +
        "Te voy a pedir los datos de a uno. Podés cancelar cuando quieras con /cancelar.",
      { parse_mode: "Markdown" },
    );
    await ask(ctx, draft, category);
  }

  async function ask(ctx: Context, draft: Draft, category: Category): Promise<void> {
    const field = category.fields[draft.step];
    const keyboard = new InlineKeyboard();
    if (field.type === "date") {
      const { min, max } = dateRange(field, draft.data);
      await ctx.reply(promptFor(field, draft.data), {
        reply_markup: calendarKeyboard(draft.step, monthOf(min), min, max, field.after ? undefined : min),
      });
      return;
    }
    if (field.type === "choice") {
      // Opciones largas, una por fila para que no se corten en el celular.
      const perRow = field.options.some((o) => o.length > 12) ? 1 : 2;
      field.options.forEach((option, i) => {
        keyboard.text(option, `v:${draft.step}:${i}`);
        if (i % perRow === perRow - 1) keyboard.row();
      });
    } else if (isOptional(field, draft.data)) {
      // Para fotos opcionales, "Listo" sin fotos equivale a saltear.
      keyboard.text("Saltar ➡️", field.type === "photos" ? `d:${draft.step}` : `s:${draft.step}`);
    }
    await ctx.reply(promptFor(field, draft.data), {
      reply_markup: keyboard.inline_keyboard.flat().length ? keyboard : undefined,
    });
  }

  async function advance(ctx: Context, draft: Draft, category: Category): Promise<void> {
    draft.step = nextStep(category, draft.data, draft.step + 1);
    await saveDraft(draft);
    if (draft.step < category.fields.length) {
      await ask(ctx, draft, category);
    } else {
      await preview(ctx, draft, category);
    }
  }

  async function preview(ctx: Context, draft: Draft, category: Category): Promise<void> {
    const user = ctx.from!;
    await ctx.reply("👀 Así se va a ver tu publicación:");
    await sendPost(ctx.api, user.id, undefined, renderPost(category, draft.data, authorOf(user)), draft.photos);
    await ctx.reply("¿Está todo bien?", { reply_markup: confirmKeyboard() });
  }

  /**
   * Fechas elegibles: desde hoy (o desde el día siguiente a la fecha de `after`)
   * hasta un año después de esa base.
   */
  function dateRange(field: DateField, data: Data): { min: string; max: string } {
    const base = field.after ? String(data[field.after]) : todayIso(now());
    const min = field.after ? addDays(base, 1) : base;
    return { min, max: addDays(base, 365) };
  }

  /** Carga el borrador y verifica que el botón tocado corresponda al paso actual. */
  async function draftAtStep(ctx: Context, step: number) {
    const draft = await loadDraft();
    const category = draft && findCategory(draft.category);
    if (!draft || !category || draft.step !== step) {
      await ctx.answerCallbackQuery({ text: "Esa opción ya no está vigente." });
      return undefined;
    }
    return { draft, category, field: category.fields[step] };
  }

  // ─── Chat privado: el asistente ────────────────────────────────────────────

  const pm = bot.chatType("private");

  pm.command("start", async (ctx) => {
    const category = findCategory(ctx.match.trim());
    if (category) return begin(ctx, category);
    await ctx.reply(
      "¡Hola! Soy el bot de publicaciones del grupo.\n\n" +
        "Usá /publicar para crear una publicación paso a paso, o /cancelar para descartar la que estés armando.",
    );
  });

  pm.command("publicar", (ctx) =>
    ctx.reply("¿En qué tema querés publicar?", { reply_markup: categoryKeyboard() }),
  );

  pm.command("cancelar", async (ctx) => {
    const draft = await loadDraft();
    await store.delete(DRAFT);
    await ctx.reply(draft ? "❌ Publicación cancelada." : "No tenías ninguna publicación en curso.");
  });

  pm.callbackQuery(/^c:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const category = findCategory(ctx.match[1]);
    if (!category) return;
    await markAnswered(ctx, `${category.emoji} ${category.label}`);
    await begin(ctx, category);
  });

  pm.callbackQuery(/^v:(\d+):(\d+)$/, async (ctx) => {
    const current = await draftAtStep(ctx, Number(ctx.match[1]));
    if (!current) return;
    const { draft, category, field } = current;
    const option = field.type === "choice" ? field.options[Number(ctx.match[2])] : undefined;
    if (option === undefined) return ctx.answerCallbackQuery();
    draft.data[field.key] = option;
    await ctx.answerCallbackQuery();
    await markAnswered(ctx, option);
    await advance(ctx, draft, category);
  });

  pm.callbackQuery(/^s:(\d+)$/, async (ctx) => {
    const current = await draftAtStep(ctx, Number(ctx.match[1]));
    if (!current) return;
    const { draft, category, field } = current;
    if (!isOptional(field, draft.data)) return ctx.answerCallbackQuery({ text: "Este dato es obligatorio." });
    delete draft.data[field.key];
    await ctx.answerCallbackQuery();
    await markAnswered(ctx, "Saltado");
    await advance(ctx, draft, category);
  });

  // Calendario: cambiar de mes.
  pm.callbackQuery(/^cal:(\d+):(\d{4}-\d{2})$/, async (ctx) => {
    const current = await draftAtStep(ctx, Number(ctx.match[1]));
    if (!current || current.field.type !== "date") return;
    const { min, max } = dateRange(current.field, current.draft.data);
    const month = ctx.match[2];
    await ctx.answerCallbackQuery();
    if (month < monthOf(min) || month > monthOf(max)) return;
    await ctx
      .editMessageReplyMarkup({
        reply_markup: calendarKeyboard(current.draft.step, month, min, max, current.field.after ? undefined : min),
      })
      .catch(() => {});
  });

  // Calendario: elegir un día.
  pm.callbackQuery(/^day:(\d+):(\d{4}-\d{2}-\d{2})$/, async (ctx) => {
    const current = await draftAtStep(ctx, Number(ctx.match[1]));
    if (!current || current.field.type !== "date") return;
    const { draft, category, field } = current;
    const date = ctx.match[2];
    const { min, max } = dateRange(field, draft.data);
    if (!isValidIso(date) || date < min || date > max) {
      return ctx.answerCallbackQuery({ text: "Esa fecha no está disponible, elegí otra.", show_alert: true });
    }
    draft.data[field.key] = date;
    await ctx.answerCallbackQuery();
    await markAnswered(ctx, formatDate(date));
    await advance(ctx, draft, category);
  });

  // Celdas decorativas del calendario.
  pm.callbackQuery("noop", (ctx) => ctx.answerCallbackQuery());

  // "✅ Listo" / "Saltar" en el paso de fotos.
  pm.callbackQuery(/^d:(\d+)$/, async (ctx) => {
    const current = await draftAtStep(ctx, Number(ctx.match[1]));
    if (!current) return;
    const { draft, category, field } = current;
    if (draft.photos.length === 0 && !isOptional(field, draft.data)) {
      return ctx.answerCallbackQuery({ text: "Mandá al menos una foto antes de seguir.", show_alert: true });
    }
    await ctx.answerCallbackQuery();
    const n = draft.photos.length;
    await markAnswered(ctx, n === 0 ? "Sin fotos" : `${n} foto${n === 1 ? "" : "s"}`);
    await advance(ctx, draft, category);
  });

  pm.callbackQuery("pub", async (ctx) => {
    const draft = await loadDraft();
    const category = draft && findCategory(draft.category);
    if (!draft || !category || draft.step < category.fields.length) {
      return ctx.answerCallbackQuery({ text: "No hay ninguna publicación lista para enviar." });
    }
    const wait = await waitRemaining(category);
    if (wait > 0) {
      return ctx.answerCallbackQuery({
        text: `Ya publicaste en este tema. Podés volver a publicar en ${formatWait(wait)}.`,
        show_alert: true,
      });
    }

    const groupId = Number(env.GROUP_ID);
    const topicId = Number(env[category.topicVar]);
    if (!Number.isSafeInteger(groupId) || !Number.isSafeInteger(topicId) || topicId <= 0) {
      console.error(`Falta configurar GROUP_ID o ${category.topicVar}`);
      return ctx.answerCallbackQuery({
        text: "El bot todavía no está configurado para este tema. Avisale a un administrador.",
        show_alert: true,
      });
    }

    await ctx.answerCallbackQuery();
    await markAnswered(ctx, "📤 Publicando…");
    let messageId: number;
    try {
      const text = renderPost(category, draft.data, authorOf(ctx.from));
      messageId = await sendPost(ctx.api, groupId, topicId, text, draft.photos);
    } catch (err) {
      console.error("No se pudo publicar en el grupo", err);
      const reason = err instanceof GrammyError ? err.description : String(err);
      await ctx.reply(
        "❌ No pude publicar en el grupo. Tu publicación sigue guardada: probá de nuevo en un rato o avisale a un administrador.\n\n" +
          `Motivo: ${reason}`,
        { reply_markup: confirmKeyboard() },
      );
      return;
    }

    await store.delete(DRAFT);
    if (category.weeklyLimit) await store.put(`last:${category.key}`, Date.now());
    await ctx.reply(`✅ ¡Listo! Tu publicación ya está en ${category.label}.`, {
      reply_markup: new InlineKeyboard().url("Ver publicación", postLink(groupId, topicId, messageId)),
    });
  });

  pm.callbackQuery("restart", async (ctx) => {
    await ctx.answerCallbackQuery();
    const draft = await loadDraft();
    const category = draft && findCategory(draft.category);
    await markAnswered(ctx, "🔄 Empezando de nuevo");
    if (category) await begin(ctx, category);
    else await ctx.reply("Usá /publicar para empezar.");
  });

  pm.callbackQuery("cancel", async (ctx) => {
    await ctx.answerCallbackQuery();
    await store.delete(DRAFT);
    await markAnswered(ctx, "❌ Cancelada");
  });

  pm.on("message:photo", async (ctx) => {
    const draft = await loadDraft();
    const category = draft && findCategory(draft.category);
    if (!draft || !category) return ctx.reply("Para publicar usá /publicar.");
    const field = category.fields[draft.step];
    if (field?.type !== "photos") {
      return ctx.reply("En este paso no hacen falta fotos. Respondé la última pregunta 👆");
    }

    const album = ctx.msg.media_group_id;
    const firstOfAlbum = !album || album !== draft.lastAlbum;
    draft.lastAlbum = album;
    const done = new InlineKeyboard().text("✅ Listo", `d:${draft.step}`);

    if (draft.photos.length >= MAX_PHOTOS) {
      await saveDraft(draft);
      if (firstOfAlbum) {
        await ctx.reply(`Ya cargaste ${MAX_PHOTOS} fotos, que es el máximo. Tocá ✅ Listo para seguir.`, {
          reply_markup: done,
        });
      }
      return;
    }

    // La última variante es la de mayor resolución.
    draft.photos.push(ctx.msg.photo[ctx.msg.photo.length - 1].file_id);
    await saveDraft(draft);
    if (firstOfAlbum) {
      const n = draft.photos.length;
      await ctx.reply(
        album
          ? "📷 Recibí las fotos. Podés mandar más o tocar ✅ Listo."
          : `📷 Foto recibida (${n}). Podés mandar más o tocar ✅ Listo.`,
        { reply_markup: done },
      );
    }
  });

  pm.on("message:document", (ctx) =>
    ctx.reply("Mandá las imágenes como *foto*, no como archivo.", { parse_mode: "Markdown" }),
  );

  pm.on("message:text", async (ctx) => {
    const text = ctx.msg.text.trim();
    if (text.startsWith("/")) return ctx.reply("No conozco ese comando. Usá /publicar o /cancelar.");

    const draft = await loadDraft();
    const category = draft && findCategory(draft.category);
    if (!draft || !category) return ctx.reply("Para publicar usá /publicar.");
    if (draft.step >= category.fields.length) {
      return ctx.reply("Revisá la vista previa y tocá ✅ Publicar, o /cancelar.");
    }

    const field = category.fields[draft.step];
    switch (field.type) {
      case "photos":
        return ctx.reply("En este paso mandá fotos y después tocá ✅ Listo.");
      case "choice":
        await ctx.reply("Elegí una de las opciones con los botones 👇");
        return ask(ctx, draft, category);
      case "date":
        await ctx.reply("Elegí la fecha tocando el día en el calendario 👇");
        return ask(ctx, draft, category);
      case "text":
        if (text.length < field.min) return ctx.reply("Es muy corto, contá un poco más.");
        if (text.length > field.max) {
          return ctx.reply(`Es muy largo: máximo ${field.max} caracteres (escribiste ${text.length}).`);
        }
        draft.data[field.key] = text;
        return advance(ctx, draft, category);
      case "number": {
        const value = parseNumber(text, field.integer);
        if (value === undefined) {
          return ctx.reply(
            field.integer
              ? "Escribí solo un número entero, por ejemplo: 2"
              : "Escribí solo el número, por ejemplo: 8500\n" +
                  "No se aceptan respuestas como «a consultar» o «por privado».",
          );
        }
        draft.data[field.key] = value;
        return advance(ctx, draft, category);
      }
    }
  });

  pm.on("message", (ctx) => ctx.reply("No entiendo ese tipo de mensaje. Usá /publicar para empezar."));

  // ─── Grupo: comandos de administración ─────────────────────────────────────

  const group = bot.chatType("supergroup");

  async function isAdmin(ctx: Context): Promise<boolean> {
    const member = await ctx.getAuthor();
    return member.status === "creator" || member.status === "administrator";
  }

  // /idtema: le manda por privado al admin los ids del grupo y del tema, para cargarlos como secretos.
  group.command("idtema", async (ctx) => {
    if (!(await isAdmin(ctx))) return;
    await ctx.deleteMessage().catch(() => {});
    const topic = ctx.msg.is_topic_message ? ctx.msg.message_thread_id : undefined;
    await ctx.api
      .sendMessage(
        ctx.from.id,
        `🆔 GROUP_ID: <code>${ctx.chat.id}</code>\n` +
          (topic
            ? `🆔 ID del tema: <code>${topic}</code>`
            : "Este mensaje no está dentro de un tema. Usá /idtema dentro del tema que quieras."),
        { parse_mode: "HTML" },
      )
      .catch(() => console.error("No se pudo enviar /idtema por privado: el admin no inició el bot"));
  });

  // /fijar: publica y fija en el tema el botón para publicar con el bot.
  group.command("fijar", async (ctx) => {
    if (ctx.chat.id !== Number(env.GROUP_ID) || !(await isAdmin(ctx))) return;
    await ctx.deleteMessage().catch(() => {});
    const topic = ctx.msg.is_topic_message ? ctx.msg.message_thread_id : undefined;
    const category = CATEGORIES.find((c) => topic !== undefined && Number(env[c.topicVar]) === topic);
    if (!category) {
      await ctx.api
        .sendMessage(ctx.from.id, "Ese tema no está configurado como tema de publicaciones. Revisá los TOPIC_* en Cloudflare.")
        .catch(() => {});
      return;
    }
    const text =
      `${category.emoji} <b>${category.label}</b>\n\n` +
      "Para publicar en este tema tocá <b>📢 Publicar</b>. El bot te va a pedir los datos obligatorios " +
      "paso a paso y te muestra una vista previa antes de enviar." +
      (category.weeklyLimit ? "\n\n⏳ Máximo una publicación por semana por persona." : "");
    const sent = await ctx.api.sendMessage(ctx.chat.id, text, {
      message_thread_id: topic,
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().url("📢 Publicar", `https://t.me/${ctx.me.username}?start=${category.key}`),
    });
    await ctx.api.pinChatMessage(ctx.chat.id, sent.message_id, { disable_notification: true });
  });

  return bot;
}

function categoryKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const c of CATEGORIES) kb.text(`${c.emoji} ${c.label}`, `c:${c.key}`).row();
  return kb;
}

function confirmKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Publicar", "pub")
    .row()
    .text("🔄 Empezar de nuevo", "restart")
    .text("❌ Cancelar", "cancel");
}

/** Deja registrada la respuesta en el mensaje de la pregunta y le saca los botones. */
async function markAnswered(ctx: Context, answer: string): Promise<void> {
  const original = ctx.callbackQuery?.message?.text ?? "";
  await ctx.editMessageText(`${original}\n\n➡️ ${answer}`).catch(() => {});
}

function authorOf(user: User): Author {
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
  return { id: user.id, name, username: user.username };
}

/**
 * Envía la publicación con sus fotos. Con una foto va como imagen con texto; con varias,
 * como álbum. Si el texto no entra como pie de foto, va en un mensaje aparte.
 * Devuelve el id del primer mensaje.
 */
export async function sendPost(
  api: Api,
  chatId: number,
  topicId: number | undefined,
  html: string,
  photos: string[],
): Promise<number> {
  const base = { message_thread_id: topicId };
  const text = { ...base, parse_mode: "HTML" as const };
  const fits = html.length <= MAX_CAPTION;

  if (photos.length === 0) {
    const msg = await api.sendMessage(chatId, html, { ...text, link_preview_options: { is_disabled: true } });
    return msg.message_id;
  }

  const caption = fits ? { caption: html, parse_mode: "HTML" as const } : {};
  const first =
    photos.length === 1
      ? await api.sendPhoto(chatId, photos[0], { ...base, ...caption })
      : (
          await api.sendMediaGroup(
            chatId,
            photos.map((media, i) => ({ type: "photo" as const, media, ...(i === 0 ? caption : {}) })),
            base,
          )
        )[0];

  if (!fits) {
    await api.sendMessage(chatId, html, { ...text, reply_parameters: { message_id: first.message_id } });
  }
  return first.message_id;
}

function postLink(groupId: number, topicId: number, messageId: number): string {
  return `https://t.me/c/${String(groupId).replace(/^-100/, "")}/${topicId}/${messageId}`;
}

function formatWait(ms: number): string {
  const hours = Math.ceil(ms / 3_600_000);
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  const parts = [];
  if (days) parts.push(`${days} día${days === 1 ? "" : "s"}`);
  if (rest) parts.push(`${rest} hora${rest === 1 ? "" : "s"}`);
  return parts.join(" y ");
}
