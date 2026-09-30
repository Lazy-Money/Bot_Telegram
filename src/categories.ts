import type { TopicVar } from "./env.ts";
import { formatDate } from "./dates.ts";

/**
 * Categorías de publicación y sus campos.
 *
 * Es solo datos: agregar, quitar o reordenar un campo se hace editando esta lista,
 * no la lógica del asistente. Los campos se piden en el orden en que aparecen.
 */

/** Respuestas del usuario: texto o número según el tipo de campo. */
export type Data = Record<string, string | number | undefined>;

type Condition = (data: Data) => boolean;

interface BaseField {
  key: string;
  /** Etiqueta que aparece en la publicación. */
  label: string;
  /** Pregunta que hace el bot. Puede depender de respuestas anteriores. */
  prompt: string | ((data: Data) => string);
  /** El campo solo se pide si la condición se cumple. */
  when?: Condition;
  /** Se puede saltear. */
  optional?: boolean | Condition;
  /** No se muestra como línea propia en la publicación (ya aparece en el título o resumen). */
  hideInPost?: boolean;
  /** Valor a mostrar en la publicación, si no es la respuesta tal cual (puede combinar varios campos). */
  display?: (data: Data) => string | undefined;
}

export interface PhotosField extends BaseField {
  type: "photos";
}

export interface TextField extends BaseField {
  type: "text";
  min: number;
  max: number;
}

export interface NumberField extends BaseField {
  type: "number";
  unit?: string;
  integer?: boolean;
}

export interface ChoiceField extends BaseField {
  type: "choice";
  options: string[];
}

/** Fecha elegida en un calendario de botones; se guarda como "AAAA-MM-DD". */
export interface DateField extends BaseField {
  type: "date";
  /** La fecha tiene que ser posterior a la de este otro campo. Si no, desde hoy. */
  after?: string;
}

export type Field = PhotosField | TextField | NumberField | ChoiceField | DateField;

export interface Category {
  key: string;
  label: string;
  emoji: string;
  topicVar: TopicVar;
  /** Una sola publicación por usuario cada 7 días en este tema. */
  weeklyLimit?: boolean;
  /** Título de la publicación. Por defecto, el nombre de la categoría. */
  title?: (data: Data) => string;
  /** Línea destacada debajo del título (texto plano, se escapa al renderizar). */
  summary?: (data: Data) => string;
  fields: Field[];
}

export const MAX_PHOTOS = 10;

const YES_NO = ["Sí", "No"];

const comentarios: TextField = {
  key: "comentarios",
  label: "📝 Comentarios",
  prompt: "📝 ¿Querés agregar algún comentario o detalle más? Si no, tocá Saltar.",
  type: "text",
  min: 3,
  max: 300,
  optional: true,
};

const LIMITED = "Sí, tiene fecha de fin";
const UNLIMITED = "No, sin fecha de fin";

function rentalFields(withCpr: boolean): Field[] {
  const fields: Field[] = [
    {
      key: "fotos",
      label: "Fotos",
      prompt:
        `📷 Mandá las fotos del inmueble (mínimo 1, máximo ${MAX_PHOTOS}).\n` +
        "Cuando termines, tocá ✅ Listo.",
      type: "photos",
    },
    {
      key: "direccion",
      label: "📍 Dirección aproximada",
      prompt: "📍 ¿Dónde queda? Escribí la dirección aproximada o la zona.",
      type: "text",
      min: 3,
      max: 150,
    },
    {
      key: "alquiler",
      label: "💰 Alquiler mensual",
      prompt: "💰 ¿Cuánto es el alquiler mensual en DKK? Escribí solo el número.",
      type: "number",
      unit: "DKK",
    },
    {
      key: "servicios",
      label: "💡 Incluye servicios",
      prompt: "💡 ¿El alquiler incluye servicios?",
      type: "choice",
      options: YES_NO,
    },
    {
      key: "ingreso",
      label: "🔑 Monto para ingresar",
      prompt: withCpr
        ? "🔑 ¿Cuánto hay que pagar para ingresar a la propiedad (depósito, adelantos) en DKK?"
        : "🔑 ¿Cuánto hay que pagar para ingresar (depósito, adelantos) en DKK?\n" +
          "Si preferís coordinarlo en privado, tocá Saltar.",
      type: "number",
      unit: "DKK",
      optional: !withCpr,
    },
    {
      key: "periodo",
      label: "📅 Período disponible",
      prompt: "📅 ¿El alquiler es por un período limitado?",
      type: "choice",
      options: [LIMITED, UNLIMITED],
      display: (d) =>
        d.periodo === LIMITED
          ? `del ${formatDate(String(d.desde))} al ${formatDate(String(d.hasta))}`
          : `desde el ${formatDate(String(d.desde))} (sin fecha de fin)`,
    },
    {
      key: "desde",
      label: "Desde",
      prompt: "📅 ¿Desde qué día está disponible? Elegilo en el calendario.",
      type: "date",
      hideInPost: true,
    },
    {
      key: "hasta",
      label: "Hasta",
      prompt: "📅 ¿Hasta qué día? Elegilo en el calendario.",
      type: "date",
      after: "desde",
      when: (d) => d.periodo === LIMITED,
      hideInPost: true,
    },
  ];
  if (withCpr) {
    fields.push({
      key: "cpr",
      label: "🪪 CPR disponibles",
      prompt: "🪪 ¿Cuántas personas pueden registrar su CPR en la dirección?",
      type: "number",
      integer: true,
    });
  }
  fields.push(
    {
      key: "amueblado",
      label: "🛋️ Amueblado",
      prompt: "🛋️ ¿Está amueblado?",
      type: "choice",
      options: YES_NO,
    },
    {
      key: "mascotas",
      label: "🐾 Apto mascotas",
      prompt: "🐾 ¿Es apto mascotas?",
      type: "choice",
      options: YES_NO,
    },
    comentarios,
  );
  return fields;
}

