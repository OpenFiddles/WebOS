/**
 * file-system.js
 * Asynchronous IndexedDB Virtual Filesystem Abstraction Layer for WebOS.
 */
(() => {
    const databaseName = "webos-filesystem";
    const storeName = "entries";
    let databasePromise;

    function openDatabase() {
        if (databasePromise) return databasePromise;
        databasePromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(databaseName, 1);
            request.onupgradeneeded = () => {
                const database = request.result;
                if (!database.objectStoreNames.contains(storeName)) {
                    database.createObjectStore(storeName, { keyPath: "path" });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        return databasePromise;
    }

    async function transaction(mode, callback) {
        const database = await openDatabase();
        return new Promise((resolve, reject) => {
            const request = database.transaction(storeName, mode).objectStore(storeName);
            const result = callback(request);
            if (result && typeof result.onsuccess !== "undefined") {
                result.onsuccess = () => resolve(result.result);
                result.onerror = () => reject(result.error);
            } else {
                resolve(result);
            }
        });
    }

    function normalize(path) {
        const value = String(path || "/").replace(/\\/g, "/");
        const normalized = "/" + value.split("/").filter(Boolean).join("/");
        return normalized === "/" ? normalized : normalized.replace(/\/$/, "");
    }

    async function ensureSeeded() {
        const root = await transaction("readonly", (store) => store.get("/"));
        if (root) return;
        
        const seed = [
            { path: "/", type: "directory", modified: Date.now() },
            { path: "/Desktop", type: "directory", modified: Date.now() },
            { path: "/Documents", type: "directory", modified: Date.now() },
            { path: "/Downloads", type: "directory", modified: Date.now() },
            { path: "/Documents/Welcome.txt", type: "file", content: "Welcome to WebPopcorn OS.\n", modified: Date.now() }
        ];
        
        const database = await openDatabase();
        await new Promise((resolve, reject) => {
            const store = database.transaction(storeName, "readwrite").objectStore(storeName);
            seed.forEach((entry) => store.put(entry));
            store.transaction.oncomplete = resolve;
            store.transaction.onerror = () => reject(store.transaction.error);
        });
    }

    async function list(directory = "/") {
        await ensureSeeded();
        const parent = normalize(directory);
        const entries = await transaction("readonly", (store) => store.getAll());
        
        return entries
            .filter((entry) => {
                if (entry.path === parent) return false;
                if (parent === "/") {
                    // Root optimization: ensure item lives exactly on root layer
                    const parts = entry.path.split("/").filter(Boolean);
                    return parts.length === 1;
                }
                // FIX: Ensure absolute directory matching boundary via startsWith checking with trailing slash
                const prefix = parent + "/";
                if (!entry.path.startsWith(prefix)) return false;
                
                const remainder = entry.path.slice(prefix.length);
                return remainder && !remainder.includes("/");
            })
            .sort((left, right) => left.type.localeCompare(right.type) || left.path.localeCompare(right.path));
    }

    async function putText(path, content) {
        await ensureSeeded();
        const normalized = normalize(path);
        
        // FIX: Proactive Recursive Parent Directory Generation
        // If writing to /Documents/Folders/Test.txt, automatically create directory entries for parent lines
        const pathParts = normalized.split("/").filter(Boolean);
        if (pathParts.length > 1) {
            const database = await openDatabase();
            await new Promise((resolve, reject) => {
                const store = database.transaction(storeName, "readwrite").objectStore(storeName);
                let standardAccumulator = "";
                
                // Track everything up to the final file name segment
                for (let i = 0; i < pathParts.length - 1; i++) {
                    standardAccumulator += "/" + pathParts[i];
                    store.put({
                        path: standardAccumulator,
                        type: "directory",
                        modified: Date.now()
                    });
                }
                store.transaction.oncomplete = resolve;
                store.transaction.onerror = () => reject(store.transaction.error);
            });
        }

        // Commit core file entry payload securely
        return transaction("readwrite", (store) => store.put({
            path: normalized,
            type: "file",
            content: String(content),
            modified: Date.now()
        }));
    }

    async function read(path) {
        await ensureSeeded();
        return transaction("readonly", (store) => store.get(normalize(path)));
    }

    async function remove(path) {
        await ensureSeeded();
        const normalized = normalize(path);
        const entries = await transaction("readonly", (store) => store.getAll());
        const database = await openDatabase();
        
        return new Promise((resolve, reject) => {
            const store = database.transaction(storeName, "readwrite").objectStore(storeName);
            entries.filter((entry) => entry.path === normalized || entry.path.startsWith(normalized + "/"))
                .forEach((entry) => store.delete(entry.path));
            store.transaction.oncomplete = resolve;
            store.transaction.onerror = () => reject(store.transaction.error);
        });
    }

    window.WebOSFileSystem = Object.freeze({ ensureSeeded, list, putText, read, remove });
})();
