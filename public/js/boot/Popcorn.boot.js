/**
 * Popcorn.boot.js
 * Core desktop environment bootstrap orchestrator and secure session firewall.
 */
(async () => {
    console.log("[WebOS Kernel] Initializing core bootstrap sequence...");

    // -------------------------------------------------------------
    // 1. ENVIRONMENT DETECTION & SELECTORS
    // -------------------------------------------------------------
    const bootContainer = document.getElementById("boot");
    const authScreen = document.getElementById("auth-screen");
    const clockElement = document.getElementById("clock");
    
    const themeStorageKey = "webos-theme";
    const defaultTheme = "ocean";

    // Track state variables
    let redirected = false;
    let signingIn = false;

    /**
     * Updates loading messages across active UI layouts
     * @param {string} text - Kernel bootstrap tracking status string logs.
     */
    function updateBootStatus(text) {
        const statusEl = document.getElementById("boot-loader-status") || document.getElementById("boot-status");
        if (statusEl) statusEl.textContent = text;
        console.log(`[WebOS Core] ${text}`);
    }

    /**
     * Securely generates SHA-256 hashes of user credentials locally in-browser
     */
    async function passwordHash(email, password) {
        const data = new TextEncoder().encode(email.trim().toLowerCase() + ":" + password);
        const digest = await crypto.subtle.digest("SHA-256", data);
        return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    }

    // -------------------------------------------------------------
    // 2. SECURITY & AUTHENTICATION GATES
    // -------------------------------------------------------------
    const userSession = sessionStorage.getItem("webos-session");

    // Scenario A: If we are on the DisplayManager workspace but not logged in, intercept instantly
    if (!userSession && !bootContainer && !authScreen) {
        console.warn("[WebOS Security] Unauthorized access attempts. Redirecting to auth gate...");
        window.location.href = "BootScreen_popcorn.html"; 
        return; 
    }

    // Scenario B: If we are initializing on the Boot Screen layer, register the event listeners
    if (bootContainer || authScreen) {
        console.log("[WebOS Bootloader] Execution runtime active on boot canvas.");
        initBootloaderListeners();
        warmAlpineRootfs(); // Attach real-time service worker progress trackers
        return; // Halt execution loop; authorization actions handle next stage context routing
    }

    // Scenario C: Authenticated session verified. Initializing primary Desktop environments.
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
        triggerKernelPanic(kernelException);
    }

    // -------------------------------------------------------------
    // 3. CORE BOOTLOADER SUBSYSTEM IMPLEMENTATIONS
    // -------------------------------------------------------------

    /**
     * Binds into the kernel's background service worker communication pipeline
     * to monitor actual installation state and compute high-fidelity streaming metrics.
     */
    function warmAlpineRootfs() {
        const TOTAL_CORE_FILES = 13; // Count matches Service Worker array exactly
        let currentAssetIndex = 0;
        let largeFilePercent = 0;

        if (!('serviceWorker' in navigator)) {
            // Instant automated bypass fallback if running in a restricted sandbox tier
            setTimeout(() => {
                updateBootStatus("Compatibility layer active.");
                const progressFill = document.getElementById("loading-progress");
                if (progressFill) progressFill.style.width = "100%";
                onBootComplete();
            }, 800);
            return;
        }

        // Intercept granular message flags broadcasted from the service worker kernel
        navigator.serviceWorker.addEventListener('message', (event) => {
            const { type, data } = event.data;
            const progressFill = document.getElementById("loading-progress");

            switch (type) {
                case 'CACHE_START':
                    updateBootStatus("Spawning virtual storage contexts...");
                    if (progressFill) progressFill.style.width = "10%";
                    break;

                case 'CACHE_FILE_STREAM':
                    if (data.url.endsWith('alpine.ext2')) {
                        largeFilePercent = data.percent;
                        // Calculate base loading metrics + ongoing byte streams so the bar never halts
                        const baseWeight = (currentAssetIndex / TOTAL_CORE_FILES) * 100;
                        const streamContribution = (largeFilePercent / 100) * (100 / TOTAL_CORE_FILES);
                        const weightedProgress = Math.min(Math.round(baseWeight + streamContribution), 99);
                        
                        updateBootStatus(`Streaming Alpine image: ${largeFilePercent}%`);
                        if (progressFill) progressFill.style.width = `${weightedProgress}%`;
                    }
                    break;

                case 'CACHE_PROGRESS':
                    currentAssetIndex = data.loaded;
                    const absolutePercent = data.percent;
                    // Retain maximum value floor to safeguard against visual layout flicker
                    const calculatedProgress = Math.max(absolutePercent, Math.round((currentAssetIndex / TOTAL_CORE_FILES) * 100));
                    
                    updateBootStatus(`Mounting driver asset [${data.loaded}/${data.total}]...`);
                    if (progressFill) progressFill.style.width = `${calculatedProgress}%`;
                    break;

                case 'CACHE_COMPLETE':
                    updateBootStatus("Desktop services ready.");
                    if (progressFill) progressFill.style.width = "100%";
                    onBootComplete();
                    break;

                case 'CACHE_ERROR':
                    console.warn("[WebOS Bootloader Subsystem] Minor component skip:", data.url, data.error);
                    break;
            }
        });
    }

    function onBootComplete() {
        const skipButton = document.getElementById("skip-boot");
        if (!skipButton) return;
        skipButton.disabled = false;
        skipButton.textContent = "Continue to desktop";
        
        if (sessionStorage.getItem("webos-session")) {
            openDesktop();
        } else {
            // Automatically transitions smoothly to auth screen if no active session found
            showAuth();
        }
    }

    function showAuth() {
        if (!bootContainer || !authScreen) return;
        
        bootContainer.style.transition = "opacity 0.25s ease";
        bootContainer.style.opacity = "0";

        setTimeout(() => {
            bootContainer.style.display = "none";
            authScreen.style.display = "block"; 
            
            requestAnimationFrame(() => {
                authScreen.style.transition = "opacity 0.25s ease";
                authScreen.style.opacity = "1";
                authScreen.classList.add("active");
                
                // Pre-evaluate local profile cache state to switch modes contextually
                const savedAccount = localStorage.getItem("webos-account");
                setAuthMode(!!savedAccount);

                const emailInput = document.getElementById("auth-email");
                if (emailInput) emailInput.focus();
            });
        }, 250);
    }

    function setAuthMode(signIn) {
        signingIn = signIn;
        const authTitle = document.getElementById("auth-title");
        const authCopy = document.getElementById("auth-copy");
        const authSubmit = document.getElementById("auth-submit");
        const authSwitch = document.getElementById("auth-switch");
        const authStatus = document.getElementById("auth-status");

        if (authTitle) authTitle.textContent = signIn ? "Sign in to WebOS" : "Welcome to WebOS";
        if (authCopy) authCopy.textContent = signIn
            ? "Sign in to the local account saved in this browser."
            : "Create a local account for this browser. Your password is hashed and never sent anywhere.";
        if (authSubmit) authSubmit.textContent = signIn ? "Sign in" : "Create local account";
        if (authSwitch) authSwitch.textContent = signIn ? "Need an account? Sign up" : "Already have an account? Sign in";
        
        const passwordInput = document.getElementById("auth-password");
        if (passwordInput) {
            passwordInput.autocomplete = signIn ? "current-password" : "new-password";
        }
        if (authStatus) {
            authStatus.className = "auth-status";
            authStatus.textContent = "";
        }
    }

    function openDesktop() {
        if (redirected) return;
        redirected = true;
        updateBootStatus("Opening desktop...");
        
        document.body.style.transition = "opacity 0.3s ease";
        document.body.style.opacity = "0";

        setTimeout(() => {
            window.location.href = "DisplayManager_PopIT.html";
        }, 300);
    }

    function finishAuth(email) {
        sessionStorage.setItem("webos-session", email);
        const authStatus = document.getElementById("auth-status");
        if (authStatus) {
            authStatus.className = "auth-status success";
            authStatus.textContent = "Signed in. Opening desktop...";
        }
        setTimeout(openDesktop, 350);
    }

    function initBootloaderListeners() {
        const skipButton = document.getElementById("skip-boot");
        const authSwitch = document.getElementById("auth-switch");
        const authForm = document.getElementById("auth-form");
        const authStatus = document.getElementById("auth-status");

        if (skipButton) {
            skipButton.addEventListener("click", showAuth);
        }
        
        window.addEventListener("keydown", (event) => {
            if (authScreen && authScreen.style.display === "none" && skipButton && !skipButton.disabled && (event.key === "Enter" || event.key === " ")) {
                showAuth();
            }
        });
        
        if (authSwitch) {
            authSwitch.addEventListener("click", () => setAuthMode(!signingIn));
        }
        
        const resetButton = document.getElementById("auth-reset");
        if (resetButton) {
            resetButton.addEventListener("click", () => {
                if (!window.confirm("Remove the local WebOS account from this browser?")) return;
                localStorage.removeItem("webos-account");
                setAuthMode(false);
                if (authStatus) {
                    authStatus.className = "auth-status warning";
                    authStatus.textContent = "Local account removed. You can create a new one.";
                }
            });
        }
        
        document.querySelectorAll("[data-provider]").forEach((button) => {
            button.addEventListener("click", () => {
                if (authStatus) {
                    authStatus.className = "auth-status info";
                    authStatus.textContent = button.dataset.provider + " sign-in requires an OAuth client ID. Use email/password local mode.";
                }
            });
        });
        
        const guestButton = document.getElementById("guest-button");
        if (guestButton) {
            guestButton.addEventListener("click", () => finishAuth("guest_user"));
        }
        
        if (authForm) {
            authForm.addEventListener("submit", async (event) => {
                event.preventDefault();
                const emailInput = document.getElementById("auth-email");
                const passwordInput = document.getElementById("auth-password");
                
                if (!emailInput || !passwordInput) return;

                const email = emailInput.value.trim().toLowerCase();
                const password = passwordInput.value;
                const saved = JSON.parse(localStorage.getItem("webos-account") || "null");
                
                if (signingIn) {
                    if (!saved || saved.email !== email || saved.passwordHash !== await passwordHash(email, password)) {
                        if (authStatus) {
                            authStatus.className = "auth-status error";
                            authStatus.textContent = "Email or password is incorrect.";
                        }
                        return;
                    }
                    finishAuth(email);
                    return;
                }
                if (saved) {
                    if (authStatus) {
                        authStatus.className = "auth-status error";
                        authStatus.textContent = "A local account already exists. Sign in instead.";
                    }
                    return;
                }
                localStorage.setItem("webos-account", JSON.stringify({ 
                    email, 
                    passwordHash: await passwordHash(email, password), 
                    createdAt: Date.now() 
                }));
                finishAuth(email);
            });
        }
    }

    // -------------------------------------------------------------
    // 4. CRASH HANDLING SYSTEM (KERNEL PANIC)
    // -------------------------------------------------------------
    function triggerKernelPanic(kernelException) {
        console.error("[WebOS Kernel Panic] Fatal error during environment load routine:", kernelException);
        document.body.innerHTML = `
            <div style="background:#002244;color:#ff6666;font-family:monospace;padding:40px;height:100vh;box-sizing:border-box;position:fixed;top:0;left:0;width:100vw;z-index:99999;">
                <h1>⚠️ WebOS Kernel Panic</h1>
                <p>An unresolved runtime exception crashed the primary desktop loader pipeline.</p>
                <hr style="border-color:#ff6666;">
                <pre style="background:#001122;padding:20px;color:#ffcccc;overflow:auto;max-height:50vh;">${kernelException.stack || kernelException}</pre>
                <div style="margin-top:20px;">
                    <button onclick="sessionStorage.clear(); location.reload();" style="background:#ffaa00;color:#000;border:none;padding:10px 20px;cursor:pointer;font-weight:bold;margin-right:10px;">Clear Session & Retry</button>
                    <button onclick="window.location.href='BootScreen_popcorn.html'" style="background:#ff6666;color:#000;border:none;padding:10px 20px;cursor:pointer;font-weight:bold;">Return to Login</button>
                </div>
            </div>
        `;
    }
})();

