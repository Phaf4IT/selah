import { state } from "../state.js";
import { $ } from "../utils.js";

export function closePanel() {
    $("settingsPanel").classList.remove("open");
    $("settingsPanel").setAttribute("aria-hidden", "true");
    $("settingsPanel").inert = true;

    $("favoritesPanel").classList.remove("open");
    $("favoritesPanel").setAttribute("aria-hidden", "true");
    $("favoritesPanel").inert = true;

    $("panelBackdrop").hidden = true;
    state.activePanel = null;
}
