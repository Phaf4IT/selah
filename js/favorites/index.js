import { STORAGE_KEYS, THEMES } from "../config.js";
import { storageGet, storageSet } from "../storage.js";
import { state } from "../state.js";
import {
    $,
    isObject,
    safeString,
    setText,
    showToast
} from "../utils.js";
import { createFavoriteId } from "./ids.js";
import { closePanel } from "../ui/dialog.js";
import {
    getCurrentCopyright,
    getCurrentTranslationLabel,
    renderVerse,
    updateFavoriteButton
} from "../verses/index.js";

export function sanitizeFavorite(raw) {
    if (!isObject(raw)) {
        return null;
    }

    const text = safeString(raw.text, 10000).trim();
    const reference = safeString(raw.reference, 300).trim();

    if (!text || !reference) {
        return null;
    }

    const id = safeString(raw.id, 200) || createFavoriteId({
        text,
        reference,
        bibleId: safeString(raw.bibleId, 100)
    });

    return {
        id,
        text,
        reference,
        reflection: safeString(raw.reflection, 2000),
        themes: Array.isArray(raw.themes)
            ? raw.themes.filter((theme) => Object.hasOwn(THEMES, theme))
            : [],
        bibleId: safeString(raw.bibleId, 100),
        bibleName: safeString(raw.bibleName, 200),
        translation: safeString(raw.translation, 100),
        copyright: safeString(raw.copyright, 3000),
        source: raw.source === "api" ? "api" : "offline",
        note: safeString(raw.note, 3000),
        createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now()
    };
}

export async function loadFavorites() {
    const raw = await storageGet(STORAGE_KEYS.favorites, []);

    state.favorites = Array.isArray(raw)
        ? raw.map(sanitizeFavorite).filter(Boolean)
        : [];

    /*
     * Repareer oude of dubbele records zonder de notities te verliezen.
     */
    const seen = new Set();

    state.favorites = state.favorites.filter((favorite) => {
        const key = [
            favorite.bibleId,
            favorite.reference.toLowerCase(),
            favorite.text.toLowerCase()
        ].join("|");

        if (seen.has(key)) {
            return false;
        }

        seen.add(key);
        return true;
    });
}

export async function persistFavorites() {
    await storageSet(STORAGE_KEYS.favorites, state.favorites);
}

export async function toggleFavorite() {
    if (!state.currentVerse) {
        return;
    }

    const verse = state.currentVerse;
    const identity = createFavoriteId({
        text: verse.text,
        reference: verse.reference,
        bibleId: verse.bibleId || ""
    });

    const existingIndex = state.favorites.findIndex((favorite) =>
        favorite.id === identity ||
        (
            favorite.text === verse.text &&
            favorite.reference === verse.reference &&
            favorite.bibleId === (verse.bibleId || "")
        )
    );

    if (existingIndex >= 0) {
        state.favorites.splice(existingIndex, 1);

        try {
            await persistFavorites();
            updateFavoriteButton();
            renderFavorites();
            showToast("Tekst verwijderd uit je favorieten.");
        } catch (error) {
            console.error("Selah: favoriet verwijderen mislukt.", error);
            await loadFavorites();
            updateFavoriteButton();
            showToast("Verwijderen is niet gelukt. Probeer het opnieuw.");
        }

        return;
    }

    const favorite = sanitizeFavorite({
        id: identity,
        text: verse.text,
        reference: verse.reference,
        reflection: verse.reflection || "",
        themes: verse.themes || [],
        bibleId: verse.bibleId || "",
        bibleName: verse.bibleName || "",
        translation: getCurrentTranslationLabel(),
        copyright: getCurrentCopyright(),
        source: state.currentSource,
        note: "",
        createdAt: Date.now()
    });

    if (!favorite) {
        showToast("Deze tekst kan niet als favoriet worden opgeslagen.");
        return;
    }

    state.favorites.unshift(favorite);

    try {
        await persistFavorites();
        updateFavoriteButton();
        renderFavorites();
        showToast("Tekst bewaard bij je favorieten.");
    } catch (error) {
        console.error("Selah: favoriet opslaan mislukt.", error);
        await loadFavorites();
        updateFavoriteButton();
        showToast("Opslaan is niet gelukt. Controleer de opslagruimte.");
    }
}

