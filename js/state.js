import { DEFAULT_SETTINGS } from "./config.js";

export const state = {
    settings: { ...DEFAULT_SETTINGS },
    favorites: [],
    currentVerse: null,
    currentVerseKey: "",
    currentVerseIsFavorite: false,
    currentSource: "offline",
    currentOfflineIndex: 0,
    currentFavoriteId: null,
    manualVerseOffset: 0,
    translations: [],
    activePanel: null,
    noteFavoriteId: null,
    toastTimer: null,
    lastTranslationRequestAt: 0,
    lastOpenverseRequestAt: 0,
    openverseImages: [],
    currentBackgroundIndex: -1,
    backgroundDailyIndex: 0,
    backgroundManualOffset: 0
};
