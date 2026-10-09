/* ---------- LAUNCHER LOGIC ---------- */

const launcher = document.getElementById("Launcher");
const launcherBtn = document.getElementById("open-launcher");
const launcherSearch = document.getElementById("launcher-search");

// Open or close launcher cleanly
launcherBtn.onclick = () => {
    // FIX: Remove 'hidden' so it physically displays, and add 'active' for animations
    const isOpen = launcher.classList.toggle("hidden");
    launcher.classList.toggle("active", !isOpen);
    
    if (!isOpen) {
        launcherBtn.setAttribute("aria-expanded", "true");
        if (launcherSearch) {
            launcherSearch.value = ""; // Clear old searches on open
            launcherSearch.focus();
        }
        // Reset app visibility filter
        document.querySelectorAll(".AppIcon").forEach(icon => icon.hidden = false);
    } else {
        launcherBtn.setAttribute("aria-expanded", "false");
    }
};

// Close launcher if clicking outside the inner grid panel context
launcher.onclick = (e) => {
    if (e.target === launcher) {
        launcher.classList.add("hidden");
        launcher.classList.remove("active");
        launcherBtn.setAttribute("aria-expanded", "false");
    }
};

// Application indexing lookups
if (launcherSearch) {
    launcherSearch.addEventListener("input", (event) => {
        const query = event.target.value.trim().toLowerCase();
        document.querySelectorAll(".AppIcon").forEach((icon) => {
            const appName = icon.dataset.app ? icon.dataset.app.toLowerCase() : "";
            const textName = icon.textContent.toLowerCase();
            
            // Hide element if it doesn't match search criteria queries
            icon.hidden = query !== "" && !appName.includes(query) && !textName.includes(query);
        });
    });
}

// Global window keystroke shortcuts listener hooks
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !launcher.classList.contains("hidden")) {
        launcher.classList.add("hidden");
        launcher.classList.remove("active");
        launcherBtn.setAttribute("aria-expanded", "false");
        launcherBtn.focus(); // Returns user focus to the dashboard launcher button
    }
    
    // Command/Ctrl + Space hotkey action sequence switcher
    if ((event.ctrlKey || event.metaKey) && event.key === " ") {
        event.preventDefault();
        launcherBtn.click();
    }
});

function closeLauncher() {
    launcher.classList.remove("active");
}