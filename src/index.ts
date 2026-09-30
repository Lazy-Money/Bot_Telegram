import { webhookCallback } from "grammy";
import type { Env } from "./env";
import { createBot } from "./bot";

/**
 * Punto de entrada del Worker. Telegram hace un POST acá por cada mensaje;
 * el código corre solo mientras dura esa petición.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/webhook") {
      const bot = createBot(env);
      // grammY rechaza con 401 cualquier petición sin el header
      // X-Telegram-Bot-Api-Secret-Token correcto.
      const handle = webhookCallback(bot, "cloudflare-mod", {
        secretToken: env.WEBHOOK_SECRET,
      });
      return handle(request);
    }

    return new Response("ok", { status: 200 });
  },
};
