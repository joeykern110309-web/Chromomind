import { createContext, useContext, useState, useEffect } from "react";

export type Lang = "en" | "de" | "fr" | "es" | "it";

export const LANGUAGES: { code: Lang; label: string; nativeLabel: string }[] = [
  { code: "en", label: "English",    nativeLabel: "English"   },
  { code: "de", label: "German",     nativeLabel: "Deutsch"   },
  { code: "fr", label: "French",     nativeLabel: "Français"  },
  { code: "es", label: "Spanish",    nativeLabel: "Español"   },
  { code: "it", label: "Italian",    nativeLabel: "Italiano"  },
];

const T = {
  en: {
    appName:             "Chromomind",
    newChat:             "New Chat",
    search:              "Search...",
    noChats:             "No chats yet",
    noMatches:           "No matches",
    noMessages:          "No messages yet",
    justNow:             "Just now",
    yesterday:           "Yesterday",
    howCanIHelp:         "How can I help?",
    askMeAnything:       "Ask me anything — or pick a suggestion below",
    messagePlaceholder:  "Message...",
    enterToSend:         "Enter to send \u00b7 Shift+Enter for new line",
    settings:            "Settings",
    account:             "Account",
    language:            "Language",
    appearance:          "Appearance",
    dark:                "Dark",
    light:               "Light",
    promptExplainTitle:  "Explain a concept",
    promptExplainDesc:   "Can you explain how async/await works in JavaScript?",
    promptChatTitle:     "General chat",
    promptChatDesc:      "Tell me something fascinating about the universe",
    promptMusicTitle:    "Play music",
    promptMusicDesc:     "Play Blinding Lights by The Weeknd",
    promptAdviceTitle:   "Get advice",
    promptAdviceDesc:    "What are some tips for staying productive?",
    infoDescription:     "An advanced AI chat assistant with Spotify integration, conversation memory, and multilingual support.",
    infoMadeBy:          "Made by",
    infoAiModels:        "AI Models",
    infoMusic:           "Music",
    infoLanguages:       "Languages",
    infoBuiltWith:       "Built with React, Express & Groq SDK",
    settingsTitle:       "Settings",
    connected:           "Connected",
    nothingPlaying:      "Nothing playing",
    connectSpotify:      "Connect Spotify",
  },
  de: {
    appName:             "Chromomind",
    newChat:             "Neuer Chat",
    search:              "Suchen\u2026",
    noChats:             "Noch keine Chats",
    noMatches:           "Keine Treffer",
    noMessages:          "Noch keine Nachrichten",
    justNow:             "Gerade eben",
    yesterday:           "Gestern",
    howCanIHelp:         "Wie kann ich helfen?",
    askMeAnything:       "Frag mich alles \u2014 oder w\u00e4hl einen Vorschlag",
    messagePlaceholder:  "Nachricht\u2026",
    enterToSend:         "Enter zum Senden \u00b7 Shift+Enter f\u00fcr neue Zeile",
    settings:            "Einstellungen",
    account:             "Konto",
    language:            "Sprache",
    appearance:          "Erscheinungsbild",
    dark:                "Dunkel",
    light:               "Hell",
    promptExplainTitle:  "Konzept erkl\u00e4ren",
    promptExplainDesc:   "Kannst du erkl\u00e4ren, wie async/await in JavaScript funktioniert?",
    promptChatTitle:     "Allgemeines Gespr\u00e4ch",
    promptChatDesc:      "Erz\u00e4hl mir etwas Faszinierendes \u00fcber das Universum",
    promptMusicTitle:    "Musik abspielen",
    promptMusicDesc:     "Spiel Blinding Lights von The Weeknd",
    promptAdviceTitle:   "Rat holen",
    promptAdviceDesc:    "Was sind gute Tipps f\u00fcr mehr Produktivit\u00e4t?",
    infoDescription:     "Ein fortschrittlicher KI-Chat-Assistent mit Spotify-Integration, Gespr\u00e4chsged\u00e4chtnis und Mehrsprachigkeit.",
    infoMadeBy:          "Erstellt von",
    infoAiModels:        "KI-Modelle",
    infoMusic:           "Musik",
    infoLanguages:       "Sprachen",
    infoBuiltWith:       "Gebaut mit React, Express & Groq SDK",
    settingsTitle:       "Einstellungen",
    connected:           "Verbunden",
    nothingPlaying:      "Nichts spielt",
    connectSpotify:      "Spotify verbinden",
  },
  fr: {
    appName:             "Chromomind",
    newChat:             "Nouveau chat",
    search:              "Rechercher\u2026",
    noChats:             "Aucun chat pour l\u2019instant",
    noMatches:           "Aucun r\u00e9sultat",
    noMessages:          "Aucun message pour l\u2019instant",
    justNow:             "\u00c0 l\u2019instant",
    yesterday:           "Hier",
    howCanIHelp:         "Comment puis-je aider\u00a0?",
    askMeAnything:       "Demandez-moi n\u2019importe quoi \u2014 ou choisissez une suggestion",
    messagePlaceholder:  "Message\u2026",
    enterToSend:         "Entr\u00e9e pour envoyer \u00b7 Maj+Entr\u00e9e pour nouvelle ligne",
    settings:            "Param\u00e8tres",
    account:             "Compte",
    language:            "Langue",
    appearance:          "Apparence",
    dark:                "Sombre",
    light:               "Clair",
    promptExplainTitle:  "Expliquer un concept",
    promptExplainDesc:   "Peux-tu expliquer comment fonctionne async/await en JavaScript\u00a0?",
    promptChatTitle:     "Conversation g\u00e9n\u00e9rale",
    promptChatDesc:      "Dis-moi quelque chose de fascinant sur l\u2019univers",
    promptMusicTitle:    "Jouer de la musique",
    promptMusicDesc:     "Joue Blinding Lights de The Weeknd",
    promptAdviceTitle:   "Obtenir des conseils",
    promptAdviceDesc:    "Quels sont les conseils pour rester productif\u00a0?",
    infoDescription:     "Un assistant IA avanc\u00e9 avec int\u00e9gration Spotify, m\u00e9moire de conversation et support multilingue.",
    infoMadeBy:          "Cr\u00e9\u00e9 par",
    infoAiModels:        "Mod\u00e8les IA",
    infoMusic:           "Musique",
    infoLanguages:       "Langues",
    infoBuiltWith:       "Construit avec React, Express & Groq SDK",
    settingsTitle:       "Param\u00e8tres",
    connected:           "Connect\u00e9",
    nothingPlaying:      "Rien en lecture",
    connectSpotify:      "Connecter Spotify",
  },
  es: {
    appName:             "Chromomind",
    newChat:             "Nuevo chat",
    search:              "Buscar\u2026",
    noChats:             "A\u00fan no hay chats",
    noMatches:           "Sin resultados",
    noMessages:          "A\u00fan no hay mensajes",
    justNow:             "Ahora mismo",
    yesterday:           "Ayer",
    howCanIHelp:         "\u00bfC\u00f3mo puedo ayudar?",
    askMeAnything:       "Preg\u00fantame lo que quieras \u2014 o elige una sugerencia",
    messagePlaceholder:  "Mensaje\u2026",
    enterToSend:         "Enter para enviar \u00b7 Shift+Enter para nueva l\u00ednea",
    settings:            "Configuraci\u00f3n",
    account:             "Cuenta",
    language:            "Idioma",
    appearance:          "Apariencia",
    dark:                "Oscuro",
    light:               "Claro",
    promptExplainTitle:  "Explicar un concepto",
    promptExplainDesc:   "\u00bfPuedes explicar c\u00f3mo funciona async/await en JavaScript?",
    promptChatTitle:     "Chat general",
    promptChatDesc:      "Cu\u00e9ntame algo fascinante sobre el universo",
    promptMusicTitle:    "Reproducir m\u00fasica",
    promptMusicDesc:     "Reproduce Blinding Lights de The Weeknd",
    promptAdviceTitle:   "Obtener consejos",
    promptAdviceDesc:    "\u00bfCu\u00e1les son algunos consejos para ser m\u00e1s productivo?",
    infoDescription:     "Un asistente de IA avanzado con integraci\u00f3n de Spotify, memoria de conversaci\u00f3n y soporte multiling\u00fce.",
    infoMadeBy:          "Creado por",
    infoAiModels:        "Modelos de IA",
    infoMusic:           "M\u00fasica",
    infoLanguages:       "Idiomas",
    infoBuiltWith:       "Construido con React, Express y Groq SDK",
    settingsTitle:       "Configuraci\u00f3n",
    connected:           "Conectado",
    nothingPlaying:      "Nada en reproducci\u00f3n",
    connectSpotify:      "Conectar Spotify",
  },
  it: {
    appName:             "Chromomind",
    newChat:             "Nuova chat",
    search:              "Cerca\u2026",
    noChats:             "Nessuna chat ancora",
    noMatches:           "Nessun risultato",
    noMessages:          "Nessun messaggio ancora",
    justNow:             "Proprio ora",
    yesterday:           "Ieri",
    howCanIHelp:         "Come posso aiutarti?",
    askMeAnything:       "Chiedimi qualsiasi cosa \u2014 o scegli un suggerimento",
    messagePlaceholder:  "Messaggio\u2026",
    enterToSend:         "Invio per inviare \u00b7 Shift+Invio per nuova riga",
    settings:            "Impostazioni",
    account:             "Account",
    language:            "Lingua",
    appearance:          "Aspetto",
    dark:                "Scuro",
    light:               "Chiaro",
    promptExplainTitle:  "Spiegare un concetto",
    promptExplainDesc:   "Puoi spiegare come funziona async/await in JavaScript?",
    promptChatTitle:     "Chat generale",
    promptChatDesc:      "Dimmi qualcosa di affascinante sull\u2019universo",
    promptMusicTitle:    "Riprodurre musica",
    promptMusicDesc:     "Riproduci Blinding Lights di The Weeknd",
    promptAdviceTitle:   "Ottenere consigli",
    promptAdviceDesc:    "Quali sono alcuni consigli per essere pi\u00f9 produttivi?",
    infoDescription:     "Un assistente IA avanzato con integrazione Spotify, memoria delle conversazioni e supporto multilingue.",
    infoMadeBy:          "Creato da",
    infoAiModels:        "Modelli IA",
    infoMusic:           "Musica",
    infoLanguages:       "Lingue",
    infoBuiltWith:       "Costruito con React, Express e Groq SDK",
    settingsTitle:       "Impostazioni",
    connected:           "Connesso",
    nothingPlaying:      "Niente in riproduzione",
    connectSpotify:      "Connetti Spotify",
  },
} satisfies Record<Lang, Record<string, string>>;

export type TKey = keyof typeof T.en;

interface LanguageCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TKey) => string;
}

const LanguageContext = createContext<LanguageCtx>({
  lang: "en",
  setLang: () => {},
  t: (key) => T.en[key],
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem("chromomind-lang") as Lang | null;
    return saved && saved in T ? saved : "en";
  });

  const setLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem("chromomind-lang", l);
  };

  const t = (key: TKey): string => T[lang][key] ?? T.en[key];

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
