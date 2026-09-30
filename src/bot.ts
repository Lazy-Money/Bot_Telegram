import { Bot, InlineKeyboard } from "grammy";
import type { Env } from "./env";
import { CATEGORIES, findCategory } from "./categories";

const CATEGORY_CALLBACK = "cat:";

/** Arma el bot con sus comandos. Se crea uno por request: el Worker no guarda estado en memoria. */
export function createBot(env: Env): Bot {
  const bot = new Bot(env.BOT_TOKEN);

  // El asistente vive en el chat privado. En el grupo el bot no responde a nadie.
  const privado = bot.chatType("private");

  // /start puede traer una categoría como payload: t.me/<bot>?start=alquileres
  privado.command("start", async (ctx) => {
    const category = findCategory(ctx.match.trim());
    if (category) {
      await startCategory(ctx, category.key);
      return;
    }
    await ctx.reply(
      "¡Hola! Soy el bot de publicaciones del grupo.\n\n" +
        "Usá /publicar para crear una publicación paso a paso.",
    );
  });

  privado.command("publicar", async (ctx) => {
    await ctx.reply("¿Qué querés publicar?", { reply_markup: categoryKeyboard() });
  });

  privado.callbackQuery(new RegExp(`^${CATEGORY_CALLBACK}(.+)$`), async (ctx) => {
    await ctx.answerCallbackQuery();
    await startCategory(ctx, ctx.match[1]);
  });

  return bot;
}

function categoryKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const c of CATEGORIES) {
    kb.text(`${c.emoji} ${c.label}`, `${CATEGORY_CALLBACK}${c.key}`).row();
  }
  return kb;
}

// Punto de entrada del asistente. Por ahora solo confirma la categoría;
// el formulario paso a paso se implementa en la siguiente etapa.
async function startCategory(
  ctx: { reply: (text: string) => Promise<unknown> },
  key: string,
): Promise<void> {
  const category = findCategory(key);
  if (!category) {
    await ctx.reply("No reconozco esa categoría. Usá /publicar para elegir una.");
    return;
  }
  await ctx.reply(
    `${category.emoji} Elegiste *${category.label}*.\n\n` +
      "El formulario para esta categoría todavía está en construcción.",
  );
}