export function renderFavorites() {
    const container = $("favoritesList");
    const query = $("favoriteSearch").value.trim().toLocaleLowerCase("nl");

    const filtered = state.favorites.filter((favorite) => {
        const searchable = [
            favorite.text,
            favorite.reference,
            favorite.note,
            favorite.bibleName,
            favorite.translation
        ].join(" ").toLocaleLowerCase("nl");

        return searchable.includes(query);
    });

    setText(
        "favoritesCount",
        `${filtered.length} ${filtered.length === 1 ? "favoriet" : "favorieten"}`
    );

    container.replaceChildren();

    if (!filtered.length) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.textContent = query
            ? "Geen teksten gevonden. Probeer een andere zoekterm."
            : "Je hebt nog geen favoriete teksten. Bewaar een tekst om deze hier terug te vinden.";
        container.appendChild(empty);
        return;
    }

    for (const favorite of filtered) {
        const card = document.createElement("article");
        card.className = "favorite-card";

        const text = document.createElement("p");
        text.className = "favorite-card-text";
        text.textContent = favorite.text;

        const reference = document.createElement("p");
        reference.className = "favorite-card-reference";
        reference.textContent = favorite.reference;

        const meta = document.createElement("p");
        meta.className = "favorite-card-meta";
        meta.textContent = [
            favorite.translation || favorite.bibleName,
            favorite.source === "offline"
                ? "Offline voorbeeldtekst — vertaling niet geverifieerd"
                : ""
        ].filter(Boolean).join(" · ");

        card.append(text, reference);

        if (meta.textContent) {
            card.appendChild(meta);
        }

        if (favorite.note) {
            const note = document.createElement("p");
            note.className = "favorite-card-note";
            note.textContent = `Notitie: ${favorite.note}`;
            card.appendChild(note);
        }

        const actions = document.createElement("div");
        actions.className = "favorite-card-actions";

        const openButton = document.createElement("button");
        openButton.type = "button";
        openButton.textContent = "Open tekst";
        openButton.addEventListener("click", () => openFavorite(favorite.id));

        const noteButton = document.createElement("button");
        noteButton.type = "button";
        noteButton.textContent = favorite.note ? "Notitie bewerken" : "Notitie toevoegen";
        noteButton.addEventListener("click", () => openNoteDialog(favorite.id));

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.textContent = "Verwijderen";
        removeButton.addEventListener("click", () => removeFavorite(favorite.id));

        actions.append(openButton, noteButton, removeButton);
        card.appendChild(actions);
        container.appendChild(card);
    }
}

export function openFavorite(favoriteId) {
    const favorite = state.favorites.find((item) => item.id === favoriteId);

    if (!favorite) {
        showToast("Deze favoriet is niet meer beschikbaar.");
        return;
    }

    const source = favorite.source === "api" ? "api" : "offline";

    renderVerse(
        {
            id: favorite.id,
            text: favorite.text,
            reference: favorite.reference,
            reflection: favorite.reflection,
            themes: favorite.themes,
            bibleId: favorite.bibleId,
            bibleName: favorite.bibleName,
            translation: favorite.translation,
            copyright: favorite.copyright,
            source
        },
        source,
        favorite.note ? `Je notitie: ${favorite.note}` : ""
    );

    closePanel();
}

export async function removeFavorite(favoriteId) {
    const index = state.favorites.findIndex((favorite) =>
        favorite.id === favoriteId
    );

    if (index < 0) {
        return;
    }

    const removed = state.favorites.splice(index, 1)[0];

    try {
        await persistFavorites();
        updateFavoriteButton();
        renderFavorites();
        showToast("Favoriet verwijderd.");
    } catch (error) {
        console.error("Selah: favoriet verwijderen mislukt.", error);
        state.favorites.splice(index, 0, removed);
        renderFavorites();
        showToast("Verwijderen is niet gelukt. Probeer opnieuw.");
    }
}

export function openNoteDialog(favoriteId) {
    const favorite = state.favorites.find((item) => item.id === favoriteId);

    if (!favorite) {
        showToast("Deze favoriet is niet meer beschikbaar.");
        return;
    }

    state.noteFavoriteId = favoriteId;

    setText("noteVerseReference", favorite.reference);
    setText("noteVerseText", favorite.text);
    $("noteInput").value = favorite.note;
    setText("noteMessage", "");

    const dialog = $("noteDialog");

    if (!dialog.open) {
        dialog.showModal();
    }

    $("noteInput").focus();
}

export function closeNoteDialog() {
    const dialog = $("noteDialog");

    if (dialog.open) {
        dialog.close();
    }

    state.noteFavoriteId = null;
}

export async function saveNote(event) {
    event.preventDefault();

    const favorite = state.favorites.find(
        (item) => item.id === state.noteFavoriteId
    );

    if (!favorite) {
        setText("noteMessage", "De bijbehorende favoriet is niet gevonden.");
        return;
    }

    const previousNote = favorite.note;
    favorite.note = safeString($("noteInput").value, 3000).trim();

    try {
        await persistFavorites();
        renderFavorites();
        closeNoteDialog();
        showToast("Je notitie is bewaard.");
    } catch (error) {
        favorite.note = previousNote;
        console.error("Selah: notitie opslaan mislukt.", error);
        setText(
            "noteMessage",
            "Notitie opslaan is niet gelukt. Probeer het opnieuw."
        );
    }
}
