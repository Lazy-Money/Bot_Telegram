// Simula conversaciones completas contra una API de Telegram falsa: no hace llamadas reales.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Update } from "grammy/types";
import { createBot, type Store } from "../src/bot.ts";
import { parseNumber, formatNumber } from "../src/format.ts";
import type { Env } from "../src/env.ts";

const GROUP = -1000000000001; // id ficticio
const env = {
  BOT_TOKEN: "123:test",
  WEBHOOK_SECRET: "s",
  GROUP_ID: String(GROUP),
  TOPIC_ALQUILER_SIN_CPR: "11",
  TOPIC_ALQUILER_CON_CPR: "12",
  TOPIC_LABORAL: "13",
  TOPIC_EXCHANGE: "14",
  TOPIC_COMPRAVENTA: "15",
  TOPIC_EVENTOS: "16",
} as Env;

const USER = { id: 42, is_bot: false, first_name: "Ana", last_name: "Pérez", username: "anap" };

interface Call {
  method: string;
  payload: Record<string, any>;
}

function harness() {
  const data = new Map<string, unknown>();
  const store: Store = {
    get: async (k) => structuredClone(data.get(k)) as any,
    put: async (k, v) => void data.set(k, structuredClone(v)),
    delete: async (k) => data.delete(k),
  };
  const bot = createBot(env, store, {
    id: 1,
    is_bot: true,
    first_name: "Bot",
    username: "PublicadorBot",
    can_join_groups: true,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
    can_connect_to_business: false,
    has_main_web_app: false,
  } as any);

  const calls: Call[] = [];
  let nextId = 100;
  bot.api.config.use(async (_prev, method, payload) => {
    calls.push({ method, payload: payload as any });
    const msg = () => ({ message_id: nextId++, date: 0, chat: { id: (payload as any).chat_id, type: "private" } });
    let result: unknown = true;
    if (method === "sendMediaGroup") result = (payload as any).media.map(msg);
    else if (method.startsWith("send")) result = msg();
    else if (method === "getChatMember") result = { status: "administrator", user: USER };
    return { ok: true, result } as any;
  });

  let updateId = 1;
  let lastPromptId = 0;
  const base = () => ({ message_id: nextId++, date: 0, chat: { id: USER.id, type: "private" as const }, from: USER });
  const send = (u: Omit<Update, "update_id">) => bot.handleUpdate({ update_id: updateId++, ...u } as Update);

  return {
    calls,
    data,
    text: (text: string) =>
      send({
        message: {
          ...base(),
          text,
          ...(text.startsWith("/")
            ? { entities: [{ type: "bot_command", offset: 0, length: text.split(" ")[0].length }] }
            : {}),
        } as any,
      }),
    photo: (fileId: string, album?: string) =>
      send({
        message: {
          ...base(),
          photo: [
            { file_id: `${fileId}-small`, file_unique_id: "s", width: 90, height: 90 },
            { file_id: fileId, file_unique_id: "b", width: 900, height: 900 },
          ],
          ...(album ? { media_group_id: album } : {}),
        } as any,
      }),
    tap: (data: string) =>
      send({
        callback_query: {
          id: String(updateId),
          from: USER,
          chat_instance: "x",
          data,
          message: { ...base(), message_id: lastPromptId, text: "pregunta" },
        } as any,
      }),
    /** Texto de la última respuesta del bot al usuario. */
    lastReply: () => [...calls].reverse().find((c) => c.method === "sendMessage")?.payload.text as string,
    /** Botón (callback_data) que contiene `needle` en la última respuesta con teclado. */
    button: (needle: string) => {
      const kb = [...calls].reverse().find((c) => c.payload.reply_markup?.inline_keyboard)?.payload.reply_markup
        .inline_keyboard as { text: string; callback_data?: string }[][];
      const btn = kb.flat().find((b) => b.text.includes(needle));
      assert.ok(btn, `no hay botón «${needle}»`);
      return btn.callback_data!;
    },
    groupCommand: (text: string, topic: number) =>
      send({
        message: {
          message_id: nextId++,
          date: 0,
          chat: { id: GROUP, type: "supergroup", title: "G", is_forum: true },
          from: USER,
          text,
          entities: [{ type: "bot_command", offset: 0, length: text.length }],
          is_topic_message: true,
          message_thread_id: topic,
        } as any,
      }),
    toGroup: () => calls.filter((c) => c.payload.chat_id === GROUP),
  };
}

