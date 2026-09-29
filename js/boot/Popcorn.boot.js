/**
 * boot.js
 * Core desktop environment bootstrap orchestrator and secure session firewall.
 */
(async () => {
    console.log("[WebOS Kernel] Initializing core bootstrap sequence...");

    // 1. SECURITY TRAP: Verify that a valid local auth session exists before rendering the desktop
    const userSession = sessionStorage.getItem("webos-session");
    if (!userSession) {
        console.warn("[WebOS Security] Unauthorized access detected. Redirecting to login gate...");
        // Re-routes intruder straight back to your boot/auth interface page
        window.location.href = "boot.html"; 
        return; // Halt all layout initialization
    }

    // 2. Map global hardware UI nodes
    const clockElement = document.getElementById("clock");
    const themeStorageKey = "webos-theme";
    const defaultTheme = "ocean";

    /**
     * Updates loading messages if a status dashboard element exists on the desktop layer
     * @param {string} text - Kernel bootstrap tracking status string logs.
     */
    function updateBootStatus(text) {
        const statusEl = document.getElementById("boot-loader-status");
        if (statusEl) statusEl.textContent = text;
        console.log(`[WebOS Core] ${text}`);
    }

    try {
        // Step A: Initialize User Specific Custom Theme Stylesheets
        updateBootStatus(`Loading user session context for: ${userSession}...`);
        const activeTheme = localStorage.getItem(themeStorageKey) || defaultTheme;
        document.body.dataset.theme = activeTheme;

        // Step B: Ensure IndexedDB Virtual Storage Devices are fully mounted and seeded
        updateBootStatus("Mounting local IndexedDB blocks...");
        if (window.WebOSFileSystem && typeof window.WebOSFileSystem.ensureSeeded === "function") {
            await window.WebOSFileSystem.ensureSeeded();
        } else {
            console.warn("[WebOS Kernel] Warning: WebOSFileSystem module is missing or unlinked.");
        }

        // Step C: Render Application Registry Dock icons and menu indexes
        updateBootStatus("Registering software runtime shortcuts...");
        if (window.WebOSAppRegistry && typeof window.WebOSAppRegistry.render === "function") {
            window.WebOSAppRegistry.render();
        } else {
            console.warn("[WebOS Kernel] Warning: WebOSAppRegistry environment is missing or unlinked.");
        }

        // Step D: Spin Up System Clock Daemon Services
        updateBootStatus("Syncing hardware time managers...");
        if (clockElement) {
            const updateClock = () => {
                clockElement.textContent = new Date().toLocaleTimeString([], { 
                    hour: "2-digit", 
                    minute: "2-digit" 
                });
            };
            updateClock();
            setInterval(updateClock, 30000); // Pulse check runs every 30 seconds
        }

        // Step E: Dismount initialization loading layouts if present
        updateBootStatus("Desktop services operating normally.");
        const bootOverlay = document.getElementById("BootSplashOverlay");
        if (bootOverlay) {
            bootOverlay.classList.add("fade-out");
            bootOverlay.addEventListener("transitionend", () => bootOverlay.remove(), { once: true });
        }

    } catch (kernelException) {
        console.error("[WebOS Kernel Panic] Fatal error during environment load routine:", kernelException);
        
        // Fail-safe crash dashboard UI wrapper block allocation (Emulates kernel panic)
        document.body.innerHTML = `
            <div style="background:#002244;color:#ff6666;font-family:monospace;padding:40px;height:100vh;box-sizing:border-box;">
                <h1>⚠️ WebOS Kernel Panic</h1>
                <p>An unresolved runtime exception crashed the primary desktop loader pipeline.</p>
                <hr style="border-color:#ff6666;">
                <pre style="background:#001122;padding:20px;color:#ffcccc;overflow:auto;">${kernelException.stack || kernelException}</pre>
                <div style="margin-top:20px;">
                    <button onclick="sessionStorage.clear(); location.reload();" style="background:#ffaa00;color:#000;border:none;padding:10px 20px;cursor:pointer;font-weight:bold;margin-right:10px;">Clear Session & Retry</button>
                    <button onclick="window.location.href='boot.html'" style="background:#ff6666;color:#000;border:none;padding:10px 20px;cursor:pointer;font-weight:bold;">Return to Login</button>
                </div>
            </div>
        `;
    }
})();
