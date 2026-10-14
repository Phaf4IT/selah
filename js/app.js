/*
 * Selah — persoonlijke christelijke Chrome-newtab-extensie.
 *
 * De offline teksten en overdenkingen staan in offline-verses.json.
 * HelloAO wordt zonder API-sleutel gebruikt.
 */

import { DEFAULT_SETTINGS, STORAGE_KEYS } from "./config.js";
import { state } from "./state.js";
import { $, setStatus, setText } from "./utils.js";
import { getDailySession, hasChromeStorage, storageGet } from "./storage.js";
import {
    makeFallbackBackgroundEntry,
    applyBackground,
    loadBackground
} from "./background/index.js";
import {
    chooseOfflineVerse,
    getThemeLabel,
    loadOfflineVerses,
    renderVerse,
    showNextVerse,
    showVerse,
    updateFavoriteButton
} from "./verses/index.js";
import {
    closeNoteDialog,
    loadFavorites,
    renderFavorites,
    sanitizeFavorite,
    saveNote,
    toggleFavorite
} from "./favorites/index.js";
import {
    fillSettingsForm,
    loadTranslations,
    sanitizeSettings,
    saveSettings
} from "./settings/index.js";
import { openPanel } from "./ui/panels.js";
import { closePanel } from "./ui/dialog.js";
import { updateClock } from "./ui/clock.js";

function setupEventListeners() {
    $("brandLink").addEventListener("click", (event) => {
        event.preventDefault();
        closePanel();
        closeNoteDialog();
    });

    $("settingsButton").addEventListener("click", () => {
        openPanel("settings");
    });

    $("favoritesButton").addEventListener("click", () => {
        openPanel("favorites");
    });

    $("closeSettingsButton").addEventListener("click", closePanel);
    $("cancelSettingsButton").addEventListener("click", closePanel);
    $("closeFavoritesButton").addEventListener("click", closePanel);

    $("panelBackdrop").addEventListener("click", closePanel);

    $("settingsForm").addEventListener("submit", saveSettings);

    $("loadTranslationsButton").addEventListener("click", () => {
        loadTranslations({ force: true });
    });

    $("themeSelect").addEventListener("change", () => {
        setText("currentTheme", getThemeLabel($("themeSelect").value));
    });

    $("favoriteVerseButton").addEventListener("click", toggleFavorite);

    $("nextVerseButton").addEventListener("click", showNextVerse);

    $("favoriteSearch").addEventListener("input", renderFavorites);

    $("noteForm").addEventListener("submit", saveNote);

    $("closeNoteButton").addEventListener("click", closeNoteDialog);
    $("cancelNoteButton").addEventListener("click", closeNoteDialog);

    $("noteDialog").addEventListener("click", (event) => {
        if (event.target === $("noteDialog")) {
            closeNoteDialog();
        }
    });

    $("refreshBackgroundButton").addEventListener("click", () => {
        loadBackground({ force: true });
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closePanel();
        }
    });
}

async function loadInitialState() {
    const rawSettings = await storageGet(
        STORAGE_KEYS.settings,
        DEFAULT_SETTINGS
    );

    state.settings = sanitizeSettings(rawSettings);

    const dailySession = await getDailySession();
    state.manualVerseOffset = dailySession.verseOffset;
    state.backgroundManualOffset = dailySession.backgroundManualOffset;

    await loadFavorites();

    fillSettingsForm();
    updateClock();
    setText("currentTheme", getThemeLabel());

    void loadTranslations({ force: false }).catch((error) => {
        console.warn("Selah: vertalingenlijst kon niet worden voorbereid.", error);
    });

    await loadBackground({ force: false });

    try {
        await showVerse(state.manualVerseOffset);
    } catch (error) {
        console.error("Selah: initialiseren van de Bijbeltekst mislukt.", error);

        const fallback = chooseOfflineVerse(state.manualVerseOffset);

        renderVerse(
            {
                ...fallback,
                id: `offline-${fallback.reference}`,
                bibleId: "",
                bibleName: "",
                translation: "Offline voorbeeldtekst",
                copyright: "",
                source: "offline"
            },
            "offline",
            "De Bijbeltekst kon niet worden geladen. Je ziet nu een offline voorbeeldtekst."
        );
    }
}

async function init() {
    setupEventListeners();

    try {
        await loadOfflineVerses();
        await loadInitialState();
    } catch (error) {
        console.error("Selah: initialiseren mislukt.", error);

        state.settings = { ...DEFAULT_SETTINGS };
        updateClock();

        const fallback = chooseOfflineVerse(0);

        renderVerse(
            {
                ...fallback,
                id: `offline-${fallback.reference}`,
                bibleId: "",
                bibleName: "",
                translation: "Offline voorbeeldtekst",
                copyright: "",
                source: "offline"
            },
            "offline",
            "Sommige gegevens konden niet worden geladen. De offline modus is actief."
        );

        applyBackground(makeFallbackBackgroundEntry());
    }

    setInterval(updateClock, 15000);

    if (hasChromeStorage() && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== "local") {
                return;
            }

            if (changes[STORAGE_KEYS.settings]) {
                state.settings = sanitizeSettings(
                    changes[STORAGE_KEYS.settings].newValue
                );

                updateClock();
                setText("currentTheme", getThemeLabel());
            }

            if (changes[STORAGE_KEYS.favorites]) {
                const newValue = changes[STORAGE_KEYS.favorites].newValue;

                state.favorites = Array.isArray(newValue)
                    ? newValue.map(sanitizeFavorite).filter(Boolean)
                    : [];

                updateFavoriteButton();
                renderFavorites();
            }
        });
    }
}

document.addEventListener("DOMContentLoaded", () => {
    init().catch((error) => {
        console.error("Selah: onverwachte initialisatiefout.", error);
        setStatus("Er ging iets mis bij het starten. Herlaad dit tabblad.");
    });
});
