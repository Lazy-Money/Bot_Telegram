import type { Env } from "./env";

/**
 * Definición de las categorías de publicación y sus campos.
 *
 * Es solo datos: agregar o cambiar un campo se hace editando esta lista,
 * no la lógica del asistente.
 */

export type FieldType =
  | "photos" // una o más fotos, se piden hasta que el usuario toque "Listo"
  | "text" // texto libre
  | "number" // número (precio, monto); rechaza "consultar", "por privado", etc.
  | "choice"; // una opción entre botones

export interface Field {
  key: string;
  label: string;
  prompt: string;
  type: FieldType;
  /** Solo para `choice`. */
  options?: string[];
  /** Solo para `text`: largo mínimo. */
  minLength?: number;
  /** Solo para `photos`: cantidad mínima. */
  minPhotos?: number;
}

export interface Category {
  key: string;
  label: string;
  emoji: string;
  /** Nombre de la variable de entorno que tiene el id del tema donde se publica. */
  topicVar: keyof Pick<
    Env,
    "TOPIC_TRABAJO" | "TOPIC_COMPRAVENTA" | "TOPIC_ALQUILERES" | "TOPIC_DIVISAS"
  >;
  fields: Field[];
}

// Los campos de cada categoría se definen en el siguiente paso junto con el usuario.
export const CATEGORIES: Category[] = [
  { key: "trabajo", label: "Trabajo", emoji: "💼", topicVar: "TOPIC_TRABAJO", fields: [] },
  {
    key: "compraventa",
    label: "Compra / Venta / Regalo",
    emoji: "🛒",
    topicVar: "TOPIC_COMPRAVENTA",
    fields: [],
  },
  { key: "alquileres", label: "Alquileres", emoji: "🏠", topicVar: "TOPIC_ALQUILERES", fields: [] },
  { key: "divisas", label: "Cambio de divisas", emoji: "💱", topicVar: "TOPIC_DIVISAS", fields: [] },
];

export function findCategory(key: string): Category | undefined {
  return CATEGORIES.find((c) => c.key === key);
}