const CURRENCIES = ["DKK", "EUR", "USD", "USDT", "Otra"];
const FORMATS = ["Cash", "En cuenta"];

function currencyFields(side: "tengo" | "busco"): Field[] {
  const verb = side === "tengo" ? "tenés" : "buscás";
  return [
    {
      key: side,
      label: side,
      prompt: `💱 ¿Qué divisa ${verb}?`,
      type: "choice",
      options: CURRENCIES,
      hideInPost: true,
    },
    {
      key: `${side}_otra`,
      label: side,
      prompt: `💱 ¿Qué divisa ${verb}? Escribila.`,
      type: "text",
      min: 2,
      max: 30,
      when: (d) => d[side] === "Otra",
      hideInPost: true,
    },
    {
      key: `${side}_formato`,
      label: side,
      prompt: `💱 ¿En qué formato la ${verb}?`,
      type: "choice",
      options: FORMATS,
      // USDT es cripto por definición: no tiene sentido preguntar cash o cuenta.
      when: (d) => d[side] !== "USDT",
      hideInPost: true,
    },
  ];
}

function currencyText(d: Data, side: "tengo" | "busco"): string {
  const currency = d[side] === "Otra" ? d[`${side}_otra`] : d[side];
  const format = d[`${side}_formato`];
  return format ? `${currency} ${String(format).toLowerCase()}` : String(currency);
}

const isBuying: Condition = (d) => d.operacion === "Compro";

