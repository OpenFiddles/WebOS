/**
 * file-system.js
 * High-Performance, Persistent IndexedDB Virtual Filesystem with Advanced API Utilities for WebOS.
 */
(() => {
    const profileId = (localStorage.getItem("webos-current-user") || "default").replace(/[^a-z0-9_-]/gi, "");
    const databaseName = "webos-filesystem-" + (profileId || "default");
    const storeName = "entries";
    let databasePromise = null;

    /**
     * Initializes and returns the global connection instance to IndexedDB safely.
     */
    function openDatabase() {
        if (databasePromise) return databasePromise;
        databasePromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(databaseName, 2); // Schema synchronization version
            
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

    /**
     * Resolves messy user paths into standard, predictable absolute paths.
     */
    function normalize(path) {
        if (!path || typeof path !== "string") return "/";
        const value = path.replace(/\\/g, "/");
        const normalized = "/" + value.split("/").filter(Boolean).join("/");
        return normalized === "/" ? normalized : normalized.replace(/\/$/, "");
    }

    /**
     * Generates baseline system directories on primary initialization.
     */
    async function ensureSeeded() {
        const database = await openDatabase();
        
        const hasRoot = await new Promise((resolve) => {
            const tx = database.transaction(storeName, "readonly");
            const request = tx.objectStore(storeName).get("/");
            request.onsuccess = () => resolve(!!request.result);
            request.onerror = () => resolve(false);
        });

        if (hasRoot) return;
        
        const seedData = [
            { path: "/", type: "directory", size: 0, modified: Date.now() },
            { path: "/Desktop", type: "directory", size: 0, modified: Date.now() },
            { path: "/Documents", type: "directory", size: 0, modified: Date.now() },
            { path: "/Downloads", type: "directory", size: 0, modified: Date.now() },
            { path: "/Documents/Welcome.txt", type: "file", content: "Welcome to WebOS.\nYour persistent file environment is active.\n", size: 66, modified: Date.now() }
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
            let currentAccumulator = "";
            for (let i = 0; i < pathParts.length - 1; i++) {
                currentAccumulator += "/" + pathParts[i];
                await new Promise((resolve, reject) => {
                    const tx = database.transaction(storeName, "readwrite");
                    const store = tx.objectStore(storeName);
                    store.put({
                        path: currentAccumulator,
                        type: "directory",
                        size: 0,
                        modified: Date.now()
                    });
                    tx.oncomplete = resolve;
                    tx.onerror = () => reject(tx.error);
                });
            }
        }

        return new Promise((resolve, reject) => {
            const tx = database.transaction(storeName, "readwrite");
            const store = tx.objectStore(storeName);
            const fileString = String(content);
            const filePayload = {
                path: normalized,
                type: "file",
                content: fileString,
                size: new Blob([fileString]).size,
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
        if (normalized === "/") return false;
        
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
     */
    async function exists(path) {
        const item = await read(path);
        return item !== null;
    }

    /**
     * Creates an empty directory folder resource node explicitly inside the database stack.
     */
    async function makeDirectory(path) {
        await ensureSeeded();
        const normalized = normalize(path);
        const database = await openDatabase();

        return new Promise((resolve, reject) => {
            const tx = database.transaction(storeName, "readwrite");
            const store = tx.objectStore(storeName);
            store.put({
                path: normalized,
                type: "directory",
                size: 0,
                modified: Date.now()
            });
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    }

    /**
     * Copies a file or folder context cleanly to a new target path tracking key.
     * FIX: Restored native directory node configuration objects instead of blank text nodes.
     */
        /**
     * Copies a file or folder context cleanly to a new target path tracking key.
     * FIX: Restored native directory node configuration objects instead of blank text nodes.
     */
        async function copy(sourcePath, destinationPath) {
            const src = normalize(sourcePath);
            const dest = normalize(destinationPath);
            const item = await read(src);
            
            if (!item) throw new Error(`Source path not found: ${src}`);
            
            if (item.type === "file") {
                return item.binary ? await putBinary(dest, item.content, item.mimeType) : await putText(dest, item.content);
            } else {
                const database = await openDatabase();
                const allEntries = await new Promise((resolve) => {
                    const tx = database.transaction(storeName, "readonly");
                    const req = tx.objectStore(storeName).getAll();
                    req.onsuccess = () => resolve(req.result || []);
                });
    
                const children = allEntries.filter(entry => entry.path.startsWith(src + "/"));
                
                // Create root cloned directory node cleanly
                await makeDirectory(dest); 
                
                // Loop and remap all sub-path structures preserving original types
                for (const child of children) {
                    const subPathRemainder = child.path.slice(src.length);
                    const targetedNewPath = dest + subPathRemainder;
                    if (child.type === "file") {
                        if (child.binary) await putBinary(targetedNewPath, child.content, child.mimeType);
                        else await putText(targetedNewPath, child.content);
                    } else {
                        await makeDirectory(targetedNewPath);
                    }
                }
                return true;
            }
        }
    
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
    
            const allEntries = await new Promise((resolve, reject) => {
                const tx = database.transaction(storeName, "readonly");
                const request = tx.objectStore(storeName).getAll();
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => reject(request.error);
            });
    
            const childrenToMove = allEntries.filter(entry => entry.path.startsWith(src + "/"));
    
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
    
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => reject(tx.error);
            });
        }
    
    
    async function putBinary(path, data, mimeType = "application/wasm") {
        await ensureSeeded();
        const normalized = normalize(path), parts = normalized.split("/").filter(Boolean), database = await openDatabase();
        let parent = "";
        for (let i = 0; i < parts.length - 1; i++) {
            parent += "/" + parts[i];
            await new Promise((resolve, reject) => {
                const tx = database.transaction(storeName, "readwrite");
                tx.objectStore(storeName).put({ path: parent, type: "directory", size: 0, modified: Date.now() });
                tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
            });
        }
        let buffer;
        if (data instanceof Blob) buffer = await data.arrayBuffer();
        else if (data instanceof ArrayBuffer) buffer = data.slice(0);
        else if (ArrayBuffer.isView(data)) buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
        else throw new TypeError("Binary data must be a Blob, ArrayBuffer, or typed array.");
        const record = { path: normalized, type: "file", binary: true, mimeType: String(mimeType || "application/octet-stream"), content: buffer, size: buffer.byteLength, modified: Date.now() };
        return new Promise((resolve, reject) => {
            const tx = database.transaction(storeName, "readwrite");
            tx.objectStore(storeName).put(record);
            tx.oncomplete = () => resolve({ path: record.path, type: record.type, binary: true, mimeType: record.mimeType, size: record.size, modified: record.modified });
            tx.onerror = () => reject(tx.error);
        });
    }
    async function readBinary(path) {
        const record = await read(path);
        if (!record || record.type !== "file") return null;
        if (record.content instanceof ArrayBuffer) return record.content.slice(0);
        if (ArrayBuffer.isView(record.content)) return record.content.buffer.slice(record.content.byteOffset, record.content.byteOffset + record.content.byteLength);
        if (typeof record.content === "string") return new TextEncoder().encode(record.content).buffer;
        return null;
    }

    // Freeze and bind the object export cleanly
        window.WebOSFileSystem = Object.freeze({
            openDatabase,
            normalize,
            ensureSeeded,
            list,
            read,
            putText,
            putBinary,
            readBinary,
            remove,
            exists,
            makeDirectory,
            copy,
            move
        });
})();
    
