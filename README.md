# Bot de publicaciones para Telegram

Bot que obliga a que las publicaciones del grupo se hagan con un formulario guiado: fotos, dirección, precio, etc. son obligatorios según el tema, y no se puede publicar hasta completarlos.

Corre en **Cloudflare Workers** (plan gratuito): no necesita servidor ni computadora prendida. Telegram avisa cuando llega un mensaje y el código corre solo en ese momento. Cloudflare despliega el bot directamente desde este repositorio de GitHub: no hay que instalar nada.

## Cómo funciona

1. Los temas de publicaciones del grupo están **cerrados**: solo admins y el bot escriben ahí. El chat general sigue abierto.
2. En cada tema hay un mensaje fijado con el botón **📢 Publicar**, que abre el chat privado con el bot.
3. El bot pide los datos de a uno, valida cada respuesta (por ejemplo, el precio tiene que ser un número: no acepta «a consultar»), muestra una vista previa y recién ahí deja publicar.
4. El bot publica en el tema correspondiente, con formato uniforme y el nombre del autor clickeable (y su @usuario si tiene), para que lo contacten por privado.
5. En **Compra / Venta / Regalos** y **Eventos, Servicios y Avisos**, cada persona puede publicar una vez por semana por tema.

### Temas y datos que se piden

| Tema | Datos |
|---|---|
| 🏠 Alquiler sin CPR | fotos*, dirección aproximada, alquiler mensual (DKK), incluye servicios, monto para ingresar (opcional), período disponible (fechas de inicio y fin elegidas en un calendario; sin fechas pasadas), amueblado, apto mascotas |
| 🏠 Alquiler con CPR | lo mismo, con monto para ingresar obligatorio y cantidad de CPR disponibles |
| 💼 Ofertas laborales | empresa, puesto, remuneración bruta por hora (DKK), horas semanales, ubicación, CPR necesario |
| 💱 Exchange | divisa y formato que tiene, divisa y formato que busca (arma «Tengo X, busco Y»), monto (opcional) |
| 🛒 Compra / Venta / Regalos | vendo/compro/regalo, fotos* (opcionales si compra), título, estado, precio (si vende), dirección |
| 📣 Eventos, Servicios y Avisos | tipo, título, fecha (si es evento), descripción, precio (opcional), fotos (opcionales) |

\* obligatorio. Todos los temas terminan con un campo opcional de comentarios o detalles. Los campos se definen en [`src/categories.ts`](src/categories.ts).

## Puesta en marcha

> ⚠️ Ningún token ni ID se guarda en el repositorio. Todos se cargan como **Secret** en el panel de Cloudflare. Ver `CLAUDE.md`, Regla #3.

### 1. Conectar el repositorio en Cloudflare

1. En el panel de Cloudflare: **Workers & Pages** → **Create** → **Import a repository** (o «Connect to Git»).
2. Autorizar GitHub y elegir este repositorio.
3. Configuración:
   - **Project name**: `bot-telegram-publicaciones` (tiene que coincidir con el `name` de `wrangler.toml`).
   - **Production branch**: la rama donde está este código.
   - **Build command**: vacío. **Deploy command**: `npx wrangler deploy` (el que viene por defecto).
4. **Deploy**. Al terminar, la página del Worker muestra su dirección, del estilo `https://bot-telegram-publicaciones.<tu-cuenta>.workers.dev`.

Desde ahora, cada cambio que se suba a esa rama se despliega solo.

### 2. Cargar los primeros secretos

En el Worker: **Settings** → **Variables and Secrets** → **Add**, siempre con tipo **Secret**:

| Nombre | Valor |
|---|---|
| `BOT_TOKEN` | el token que te dio @BotFather |
| `WEBHOOK_SECRET` | una clave inventada, larga, solo letras, números, `-` y `_` (por ejemplo, 30 caracteres al azar) |
| `GROUP_ID` | el id del grupo (empieza con `-100`) |

### 3. Conectar Telegram con el Worker

Abrir en el navegador, una sola vez:

```
https://<dirección-del-worker>/setup?secret=<tu WEBHOOK_SECRET>
```

Tiene que responder `✅ Webhook configurado para @TuBot`. Desde ahí el bot ya contesta: probá mandarle `/start` por privado.

### 4. Agregar el bot al grupo y obtener los IDs de los temas

1. Agregar el bot al grupo como **administrador** con permisos para enviar mensajes, borrar mensajes y fijar mensajes.
2. Mandarle `/start` al bot por privado (si no, no puede escribirte).
3. En cada tema de publicaciones, escribir `/idtema`. El bot borra el comando y te manda por privado el ID de ese tema.
4. Cargarlos como **Secret** en Cloudflare:

| Nombre | Tema |
|---|---|
| `TOPIC_ALQUILER_SIN_CPR` | Alquiler sin CPR |
| `TOPIC_ALQUILER_CON_CPR` | Alquileres con CPR |
| `TOPIC_LABORAL` | Ofertas laborales |
| `TOPIC_EXCHANGE` | Exchange |
| `TOPIC_COMPRAVENTA` | Compra - Venta - Regalos |
| `TOPIC_EVENTOS` | Eventos, Servicios y Avisos |

### 5. Fijar el botón y cerrar los temas

1. En cada tema de publicaciones, escribir `/fijar`. El bot publica y fija el mensaje con el botón **📢 Publicar**.
2. Cerrar cada tema de publicaciones (en Telegram: abrir el tema → editar → **Cerrar tema**). El chat general queda como está.
3. Probar una publicación completa con una cuenta que no sea admin.

## Comandos

| Dónde | Comando | Qué hace |
|---|---|---|
| Privado | `/publicar` | Elegir tema y armar una publicación |
| Privado | `/cancelar` | Descartar la publicación en curso |
| Grupo (admins) | `/idtema` | Te manda por privado el ID del grupo y del tema |
| Grupo (admins) | `/fijar` | Publica y fija el botón «📢 Publicar» del tema |

## Si algo no funciona

- **El bot no contesta**: revisar que `/setup` haya respondido ✅ y que `BOT_TOKEN` y `WEBHOOK_SECRET` estén cargados. Los errores se ven en el Worker → **Logs**.
- **«El bot todavía no está configurado para este tema»**: falta el `TOPIC_*` de ese tema o `GROUP_ID`.
- **`/fijar` no hace nada**: el bot tiene que ser admin y `GROUP_ID` tiene que estar cargado.

## Desarrollo

Para quien quiera modificar el código en una computadora con Node.js:

```bash
npm install
npm test          # simula conversaciones completas, sin llamar a Telegram
npm run typecheck
```

```
src/
  index.ts       entrada del Worker: webhook, filtro de updates y /setup
  session.ts     Durable Object por usuario: procesa sus mensajes en orden y guarda su estado
  bot.ts         asistente paso a paso, publicación y comandos de admin
  categories.ts  temas y sus campos, definidos como datos
  format.ts      validación de montos y armado del texto de la publicación
  dates.ts       fechas y calendario con botones
test/            tests con una API de Telegram simulada
wrangler.toml    configuración de Cloudflare (sin valores reales)
```
