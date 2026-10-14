import { hashString, safeString } from "../utils.js";

export function createFavoriteId(verse) {
    const identity = [
        safeString(verse.bibleId, 100),
        safeString(verse.reference, 300).toLowerCase(),
        safeString(verse.text, 10000).toLowerCase()
    ].join("|");

    return `fav-${hashString(identity).toString(16)}-${identity.length}`;
}
