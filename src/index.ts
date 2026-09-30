import { Api } from "grammy";
import type { Update } from "grammy/types";
import type { Env } from "./env.ts";

export { UserSession } from "./session.ts";

/**
 * Punto de entrada del Worker. Telegram hace un POST a /webhook por cada mensaje;
 * el código corre solo mientras dura esa petición.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/webhook" && request.method === "POST") {
      if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) {
        return new Response("unauthorized", { status: 401 });
      }
      const update = (await request.json()) as Update;
      const userId = relevantUserId(update);
      if (userId !== undefined) {
        try {
          await env.USERS.get(env.USERS.idFromName(String(userId))).handle(update);
        } catch (err) {
          // Se responde 200 igual: si no, Telegram reintenta el mismo update en loop.
          console.error("Error procesando update", err);
        }
      }
      return new Response("ok");
    }

    if (url.pathname === "/setup") return setup(url, env);

    return new Response("ok");
  },
};

/**
 * A quién pertenece el update, o `undefined` si el bot lo ignora.
 * Como el bot es admin del grupo recibe todos los mensajes del grupo: solo pasan los comandos.
 */
function relevantUserId(update: Update): number | undefined {
  if (update.callback_query) return update.callback_query.from.id;
  const msg = update.message;
  if (!msg?.from) return undefined;
  if (msg.chat.type === "private") return msg.from.id;
  return msg.text?.startsWith("/") ? msg.from.id : undefined;
}

/**
 * Registra el webhook en Telegram y los comandos del bot. Se abre una sola vez desde el navegador:
 * https://<worker>/setup?secret=<WEBHOOK_SECRET>
 */
async function setup(url: URL, env: Env): Promise<Response> {
  if (!env.WEBHOOK_SECRET || url.searchParams.get("secret") !== env.WEBHOOK_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }
  try {
    const api = new Api(env.BOT_TOKEN);
    await api.setWebhook(`${url.origin}/webhook`, {
      secret_token: env.WEBHOOK_SECRET,
      allowed_updates: ["message", "callback_query"],
    });
    await api.setMyCommands(
      [
        { command: "publicar", description: "Crear una publicación" },
        { command: "cancelar", description: "Cancelar la publicación en curso" },
      ],
      { scope: { type: "all_private_chats" } },
    );
    const me = await api.getMe();
    return new Response(`✅ Webhook configurado para @${me.username}. Ya podés usar el bot.`, {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  } catch (err) {
    return new Response(`❌ Error configurando el bot: ${err instanceof Error ? err.message : err}`, {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}
