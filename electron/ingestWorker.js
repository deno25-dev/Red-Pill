
const { parentPort } = require('worker_threads');
const Database = require('better-sqlite3');
const fs = require('fs');
const readline = require('readline');

// Helper: Parse a single CSV line
const parseLine = (line) => {
    if (!line || !line.trim() || !/^\d/.test(line.trim())) return null;

    const delimiter = line.indexOf(';') > -1 ? ';' : ',';
    const parts = line.split(delimiter);

    // Minimum columns check
    if (parts.length < 5) return null;

    try {
        let dateStr = '';
        let timestamp = 0;
        let open = 0, high = 0, low = 0, close = 0, volume = 0;

        const p0 = parts[0].trim();
        const p1 = parts[1].trim();

        // Heuristics for Date+Time vs DateTime
        const isDateColumn = /^\d{8}$/.test(p0) || /^\d{4}[\.\-\/]\d{2}[\.\-\/]\d{2}$/.test(p0);
        const isTimeColumn = p1.includes(':');

        if (isDateColumn && isTimeColumn) {
            // Format: YYYYMMDD or YYYY/MM/DD + HH:MM:SS
            let cleanDate = p0.replace(/[\.\-\/]/g, '');
            if (cleanDate.length === 8) {
                cleanDate = `${cleanDate.substring(0,4)}-${cleanDate.substring(4,6)}-${cleanDate.substring(6,8)}`;
            }
            dateStr = `${cleanDate}T${p1}`;
            
            // OHLCV indices shifted
            open = parseFloat(parts[2]);
            high = parseFloat(parts[3]);
            low = parseFloat(parts[4]);
            close = parseFloat(parts[5]);
            if (parts.length > 6) {
                const v = parseFloat(parts[6]);
                volume = isNaN(v) ? 0 : v;
            }
        } else {
             // Standard Format: Date, Open, High, Low, Close, Volume
             dateStr = p0;
             open = parseFloat(parts[1]);
             high = parseFloat(parts[2]);
             low = parseFloat(parts[3]);
             close = parseFloat(parts[4]);
             if (parts.length > 5) {
                 const v = parseFloat(parts[5]);
                 volume = isNaN(v) ? 0 : v;
             }
        }

        if (isNaN(open) || isNaN(close)) return null;

        timestamp = new Date(dateStr).getTime();
        
        // Fallback for raw unix timestamps
        if (isNaN(timestamp)) {
            timestamp = parseFloat(dateStr);
            // Auto-detect seconds vs ms (assume anything < 10 billion is seconds)
            if (!isNaN(timestamp) && timestamp < 10000000000) timestamp *= 1000;
        }

        if (isNaN(timestamp) || timestamp <= 0) return null;

        return { timestamp, open, high, low, close, volume };
    } catch (e) {
        return null;
    }
};

parentPort.on('message', (task) => {
    const { dbPath, filePath, symbol, timeframe } = task;
    
    // 1. Connect to DB
    let db;
    try {
        db = new Database(dbPath);
        // Optimization Pragmas
        db.pragma('journal_mode = WAL');
        db.pragma('synchronous = NORMAL');
    } catch (err) {
        parentPort.postMessage({ success: false, error: `Worker DB connection failed: ${err.message}` });
        return;
    }
    
    try {
        // 2. Prepare Statement
        const insertStmt = db.prepare(`
            INSERT OR IGNORE INTO market_data (symbol, timeframe, timestamp, open, high, low, close, volume) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        // 3. Define Batch Transaction
        const insertBatch = db.transaction((rows) => {
            for (const r of rows) {
                insertStmt.run(symbol, timeframe, r.timestamp, r.open, r.high, r.low, r.close, r.volume);
            }
        });

        // 4. Stream & Process
        const BATCH_SIZE = 5000;
        let buffer = [];
        let totalRows = 0;

        const fileStream = fs.createReadStream(filePath);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        rl.on('line', (line) => {
            const row = parseLine(line);
            if (row) {
                buffer.push(row);
                
                // Flush buffer when full
                if (buffer.length >= BATCH_SIZE) {
                    // Sort buffer to improve index locality (optional but recommended)
                    buffer.sort((a, b) => a.timestamp - b.timestamp);
                    insertBatch(buffer);
                    totalRows += buffer.length;
                    buffer = [];
                }
            }
        });

        rl.on('close', () => {
            // Flush remaining items
            if (buffer.length > 0) {
                buffer.sort((a, b) => a.timestamp - b.timestamp);
                insertBatch(buffer);
                totalRows += buffer.length;
            }
            
            db.close();
            parentPort.postMessage({ success: true, count: totalRows });
        });

        rl.on('error', (err) => {
            if (db && db.open) db.close();
            parentPort.postMessage({ success: false, error: `Stream read error: ${err.message}` });
        });

    } catch (err) {
        if (db && db.open) db.close();
        parentPort.postMessage({ success: false, error: `Worker execution failed: ${err.message}` });
    }
});
