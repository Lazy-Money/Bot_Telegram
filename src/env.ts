import type { UserSession } from "./session.ts";

/** Variables y bindings que Cloudflare inyecta al Worker. Los valores reales nunca viven en el repo. */
export interface Env {
  BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
  GROUP_ID: string;
  TOPIC_ALQUILER_SIN_CPR: string;
  TOPIC_ALQUILER_CON_CPR: string;
  TOPIC_LABORAL: string;
  TOPIC_EXCHANGE: string;
  TOPIC_COMPRAVENTA: string;
  TOPIC_EVENTOS: string;
  USERS: DurableObjectNamespace<UserSession>;
}

/** Nombres de las variables que guardan el id de cada tema del grupo. */
export type TopicVar = Extract<keyof Env, `TOPIC_${string}`>;
