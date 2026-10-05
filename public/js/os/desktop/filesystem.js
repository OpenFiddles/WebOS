/**
 * file-system.js
 * High-Performance, Persistent IndexedDB Virtual Filesystem with Advanced API Utilities for WebOS.
 */
(() => {
    const databaseName = "webos-filesystem";
    const storeName = "entries";
    let databasePromise = null;

    /**
     * Initializes and returns the global connection instance to IndexedDB safely.
     */
    function openDatabase() {
        if (databasePromise) return databasePromise;
        databasePromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(databaseName, 1);
            
            request.onupgradeneeded = () => {
                const database = request.result;
                if (!database.objectStoreNames.contains(storeName)) {
                    // Path acts as our immutable unique primary key index string
                    database.createObjectStore(storeName, { keyPath: "path" });
                }
            };
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        return databasePromise;
    }

    /**
     * Resolves messy user paths into standard, predictable absolute paths.
     */
    function normalize(path) {
        const value = String(path || "/").replace(/\\/g, "/");
        const normalized = "/" + value.split("/").filter(Boolean).join("/");
        return normalized === "/" ? normalized : normalized.replace(/\/$/, "");
    }

    /**
     * Generates baseline system directories on primary initialization.
     */
    async function ensureSeeded() {
        const database = await openDatabase();
        
        const checkRoot = await new Promise((resolve) => {
            const tx = database.transaction(storeName, "readonly");
            const request = tx.objectStore(storeName).get("/");
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
        });

        if (checkRoot) return;
        
        const seedData = [
            { path: "/", type: "directory", modified: Date.now() },
            { path: "/Desktop", type: "directory", modified: Date.now() },
            { path: "/Documents", type: "directory", modified: Date.now() },
            { path: "/Downloads", type: "directory", modified: Date.now() },
            { path: "/Documents/Welcome.txt", type: "file", content: "Welcome to WebOS.\nYour persistent file environment is active.\n", modified: Date.now() }
        ];
        
        await new Promise((resolve, reject) => {
            const tx = database.transaction(storeName, "readwrite");
            const store = tx.objectStore(storeName);
            seedData.forEach((entry) => store.put(entry));
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    }

    // ----------------------------------------------------
    // CORE SYSTEM FILE OPERATIONS
    // ----------------------------------------------------

    /**
     * Compiles a list of files and folders inside a target directory context layer.
     */
    async function list(directory = "/") {
        await ensureSeeded();
        const parent = normalize(directory);
        const database = await openDatabase();
        
        const allEntries = await new Promise((resolve, reject) => {
            const tx = database.transaction(storeName, "readonly");
            const request = tx.objectStore(storeName).getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
        
        return allEntries
            .filter((entry) => {
                if (entry.path === parent) return false;
                
                if (parent === "/") {
                    const parts = entry.path.split("/").filter(Boolean);
                    return parts.length === 1;
                }
                
                const prefix = parent + "/";
                if (!entry.path.startsWith(prefix)) return false;
                
                const remainder = entry.path.slice(prefix.length);
                return remainder && !remainder.includes("/");
            })
            .sort((left, right) => left.type.localeCompare(right.type) || left.path.localeCompare(right.path));
    }

    /**
     * Persists content strings into IndexedDB, making parent directories on the fly.
     */
    async function putText(path, content) {
        await ensureSeeded();
        const normalized = normalize(path);
        const pathParts = normalized.split("/").filter(Boolean);
        const database = await openDatabase();

        if (pathParts.length > 1) {
            await new Promise((resolve, reject) => {
                const tx = database.transaction(storeName, "readwrite");
                const store = tx.objectStore(storeName);
                let currentAccumulator = "";
                
                for (let i = 0; i < pathParts.length - 1; i++) {
                    currentAccumulator += "/" + pathParts[i];
                    store.put({
                        path: currentAccumulator,
                        type: "directory",
                        modified: Date.now()
                    });
                }
                tx.oncomplete = resolve;
                tx.onerror = () => reject(tx.error);
            });
        }

        return new Promise((resolve, reject) => {
            const tx = database.transaction(storeName, "readwrite");
            const store = tx.objectStore(storeName);
            const filePayload = {
                path: normalized,
                type: "file",
                content: String(content),
                modified: Date.now()
            };
            
            store.put(filePayload);
            tx.oncomplete = () => resolve(filePayload);
            tx.onerror = () => reject(tx.error);
        });
    }

    /**
     * Reads a direct file path record descriptor block.
     */
    async function read(path) {
        await ensureSeeded();
        const normalized = normalize(path);
        const database = await openDatabase();
        
        return new Promise((resolve, reject) => {
            const tx = database.transaction(storeName, "readonly");
            const request = tx.objectStore(storeName).get(normalized);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Deletes target paths. If path matches a directory, it executes a recursive purge.
     */
    async function remove(path) {
        await ensureSeeded();
        const normalized = normalize(path);
        const database = await openDatabase();
        
        const allEntries = await new Promise((resolve, reject) => {
            const tx = database.transaction(storeName, "readonly");
            const request = tx.objectStore(storeName).getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
        
        return new Promise((resolve, reject) => {
            const tx = database.transaction(storeName, "readwrite");
            const store = tx.objectStore(storeName);
            
            allEntries
                .filter((entry) => entry.path === normalized || entry.path.startsWith(normalized + "/"))
                .forEach((entry) => store.delete(entry.path));
                
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    }

    // ----------------------------------------------------
    // ADVANCED EXTENDED ADVANCED OS FILE UTILITY APIs
    // ----------------------------------------------------

    /**
     * Checks if a specific file path layout entry exists.
     * Returns true or false.
     */
    async function exists(path) {
        const item = await read(path);
        return item !== null;
    }

    /**
     * Copies a file or folder context cleanly to a new target path tracking key.
     */
    async function copy(sourcePath, destinationPath) {
        const src = normalize(sourcePath);
        const dest = normalize(destinationPath);
        const item = await read(src);
        
        if (!item) throw new Error(`Source path not found: ${src}`);
        
        if (item.type === "file") {
            return await putText(dest, item.content);
        } else {
            // If directory, pull down all sub-assets recursively
            const database = await openDatabase();
            const allEntries = await new Promise((resolve) => {
                const tx = database.transaction(storeName, "readonly");
                const req = tx.objectStore(storeName).getAll();
                req.onsuccess = () => resolve(req.result || []);
            });

            const children = allEntries.filter(entry => entry.path.startsWith(src + "/"));
            
            // Create root directory clone first
            await putText(dest, ""); 
            
            // Loop and remap all sub-path structures
            for (const child of children) {
                const subPathRemainder = child.path.slice(src.length);
                const targetedNewPath = dest + subPathRemainder;
                if (child.type === "file") {
                    await putText(targetedNewPath, child.content);
                } else {
                    await putText(targetedNewPath, "");
                }
            }
            return true;
        }
    }

    /**
     * Moves or renames an entry block, cleanly updating child structures before wiping old source tracking hooks.
     */
    /**
 * Moves or renames an entry block asynchronously.
 * Automatically mirrors and migrates deep child subfolder configurations before executing a structural tree prune.
 */
async function move(sourcePath, destinationPath) {
    await ensureSeeded();
    const src = normalize(sourcePath);
    const dest = normalize(destinationPath);
    
    const sourceNode = await read(src);
    if (!sourceNode) throw new Error(`Move failure: Source path context not found: ${src}`);
    const database = await openDatabase();

    // Fetch all items from the store to trace and isolate downstream children pathways
    const allEntries = await new Promise((resolve, reject) => {
        const tx = database.transaction(storeName, "readonly");
        const request = tx.objectStore(storeName).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });

    // Isolate targeting parameters for children entries residing inside the migrating branch
    const childrenToMove = allEntries.filter(entry => entry.path.startsWith(src + "/"));

    // Execute atomic multi-record write sequence routine transaction block
    return new Promise((resolve, reject) => {
        const tx = database.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);

        // 1. Write the primary moving root asset over to the new destination pointer path context
        store.put({
            ...sourceNode,
            path: dest,
            modified: Date.now()
        });

        // 2. Loop through and remap all subpath layouts for child tree structures
        childrenToMove.forEach(child => {
            const remainderPath = child.path.slice(src.length);
            const reassignedPath = dest + remainderPath;
            
            store.put({
                ...child,
                path: reassignedPath,
                modified: Date.now()
            });
        });

        // 3. Purge legacy traces safely by executing cascading deletes across original paths
        store.delete(src);
        childrenToMove.forEach(child => store.delete(child.path));

        // Transaction resolution listener hooks
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
    });
}
})
