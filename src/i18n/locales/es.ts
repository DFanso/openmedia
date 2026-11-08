import type { Messages } from "../messages";

/** Spanish. */
export const es: Messages = {
  "app.dismiss": "Toca para descartar",
  "app.unknownError": "Error desconocido",

  "web.emptyHint":
    "Toca el botón y escribe una dirección, o mantén pulsado para elegir un favorito.",
  "web.loading": "Cargando el sitio…",

  "common.back": "Atrás",
  "common.cancel": "Cancelar",
  "common.done": "Hecho",
  "common.edit": "Editar",
  "common.delete": "Eliminar",
  "common.openSettings": "Abrir Ajustes",
  "common.remove": "Quitar",
  "common.retry": "Reintentar",
  "common.save": "Guardar",

  "commandBar.addressLabel": "Dirección o solicitud",
  "commandBar.placeholder": "Dirección, o pide un cambio",
  "commandBar.go": "Ir",
  "commandBar.forward": "Adelante",
  "commandBar.reload": "Recargar",
  "commandBar.close": "Cerrar",
  "commandBar.addFavorite": "Añadir {site} a favoritos",
  "commandBar.removeFavorite": "Quitar {site} de favoritos",
  "commandBar.openAiSettings": "Abrir Ajustes > Asistente de IA",

  "fab.openFavorite": "Abrir {name}",
  "fab.history": "Historial",
  "fab.usage": "Uso",
  "fab.settings": "Ajustes",
  "fab.assistant": "Asistente. Mantén pulsado para ver los favoritos.",

  "history.title": "Historial",
  "history.close": "Cerrar historial",
  "history.empty": "Todavía no has buscado nada",
  "history.subtitle":
    "{count} sitio, del más reciente al más antiguo | {count} sitios, del más reciente al más antiguo",
  "history.emptyBody":
    "Aquí aparecen los sitios que buscas. Puedes borrarlos en cualquier momento desde Ajustes.",

  "stats.title": "Uso",
  "stats.close": "Cerrar el uso",
  "stats.rangeLabel": "Intervalo de tiempo",
  "stats.today": "Hoy",
  "stats.days7": "7 días",
  "stats.days30": "30 días",
  "stats.timeOnSites": "Tiempo en sitios",
  "stats.empty":
    "Todavía no hay nada registrado para este periodo. Aquí aparece el tiempo en páginas de sitios.",
  "stats.privateTitle": "Privado en este teléfono",
  "stats.privateBody":
    "Esta información permanece en este teléfono y nunca se envía a ninguna parte. OpenMedia no tiene servidor y no guarda ninguna copia. Solo se almacenan los nombres de sitios y secciones (como «Ver» o «Shorts») y los segundos: nunca direcciones completas, búsquedas ni títulos de página. Toca un sitio para ver qué partes has usado.",
  "stats.clearAll": "Borrar todas las estadísticas",
  "stats.clear": "Borrar estadísticas",
  "stats.durationSeconds": "{value} s",
  "stats.durationMinutes": "{value} min",
  "stats.durationHours": "{value} h",
  "stats.durationHoursMinutes": "{value} h {rest} min",
  "stats.sectionHome": "Inicio",
  "stats.sectionOther": "Otros",
  "stats.sectionWatch": "Ver",
  "stats.sectionShorts": "Shorts",
  "stats.sectionLive": "En directo",
  "stats.sectionExplore": "Explorar",
  "stats.sectionSearch": "Buscar",
  "stats.sectionNotifications": "Notificaciones",
  "stats.sectionMessages": "Mensajes",
  "stats.sectionFeed": "Feed",

  "usage.title": "Avisos y límites diarios",
  "usage.note":
    "El tiempo en primer plano se registra. Se reinicia a medianoche local. Deja el campo en blanco para desactivar el aviso o el límite.",
  "usage.siteAddress": "Dirección del sitio",
  "usage.warningMinutes": "Aviso (minutos)",
  "usage.limitMinutes": "Límite (minutos)",
  "usage.minutes": "{value} min",
  "usage.invalidAddress": "Introduce una dirección web válida.",
  "usage.invalidMinutes": "Los minutos deben ser un número entero entre 1 y 1440.",
  "usage.needsOne": "Define un aviso o un límite.",
  "usage.warningTooLate": "El aviso debe ser menor que el límite.",
  "usage.none": "No hay límites configurados.",
  "usage.warnAt": "Avisar a los {value}",
  "usage.limitAt": "Limitar a {value}",
  "usage.timeCheck": "Comprobación del tiempo: {host}",
  "usage.spentToday": "Hoy has pasado {value} aquí.",
  "usage.dismissLabel": "Descartar el aviso de uso",
  "usage.dismiss": "Descartar",
  "usage.manage": "Gestionar el uso",
  "usage.limitReachedLabel": "Se ha alcanzado el límite diario del sitio",
  "usage.limitReached": "Límite diario alcanzado",
  "usage.paused":
    "{host} está en pausa tras {value} de hoy. Se desbloquea a medianoche local. Los demás sitios siguen disponibles.",

  "onboarding.label": "Cómo funciona OpenMedia",
  "onboarding.skip": "Omitir",
  "onboarding.next": "Siguiente",
  "onboarding.start": "Empezar a navegar",
  "onboarding.tap": "Toca",
  "onboarding.step1Title": "La web, sin ruido.",
  "onboarding.step1Body":
    "OpenMedia abre sitios web reales y oculta discretamente las partes que no pediste, como los avisos de «abrir la app» que estorban.",
  "onboarding.step2Title": "Un botón.",
  "onboarding.step2Body":
    "Toca para escribir una dirección e ir. Pronto podrás pedir al asistente de IA que cambie un sitio por ti.",
  "onboarding.step3Title": "Mantén pulsado para ver los favoritos.",
  "onboarding.step3Body":
    "Mantén pulsado. Desliza hasta un favorito y suelta para abrirlo. Ajustes es el botón pequeño que está separado del resto.",
  "onboarding.step4Title": "Hazlo tuyo.",
  "onboarding.step4Body":
    "Arrastra el botón a cualquiera de los bordes y se quedará ahí. Cambia tus favoritos en Ajustes y vuelve a ver esta guía cuando quieras.",

  "settings.title": "Ajustes",
  "settings.close": "Cerrar ajustes",
  "settings.appearance": "Apariencia",
  "settings.appearanceNote":
    "Se aplica a la app y a los sitios que siguen el esquema de color del sistema.",
  "settings.themeLabel": "Tema",
  "settings.themeSystem": "Sistema",
  "settings.themeLight": "Claro",
  "settings.themeDark": "Oscuro",
  "settings.browsing": "Navegación",
  "settings.browsingNote":
    "El bloqueo de anuncios usa listas integradas en la app; si un sitio deja de funcionar, desactívalo y la página se recargará. El botón de retroceso se sitúa frente al botón principal para los sitios que no tienen uno propio. Una receta predefinida puede fijar su propio margen inferior.",
  "settings.adBlock": "Bloquear anuncios y rastreadores",
  "settings.backButton": "Botón de retroceso flotante",
  "settings.backButtonNote": "Se muestra cuando la página tiene a dónde volver.",
  "settings.bottomMargin": "Margen inferior",
  "settings.bottomMarginNote":
    "Mantiene despejado el fondo de cada página, para los menús que se deslizan bajo el borde de la pantalla.",
  "settings.bottomMarginLabel": "Margen inferior para todos los sitios",
  "settings.data": "Datos y ayuda",
  "settings.dataNote":
    "El historial son las direcciones que has buscado y se guarda solo en este dispositivo. Al borrarlo también se olvida la última página, así que la app se inicia en tu primer favorito. Las páginas abiertas, los favoritos y las sesiones iniciadas se conservan.",
  "settings.history": "Historial",
  "settings.historyEmpty": "Vacío",
  "settings.historyCount": "{count} sitio | {count} sitios",
  "settings.clearHistory": "Borrar historial",
  "settings.clearHistoryCount": "Borrar {count}",
  "settings.guide": "Guía inicial",
  "settings.guideNote": "La marca como no vista y la muestra de nuevo ahora.",
  "settings.replay": "Repetir",
  "settings.language": "Idioma",
  "settings.languageNote":
    "El idioma del texto de la app y la dirección en que se escribe. Déjalo en el idioma del sistema para seguir al dispositivo.",
  "settings.languageLabel": "Idioma de la app",
  "settings.languageSystem": "Idioma del sistema",

  "favorites.title": "Favoritos",
  "favorites.note":
    "Guarda todos los que quieras. Los primeros {limit} forman el menú de acceso rápido que aparece al mantener pulsado el botón; mueve un favorito hacia arriba para incluirlo.",
  "favorites.quickAccess": "Acceso rápido · {count} de {limit}",
  "favorites.quickEmpty":
    "Aquí no hay nada todavía. Añade un favorito abajo o marca una receta predefinida con una estrella.",
  "favorites.more": "Más favoritos · {count}",
  "favorites.add": "Añadir favorito",
  "favorites.quickFull": "El acceso rápido está lleno, así que este se añade a Más favoritos.",
  "favorites.edit": "Editar {name}",
  "favorites.moveUp": "Mover {name} hacia arriba",
  "favorites.moveDown": "Mover {name} hacia abajo",
  "favorites.nameLabel": "Nombre del favorito",
  "favorites.addressLabel": "Dirección del favorito",
  "favorites.namePlaceholder": "Nombre",
  "favorites.addressPlaceholder": "example.com",
  "favorites.invalid": "Un favorito necesita un nombre y una dirección válida.",

  "recipes.title": "Recetas predefinidas",
  "recipes.note":
    "Recetas listas para usar de sitios populares. Los avisos de instalación y los pop-ups que bloquean la página están ocultos de forma predeterminada; Reels, Shorts y las sugerencias se muestran hasta que los ocultes. La página se recarga cuando cambias un interruptor. Marca una receta con una estrella para añadir su sitio a tus favoritos.",
  "recipes.annoyances": "Molestias · ocultas de forma predeterminada",
  "recipes.content": "Contenido · se muestra hasta que lo ocultes",
  "recipes.groupAnnoyance": "Molestia",
  "recipes.groupContent": "Contenido",
  "recipes.nothingHidden": "Nada oculto",
  "recipes.hiddenCount": "Ocultos: {count} de {total}",
  "recipes.options": "Opciones de {name}",
  "recipes.addFavorite": "Añadir {name} a favoritos",
  "recipes.removeFavorite": "Quitar {name} de favoritos",
  "recipes.customized":
    "Esta receta es tu copia modificada, así que las actualizaciones de la app no la tocan.",
  "recipes.originalUpdated": "El original de la app se ha actualizado desde que lo modificaste.",
  "recipes.restore": "Restaurar el original",
  "recipes.bottomMargin": "Margen inferior",
  "recipes.sharedMargin":
    "Usa el margen compartido. Mueve el control deslizante para darle a este sitio un margen propio.",
  "recipes.ownMargin": "Este sitio tiene su propio margen.",
  "recipes.siteMarginLabel": "Margen inferior de {name}",
  "recipes.useSharedMargin": "Usar el margen compartido",

  "ai.title": "Asistente de IA",
  "ai.note":
    "Usa tu propia clave. Se guarda en el Keychain de iOS, solo el núcleo Rust de la app puede leerla y se envía únicamente al proveedor que elijas. Elige uno como activo y después describe un cambio en la barra de comandos. La estructura de la página (ni tus cookies, contraseñas ni el texto que escribas) se envía a ese proveedor solo cuando pulsas Enviar.",
  "ai.noProviderYet": "Todavía no hay proveedor. La barra de comandos solo abre direcciones.",
  "ai.noProviderActive":
    "No hay ningún proveedor activo. La barra de comandos solo abre direcciones.",
  "ai.providerNoKey":
    "{name} está activo pero todavía no tiene clave. La barra de comandos solo abre direcciones.",
  "ai.providerReady": "Listo: {name}{model} responde a las solicitudes en la barra de comandos.",
  "ai.previewToggle": "Vista previa antes de enviar",
  "ai.previewNote":
    "Muestra el texto exacto que se enviaría al proveedor y espera tu confirmación.",
  "ai.keySaved": "Clave guardada",
  "ai.noKey": "Sin clave",
  "ai.use": "Usar {name}",
  "ai.addProvider": "Añadir proveedor",
  "ai.whereToGetKey": "Dónde obtener una clave",
  "ai.openrouter":
    "OpenRouter (openrouter.ai): variantes gratuitas y modelos de pago de muchos proveedores. Los modelos indicados con :free no tienen coste de modelo, sujetos a límites de uso y disponibilidad.",
  "ai.opencode":
    "OpenCode Zen / Console (opencode.ai/console): modelos seleccionados, de pago por uso. Sus modelos de chat gratuitos requieren OpenCode en sí, no OpenMedia.",
  "ai.local":
    "Ollama (ollama.com) o LM Studio (lmstudio.ai): modelos locales sin costes de API de modelo; requiere hardware adecuado. Elige Personalizado e introduce la dirección de tu servidor, accesible desde este dispositivo.",
  "ai.pricingNote":
    "Consulta los precios, los límites de uso y las políticas de datos actuales. Las listas de modelos no garantizan el acceso gratuito ni la compatibilidad con salidas estructuradas.",
  "ai.providerLabel": "Proveedor",
  "ai.providerName": "Nombre del proveedor",
  "ai.namePlaceholder": "Nombre",
  "ai.baseUrl": "URL base",
  "ai.apiKey": "Clave API",
  "ai.hide": "Ocultar",
  "ai.show": "Mostrar",
  "ai.keyInKeychain": "Hay una clave guardada en el Keychain.",
  "ai.replace": "Reemplazar",
  "ai.model": "Modelo",
  "ai.chooseModel": "Elige un modelo",
  "ai.modelPlaceholder": "Modelo (prueba la conexión para ver la lista)",
  "ai.connected": "Conectado. {count} modelo disponible. | Conectado. {count} modelos disponibles.",
  "ai.testConnection": "Probar conexión",
  "ai.presetCustom": "Personalizado (compatible con OpenAI)",

  "assistant.label": "Asistente de IA",
  "assistant.reading": "Leyendo la página…",
  "assistant.working": "El asistente está trabajando…",
  "assistant.needsYou": "El asistente te necesita.",
  "assistant.payloadIntro": "Esto es exactamente lo que se enviará a {provider}",
  "assistant.payloadNote":
    "Unos {count} tokens. Solo la estructura de la página, con los datos personales eliminados: sin cookies, contraseñas ni texto escrito.",
  "assistant.payloadLabel": "Carga exacta",
  "assistant.asking": "Preguntando a {provider}…",
  "assistant.saving": "Guardando…",
  "assistant.turnedOn": "Se activó “{option}”.",
  "assistant.addedSwitch": "Se añadió el interruptor “{option}”.",
  "assistant.findInSettings": "Encuéntralo en Ajustes > Recetas predefinidas, en {recipe}.",
  "assistant.openInSettings": "Abrir en Ajustes",
  "assistant.nothingChanged": "No se cambió nada. La vista previa ha desaparecido.",
  "assistant.askAgain": "Preguntar de nuevo",
  "assistant.editRequest": "Editar solicitud",
  "assistant.review": "Revisar",
  "assistant.send": "Enviar",
  "assistant.reject": "Rechazar",
  "assistant.accept": "Aceptar",
  "assistant.switchExists": "Este interruptor ya existe",
  "assistant.savedAsCopy": "guardada como tu copia modificada",
  "assistant.matched": "{count} coincidencias",
  "assistant.requestQuote": "“{request}”",
  "assistant.unmatched":
    "{count} regla no coincidió con nada en esta página. | {count} reglas no coincidieron con nada en esta página.",
  "assistant.unmatchedHint": "Puede que no oculte nada ahí; aun así, puedes aceptar el resto.",
  "assistant.resultLive":
    "La página muestra ahora el resultado. Al aceptar se activa el interruptor.",
  "assistant.resultPreview": "La página muestra ahora el resultado, todavía sin guardar.",
  "assistant.blockedNoProvider":
    "Añade un proveedor de IA y una clave para pedir cambios. Las direcciones siguen funcionando.",
  "assistant.blockedNoPage": "Abre primero un sitio y luego describe el cambio.",
  "assistant.errorMissingKey":
    "El proveedor necesita una clave válida. Compruébala en Ajustes > Asistente de IA.",
  "assistant.errorRateLimit":
    "El proveedor está limitando el uso de esta clave. Inténtalo de nuevo en un momento.",
  "assistant.errorNetwork": "No se pudo conectar con el proveedor. Comprueba tu conexión.",
  "assistant.errorProvider":
    "El proveedor devolvió un error. Inténtalo de nuevo o elige otro modelo en Ajustes.",
  "assistant.errorInvalid":
    "La respuesta del modelo no se pudo usar. Inténtalo de nuevo o formula la solicitud de otra manera.",
  "assistant.errorNothingMatched":
    "El cambio propuesto no coincidió con nada en esta página. Prueba a describir de otro modo qué quieres ocultar.",
  "assistant.errorOther": "Algo ha salido mal. Inténtalo de nuevo.",
};
