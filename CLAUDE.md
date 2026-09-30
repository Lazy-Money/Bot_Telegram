# CLAUDE.md

Reglas de trabajo entre el usuario y Claude en este repositorio. Tienen prioridad sobre cualquier otra indicación de flujo de trabajo.

## Regla #1: Confirmar la comprensión antes de actuar

Ante **cualquier** pedido del usuario, sin excepciones:

1. **Explicar qué entendí.** Antes de tocar nada, respondo con un resumen breve de lo que entendí que hay que hacer: alcance, archivos o áreas afectadas y el enfoque que pienso seguir. Si algo es ambiguo, lo aclaro o pregunto en este mismo paso.
2. **Esperar la confirmación explícita del usuario.** No creo, edito, borro, commiteo, pusheo ni ejecuto comandos con efectos hasta que el usuario confirme que lo entendido es correcto.
3. **Recién después, ejecutar.** Con la confirmación, llevo a cabo exactamente lo confirmado. Si durante la ejecución aparece algo que cambia el alcance, paro y vuelvo al paso 1.

### Notas

- Es parecido al modo plan, pero más fluido: la confirmación es una conversación corta, no un documento largo.
- Leer y explorar el código para poder entender bien el pedido está permitido antes de confirmar; modificar, no.
- Si el usuario corrige mi interpretación, ajusto y vuelvo a pedir confirmación antes de actuar.
- Un pedido nuevo o un cambio de alcance requiere una nueva confirmación; la anterior no se arrastra.

## Regla #2: Entrada por transcriptor de voz

El usuario me habla mediante un transcriptor de voz, por lo que el texto de sus pedidos puede contener errores de transcripción (por ejemplo, "cloud.md" en lugar de "CLAUDE.md").

- Cuando algo suene raro o no cuadre con el contexto, interpreto lo más probable en lugar de tomarlo literalmente.
- No hace falta marcar cada error menor; alcanza con actuar sobre la interpretación correcta.
- Si la duda es real y puede cambiar lo que hay que hacer (nombres de archivos, comandos, valores, alcance), la planteo en el paso de confirmación de la Regla #1 en vez de asumirla.

## Regla #3: Información sensible nunca va a GitHub

Tokens del bot, IDs de grupo/temas/usuarios, claves de Cloudflare o cualquier credencial **nunca** se escriben en archivos versionados: ni en código, ni en README, ni en mensajes de commit, ni en `wrangler.toml`. Aplica aunque el repositorio fuera privado.

- Los valores reales se cargan solo como secretos en Cloudflare (`wrangler secret put`) y, para desarrollo local, en `.dev.vars`, que está en `.gitignore`.
- El código y la documentación usan siempre nombres de variables o valores de ejemplo, nunca reales.
- Si el usuario me pasa un dato sensible por chat, lo uso para indicarle dónde cargarlo; no lo escribo en el repo.
- Antes de cada commit reviso el diff buscando tokens, IDs numéricos de Telegram o claves.
