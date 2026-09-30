import { DurableObject } from "cloudflare:workers";
import type { Bot } from "grammy";
import type { Update } from "grammy/types";
import type { Env } from "./env.ts";
import { createBot } from "./bot.ts";

/**
 * Una instancia por usuario de Telegram. Guarda su publicación en armado y la fecha
 * de su última publicación por tema.
 *
 * Los updates del mismo usuario se procesan estrictamente en orden: si alguien manda
 * un álbum de 5 fotos llegan 5 updates casi juntos, y así no se pisa ninguno.
 */
export class UserSession extends DurableObject<Env> {
  private bot: Bot;
  private ready?: Promise<void>;
  private queue: Promise<void> = Promise.resolve();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.bot = createBot(env, {
      get: (key) => ctx.storage.get(key),
      put: (key, value) => ctx.storage.put(key, value),
      delete: (key) => ctx.storage.delete(key),
    });
  }

  async handle(update: Update): Promise<void> {
    const run = this.queue.then(() => this.process(update));
    this.queue = run.catch(() => {});
    return run;
  }

  private async process(update: Update): Promise<void> {
    // getMe una sola vez por instancia; si falla, se reintenta en el próximo update.
    this.ready ??= this.bot.init().catch((err) => {
      this.ready = undefined;
      throw err;
    });
    await this.ready;
    await this.bot.handleUpdate(update);
  }
}