export const CATEGORIES: Category[] = [
  {
    key: "alquiler_sin_cpr",
    label: "Alquiler sin CPR",
    emoji: "🏠",
    topicVar: "TOPIC_ALQUILER_SIN_CPR",
    fields: rentalFields(false),
  },
  {
    key: "alquiler_con_cpr",
    label: "Alquiler con CPR",
    emoji: "🏠",
    topicVar: "TOPIC_ALQUILER_CON_CPR",
    fields: rentalFields(true),
  },
  {
    key: "laboral",
    label: "Oferta laboral",
    emoji: "💼",
    topicVar: "TOPIC_LABORAL",
    fields: [
      {
        key: "empresa",
        label: "🏢 Empresa",
        prompt: "🏢 ¿Cuál es el nombre de la empresa?",
        type: "text",
        min: 2,
        max: 80,
      },
      {
        key: "puesto",
        label: "👷 Puesto",
        prompt: "👷 ¿Qué puesto está vacante?",
        type: "text",
        min: 2,
        max: 80,
      },
      {
        key: "sueldo",
        label: "💰 Remuneración bruta",
        prompt: "💰 ¿Cuál es la remuneración bruta por hora en DKK? Escribí solo el número.",
        type: "number",
        unit: "DKK/hora",
      },
      {
        key: "horas",
        label: "⏱️ Horas semanales",
        prompt: "⏱️ ¿Cuántas horas semanales son?",
        type: "number",
        unit: "hs",
      },
      {
        key: "ubicacion",
        label: "📍 Ubicación",
        prompt: "📍 ¿Dónde es el trabajo?",
        type: "text",
        min: 2,
        max: 100,
      },
      {
        key: "cpr",
        label: "🪪 CPR necesario",
        prompt: "🪪 ¿Es necesario tener CPR?",
        type: "choice",
        options: YES_NO,
      },
      comentarios,
    ],
  },
  {
    key: "exchange",
    label: "Exchange",
    emoji: "💱",
    topicVar: "TOPIC_EXCHANGE",
    summary: (d) => `Tengo ${currencyText(d, "tengo")}, busco ${currencyText(d, "busco")}.`,
    fields: [
      ...currencyFields("tengo"),
      ...currencyFields("busco"),
      {
        key: "monto",
        label: "💵 Monto",
        prompt: "💵 ¿Qué monto querés cambiar? (por ejemplo: 500 EUR). Si no, tocá Saltar.",
        type: "text",
        min: 1,
        max: 50,
        optional: true,
      },
      comentarios,
    ],
  },
  {
    key: "compraventa",
    label: "Compra / Venta / Regalos",
    emoji: "🛒",
    topicVar: "TOPIC_COMPRAVENTA",
    weeklyLimit: true,
    title: (d) => `${d.operacion}: ${d.titulo}`,
    fields: [
      {
        key: "operacion",
        label: "Operación",
        prompt: "🛒 ¿Qué querés hacer?",
        type: "choice",
        options: ["Vendo", "Compro", "Regalo"],
        hideInPost: true,
      },
      {
        key: "fotos",
        label: "Fotos",
        prompt: (d) =>
          isBuying(d)
            ? "📷 Si tenés una foto de lo que buscás, mandala: no es obligatorio, pero llama más la atención.\n" +
              "Cuando termines, tocá ✅ Listo, o Saltar si no tenés."
            : `📷 Mandá fotos de lo que ofrecés (mínimo 1, máximo ${MAX_PHOTOS}).\n` +
              "Cuando termines, tocá ✅ Listo.",
        type: "photos",
        optional: isBuying,
      },
      {
        key: "titulo",
        label: "Título",
        prompt: (d) =>
          isBuying(d)
            ? "🏷️ ¿Qué buscás? Escribí un título corto."
            : "🏷️ ¿Qué es? Escribí un título corto (por ejemplo: «Bicicleta de ciudad talle M»).",
        type: "text",
        min: 3,
        max: 80,
        hideInPost: true,
      },
      {
        key: "estado",
        label: "✨ Estado",
        prompt: "✨ ¿En qué estado está?",
        type: "choice",
        options: ["Nuevo", "Como nuevo", "Usado", "Para reparar"],
        when: (d) => !isBuying(d),
      },
      {
        key: "precio",
        label: "💰 Precio",
        prompt: "💰 ¿Cuál es el precio en DKK? Escribí solo el número.",
        type: "number",
        unit: "DKK",
        when: (d) => d.operacion === "Vendo",
      },
      {
        key: "presupuesto",
        label: "💰 Presupuesto",
        prompt: "💰 ¿Cuánto querés gastar como máximo, en DKK? Si no sabés, tocá Saltar.",
        type: "number",
        unit: "DKK",
        when: isBuying,
        optional: true,
      },
      {
        key: "direccion",
        label: "📍 Dirección",
        prompt: "📍 ¿Dónde es? Escribí la dirección o la zona.",
        type: "text",
        min: 3,
        max: 150,
      },
      {
        key: "descripcion",
        label: "📝 Detalles",
        prompt: "📝 ¿Querés agregar más detalles (medidas, marca, motivo)? Si no, tocá Saltar.",
        type: "text",
        min: 3,
        max: 400,
        optional: true,
      },
    ],
  },
  {
    key: "eventos",
    label: "Eventos, Servicios y Avisos",
    emoji: "📣",
    topicVar: "TOPIC_EVENTOS",
    weeklyLimit: true,
    title: (d) => `${d.tipo}: ${d.titulo}`,
    fields: [
      {
        key: "tipo",
        label: "Tipo",
        prompt: "📣 ¿Qué querés publicar?",
        type: "choice",
        options: ["Evento", "Servicio", "Aviso"],
        hideInPost: true,
      },
      {
        key: "titulo",
        label: "Título",
        prompt: "🏷️ Escribí un título corto.",
        type: "text",
        min: 3,
        max: 80,
        hideInPost: true,
      },
      {
        key: "fecha",
        label: "📅 Fecha y hora",
        prompt: "📅 ¿Cuándo es el evento? (fecha y hora)",
        type: "text",
        min: 3,
        max: 80,
        when: (d) => d.tipo === "Evento",
      },
      {
        key: "descripcion",
        label: "📝 Descripción",
        prompt: "📝 Contá de qué se trata.",
        type: "text",
        min: 10,
        max: 600,
      },
      {
        key: "precio",
        label: "💰 Precio",
        prompt: "💰 ¿Tiene precio o valor? (por ejemplo: «200 DKK la hora» o «entrada libre»). Si no, tocá Saltar.",
        type: "text",
        min: 1,
        max: 60,
        optional: true,
      },
      {
        key: "fotos",
        label: "Fotos",
        prompt:
          `📷 Si querés, mandá fotos o un flyer (máximo ${MAX_PHOTOS}).\n` +
          "Cuando termines, tocá ✅ Listo, o Saltar si no tenés.",
        type: "photos",
        optional: true,
      },
    ],
  },
];

export function findCategory(key: string): Category | undefined {
  return CATEGORIES.find((c) => c.key === key);
}

export function applies(field: Field, data: Data): boolean {
  return !field.when || field.when(data);
}

export function isOptional(field: Field, data: Data): boolean {
  return typeof field.optional === "function" ? field.optional(data) : field.optional === true;
}

export function promptFor(field: Field, data: Data): string {
  return typeof field.prompt === "function" ? field.prompt(data) : field.prompt;
}

/** Índice del próximo campo que corresponde pedir, o `fields.length` si ya no quedan. */
export function nextStep(category: Category, data: Data, from: number): number {
  for (let i = from; i < category.fields.length; i++) {
    if (applies(category.fields[i], data)) return i;
  }
  return category.fields.length;
}