test("parseNumber acepta montos razonables y rechaza texto", () => {
  assert.equal(parseNumber("8500"), 8500);
  assert.equal(parseNumber("8.500"), 8500);
  assert.equal(parseNumber("8 500 kr"), 8500);
  assert.equal(parseNumber("8500 DKK"), 8500);
  assert.equal(parseNumber("1.250.000"), 1250000);
  assert.equal(parseNumber("150,50"), 150.5);
  assert.equal(parseNumber("a consultar"), undefined);
  assert.equal(parseNumber("por privado"), undefined);
  assert.equal(parseNumber("0"), undefined);
  assert.equal(parseNumber("1,5", true), undefined);
  assert.equal(formatNumber(12500), "12.500");
  assert.equal(formatNumber(150.5), "150,50");
});

test("alquiler sin CPR: exige fotos y número, permite saltear el monto de ingreso y publica en su tema", async () => {
  const h = harness();
  await h.text("/start alquiler_sin_cpr");

  // Sin fotos no se puede avanzar.
  await h.tap("d:0");
  assert.equal(h.calls.at(-1)!.method, "answerCallbackQuery");
  assert.match(h.calls.at(-1)!.payload.text, /al menos una foto/);

  // Álbum de 3 fotos: se guardan todas y se responde una sola vez.
  const before = h.calls.length;
  await h.photo("f1", "alb");
  await h.photo("f2", "alb");
  await h.photo("f3", "alb");
  assert.equal(h.calls.slice(before).filter((c) => c.method === "sendMessage").length, 1);
  await h.tap(h.button("Listo"));

  await h.text("Nørrebro, cerca de la estación");
  await h.text("a consultar");
  assert.match(h.lastReply(), /solo el número/);
  await h.text("8.500 kr");
  await h.tap(h.button("Sí")); // servicios
  await h.tap(h.button("Saltar")); // monto para ingresar (opcional sin CPR)
  await h.text("del 1/11 al 31/1");
  await h.tap(h.button("No")); // amueblado
  await h.tap(h.button("Sí")); // mascotas
  await h.tap(h.button("Saltar")); // comentarios

  // Vista previa al usuario con el álbum.
  const preview = h.calls.filter((c) => c.method === "sendMediaGroup" && c.payload.chat_id === USER.id);
  assert.equal(preview.length, 1);
  assert.deepEqual(preview[0].payload.media.map((m: any) => m.media), ["f1", "f2", "f3"]);

  await h.tap("pub");
  const [post] = h.toGroup();
  assert.equal(post.method, "sendMediaGroup");
  assert.equal(post.payload.message_thread_id, 11);
  const caption: string = post.payload.media[0].caption;
  assert.match(caption, /Alquiler sin CPR/);
  assert.match(caption, /8\.500 DKK/);
  assert.match(caption, /Incluye servicios:<\/b> Sí/);
  assert.doesNotMatch(caption, /Monto para ingresar/);
  assert.match(caption, /tg:\/\/user\?id=42">Ana Pérez<\/a> · @anap/);
  assert.equal(h.data.has("draft"), false);
});

test("alquiler con CPR: el monto de ingreso es obligatorio y pide cantidad de CPR", async () => {
  const h = harness();
  await h.text("/start alquiler_con_cpr");
  await h.photo("f1");
  await h.tap(h.button("Listo"));
  await h.text("Vesterbro");
  await h.text("9000");
  await h.tap(h.button("No"));
  await h.tap("s:4"); // intentar saltear el monto de ingreso
  assert.match(h.calls.at(-1)!.payload.text, /obligatorio/);
  await h.text("18000");
  await h.text("desde el 1/12");
  await h.text("1,5");
  assert.match(h.lastReply(), /entero/);
  await h.text("2");
  await h.tap(h.button("Sí"));
  await h.tap(h.button("No"));
  await h.tap(h.button("Saltar"));
  await h.tap("pub");
  const [post] = h.toGroup();
  assert.equal(post.method, "sendPhoto");
  assert.equal(post.payload.message_thread_id, 12);
  assert.match(post.payload.caption, /CPR disponibles:<\/b> 2/);
  assert.match(post.payload.caption, /Monto para ingresar:<\/b> 18\.000 DKK/);
});

test("exchange arma la frase «Tengo … busco …» y no pide formato para USDT", async () => {
  const h = harness();
  await h.text("/start exchange");
  await h.tap(h.button("EUR"));
  await h.tap(h.button("Cash"));
  await h.tap(h.button("USDT"));
  await h.tap(h.button("Saltar")); // monto
  await h.tap(h.button("Saltar")); // comentarios
  await h.tap("pub");
  const [post] = h.toGroup();
  assert.equal(post.method, "sendMessage");
  assert.equal(post.payload.message_thread_id, 14);
  assert.match(post.payload.text, /Tengo EUR cash, busco USDT\./);
});

test("compra: fotos opcionales; venta: fotos obligatorias; límite de una publicación por semana", async () => {
  const h = harness();
  await h.text("/start compraventa");
  await h.tap(h.button("Compro"));
  await h.tap(h.button("Saltar")); // fotos opcionales al comprar
  await h.text("Bicicleta de ciudad");
  await h.tap(h.button("Saltar")); // presupuesto
  await h.text("Amager");
  await h.tap(h.button("Saltar")); // detalles
  await h.tap("pub");
  const [post] = h.toGroup();
  assert.match(post.payload.text, /Compro: Bicicleta de ciudad/);
  assert.equal(post.payload.message_thread_id, 15);

  // Segunda publicación en la misma semana: bloqueada desde el inicio.
  await h.text("/start compraventa");
  assert.match(h.lastReply(), /podés volver a publicar en 7 días/);

  // Venta en otro usuario: sin fotos no avanza.
  const h2 = harness();
  await h2.text("/start compraventa");
  await h2.tap(h2.button("Vendo"));
  assert.equal(
    [...h2.calls].reverse().find((c) => c.method === "sendMessage")!.payload.reply_markup,
    undefined,
    "venta no ofrece Saltar en fotos",
  );
  await h2.tap("d:1");
  assert.match(h2.calls.at(-1)!.payload.text, /al menos una foto/);
});

test("botones viejos no afectan el paso actual", async () => {
  const h = harness();
  await h.text("/start laboral");
  await h.text("Acme");
  await h.tap("v:5:0"); // botón de un paso que todavía no llegó
  assert.match(h.calls.at(-1)!.payload.text, /ya no está vigente/);
});

test("/fijar en un tema publica y fija el botón con el enlace al bot", async () => {
  const h = harness();
  await h.groupCommand("/fijar", 15);
  const post = h.toGroup().find((c) => c.method === "sendMessage")!;
  assert.equal(post.payload.message_thread_id, 15);
  assert.equal(
    post.payload.reply_markup.inline_keyboard[0][0].url,
    "https://t.me/PublicadorBot?start=compraventa",
  );
  assert.ok(h.calls.some((c) => c.method === "pinChatMessage"));
  assert.ok(h.calls.some((c) => c.method === "deleteMessage"));
});

test("/idtema le manda los ids al admin por privado", async () => {
  const h = harness();
  await h.groupCommand("/idtema", 13);
  const dm = h.calls.find((c) => c.method === "sendMessage")!;
  assert.equal(dm.payload.chat_id, USER.id);
  assert.match(dm.payload.text, /ID del tema: <code>13<\/code>/);
});
