import { state } from "../state.js";
import { $, setText } from "../utils.js";
import { renderFavorites } from "../favorites/index.js";

export function openPanel(panelName) {
    const panels = {
        settings: $("settingsPanel"),
        favorites: $("favoritesPanel")
    };

    const target = panels[panelName];

    if (!target) {
        return;
    }

    for (const [name, panel] of Object.entries(panels)) {
        const isActive = name === panelName;

        panel.classList.toggle("open", isActive);
        panel.setAttribute("aria-hidden", String(!isActive));
        panel.inert = !isActive;
    }

    $("panelBackdrop").hidden = false;
    state.activePanel = panelName;

    if (panelName === "settings") {
        void import("../settings/index.js").then(({ fillSettingsForm }) => {
            fillSettingsForm();
            setText("settingsMessage", "");
            $("closeSettingsButton").focus();
        });
    } else {
        renderFavorites();
        $("favoriteSearch").focus();
    }
}
