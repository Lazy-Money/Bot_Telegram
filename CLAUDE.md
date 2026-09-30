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
