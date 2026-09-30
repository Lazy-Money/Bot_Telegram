/** Variables y bindings que Cloudflare inyecta al Worker. Los valores reales nunca viven en el repo. */
export interface Env {
  BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
  GROUP_ID: string;
  TOPIC_TRABAJO: string;
  TOPIC_COMPRAVENTA: string;
  TOPIC_ALQUILERES: string;
  TOPIC_DIVISAS: string;
  SESSIONS: KVNamespace;
}
