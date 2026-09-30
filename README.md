# Bot de publicaciones para Telegram

Bot que obliga a que las publicaciones del grupo (trabajo, compra/venta, alquileres, divisas) se hagan con un formulario guiado: fotos, zona, precio, etc. son obligatorios y no se puede publicar hasta completarlos.

Corre en **Cloudflare Workers** (plan gratuito): no necesita servidor propio ni un proceso corriendo 24/7. Telegram avisa por webhook cuando llega un mensaje y el código corre solo en ese momento.

## Cómo funciona

1. Los temas de publicaciones del grupo están **cerrados**: solo admins y el bot escriben ahí. El chat general sigue abierto.
2. En cada tema hay un mensaje fijado con un botón **📢 Publicar** que abre el chat privado con el bot.
3. El bot pide campo por campo, valida cada uno, muestra una vista previa y recién ahí deja publicar.
4. El bot publica en el tema correspondiente con formato uniforme, con el nombre del autor clickeable y un botón **💬 Contactar**.

## Puesta en marcha

> ⚠️ Ningún token ni ID se guarda en el repositorio. Ver `CLAUDE.md`, Regla #3.

### 1. Crear el bot en Telegram

1. Hablar con [@BotFather](https://t.me/BotFather) → `/newbot` → elegir nombre y usuario.
2. Guardar el **token** que devuelve (`BOT_TOKEN`).
3. En BotFather: `/setprivacy` → elegir el bot → **Disable**. Sin esto el bot no ve los mensajes del grupo.
4. Agregar el bot al grupo como **administrador** con permiso para enviar mensajes, fijar mensajes y gestionar temas.

### 2. Obtener los IDs del grupo y de los temas

- **GROUP_ID**: agregar [@getidsbot](https://t.me/getidsbot) al grupo (o reenviarle un mensaje del grupo). Es un número negativo que empieza con `-100`.
- **ID de cada tema**: abrir el tema en Telegram Desktop o web y copiar el enlace de cualquier mensaje. Tiene la forma `https://t.me/c/<grupo>/<tema>/<mensaje>`; el número del medio es el ID del tema.

### 3. Cloudflare

1. Crear cuenta en [cloudflare.com](https://dash.cloudflare.com/sign-up) (gratis).
2. Instalar dependencias y loguearse:

   ```bash
   npm install
   npx wrangler login
   ```

3. Crear el almacén de estado y pegar el `id` que devuelve en `wrangler.toml`:

   ```bash
   npx wrangler kv namespace create SESSIONS
   ```

4. Cargar los secretos (pide cada valor por consola, no queda en ningún archivo):

   ```bash
   npx wrangler secret put BOT_TOKEN
   npx wrangler secret put WEBHOOK_SECRET      # cualquier cadena aleatoria larga
   npx wrangler secret put GROUP_ID
   npx wrangler secret put TOPIC_TRABAJO
   npx wrangler secret put TOPIC_COMPRAVENTA
   npx wrangler secret put TOPIC_ALQUILERES
   npx wrangler secret put TOPIC_DIVISAS
   ```

5. Desplegar:

   ```bash
   npm run deploy
   ```

   Devuelve la URL del Worker, algo como `https://bot-telegram-publicaciones.<cuenta>.workers.dev`.

### 4. Registrar el webhook en Telegram

Una sola vez, reemplazando `<TOKEN>`, `<URL>` y `<SECRET>`:

```
https://api.telegram.org/bot<TOKEN>/setWebhook?url=<URL>/webhook&secret_token=<SECRET>
```

Abrir esa dirección en el navegador. Debe responder `{"ok":true,...}`.

## Desarrollo local

```bash
cp .dev.vars.example .dev.vars   # completar con valores reales; el archivo está ignorado por git
npm run typecheck
npm run dev
```

## Estructura

```
src/
  index.ts       entrada del Worker: recibe el webhook y valida el secreto
  bot.ts         comandos del bot (/start, /publicar) y menú de categorías
  categories.ts  categorías y sus campos, definidos como datos
  env.ts         variables de entorno que espera el Worker
wrangler.toml    configuración de Cloudflare (sin valores reales)
```
