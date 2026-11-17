/* ---------- ACCESSIBLE APPLICATION LAUNCHER ---------- */
const launcher = document.getElementById("Launcher");
const launcherBtn = document.getElementById("open-launcher");
const launcherSearch = document.getElementById("launcher-search");
const launcherGrid = document.getElementById("launcher-grid");

function openLauncher() {
    if (!launcher) return;
    launcher.classList.remove("hidden");
    launcher.classList.add("active");
    launcherBtn?.setAttribute("aria-expanded", "true");
    if (launcherSearch) {
        launcherSearch.value = "";
        launcherGrid?.querySelectorAll(".AppIcon").forEach((icon) => { icon.hidden = false; });
        window.requestAnimationFrame(() => launcherSearch.focus());
    }
}

function closeLauncher(returnFocus = false) {
    if (!launcher) return;
    launcher.classList.add("hidden");
    launcher.classList.remove("active");
    launcherBtn?.setAttribute("aria-expanded", "false");
    if (returnFocus) launcherBtn?.focus();
}

function toggleLauncher() {
    if (!launcher) return;
    if (launcher.classList.contains("active")) closeLauncher();
    else openLauncher();
}

launcherBtn?.addEventListener("click", toggleLauncher);

launcher?.addEventListener("click", (event) => {
    if (event.target === launcher) closeLauncher(true);
});

// Launch an app and dismiss the overlay after the registry handles its button.
launcherGrid?.addEventListener("click", (event) => {
    if (event.target.closest(".AppIcon")) closeLauncher();
});

launcherSearch?.addEventListener("input", () => {
    const query = launcherSearch.value.trim().toLocaleLowerCase();
    launcherGrid?.querySelectorAll(".AppIcon").forEach((icon) => {
        const searchable = (icon.dataset.search || icon.textContent || "").toLocaleLowerCase();
        icon.hidden = query !== "" && !searchable.includes(query);
    });
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && launcher?.classList.contains("active")) {
        event.preventDefault();
        closeLauncher(true);
    }

    if ((event.ctrlKey || event.metaKey) && event.code === "Space") {
        event.preventDefault();
        toggleLauncher();
    }
});

window.openLauncher = openLauncher;
window.closeLauncher = closeLauncher;
