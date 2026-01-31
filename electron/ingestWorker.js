
const { parentPort } = require('worker_threads');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const readline = require('readline');

// Stream-based CSV Parser for Worker Isolation
const parseCSVFileStream = (filePath) => {
    return new Promise((resolve, reject) => {
        const data = [];
        const fileStream = fs.createReadStream(filePath);
        
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        rl.on('line', (line) => {
            if (!line || !line.trim() || !/^\d/.test(line.trim())) return;

            const delimiter = line.indexOf(';') > -1 ? ';' : ',';
            const parts = line.split(delimiter);

            if (parts.length < 5) return;

            try {
                let dateStr = '';
                let timestamp = 0;
                let open = 0, high = 0, low = 0, close = 0, volume = 0;

                const p0 = parts[0].trim();
                const p1 = parts[1].trim();

                const isDateColumn = /^\d{8}$/.test(p0) || /^\d{4}[\.\-\/]\d{2}[\.\-\/]\d{2}$/.test(p0);
                const isTimeColumn = p1.includes(':');

                if (isDateColumn && isTimeColumn) {
                    let cleanDate = p0.replace(/[\.\-\/]/g, '');
                    if (cleanDate.length === 8) {
                        cleanDate = `${cleanDate.substring(0,4)}-${cleanDate.substring(4,6)}-${cleanDate.substring(6,8)}`;
                    }
                    dateStr = `${cleanDate}T${p1}`;
                    
                    open = parseFloat(parts[2]);
                    high = parseFloat(parts[3]);
                    low = parseFloat(parts[4]);
                    close = parseFloat(parts[5]);
                    if (parts.length > 6) {
                        const v = parseFloat(parts[6]);
                        volume = isNaN(v) ? 0 : v;
                    }
                } else {
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

                if (isNaN(open) || isNaN(close)) return;

                timestamp = new Date(dateStr).getTime();
                if (isNaN(timestamp)) {
                    timestamp = parseFloat(dateStr);
                    if (!isNaN(timestamp) && timestamp < 10000000000) timestamp *= 1000;
                }

                if (isNaN(timestamp) || timestamp <= 0) return;

                data.push({ time: timestamp, open, high, low, close, volume });
            } catch (e) {
                // skip malformed line
            }
        });

        rl.on('close', () => {
            // Sort in-memory before insert (necessary for ordered time)
            data.sort((a, b) => a.time - b.time);
            resolve(data);
        });

        rl.on('error', (err) => {
            reject(err);
        });
    });
};

parentPort.on('message', async (task) => {
    const { dbPath, filePath, symbol, timeframe } = task;
    
    // Connect to DB
    const db = new sqlite3.Database(dbPath);
    
    try {
        // 1. Parse File Stream
        const rawData = await parseCSVFileStream(filePath);
        
        db.serialize(() => {
            // Optimization for bulk inserts & Concurrency
            db.run("PRAGMA synchronous = OFF;");
            db.run("PRAGMA journal_mode = WAL;");

            if (rawData.length === 0) {
                db.close();
                parentPort.postMessage({ success: true, count: 0 });
                return;
            }

            // 2. Batch Insert with Transaction Chunking
            const CHUNK_SIZE = 2000;
            let processed = 0;
            
            db.run("BEGIN TRANSACTION");
            const stmt = db.prepare("INSERT OR IGNORE INTO ohlc_cache (symbol, timeframe, time, open, high, low, close, volume) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
            
            try {
                rawData.forEach((r) => {
                    stmt.run(symbol, timeframe, r.time, r.open, r.high, r.low, r.close, r.volume);
                    processed++;
                    
                    // Commit every 2000 rows to prevent DB lock contention
                    if (processed % CHUNK_SIZE === 0) {
                        db.run("COMMIT");
                        db.run("BEGIN TRANSACTION");
                    }
                });
                
                db.run("COMMIT");
                stmt.finalize();
                
                db.close((err) => {
                    if (err) parentPort.postMessage({ success: false, error: err.message });
                    else parentPort.postMessage({ success: true, count: processed });
                });
            } catch (err) {
                // Rollback on catastrophe
                db.run("ROLLBACK");
                db.close();
                parentPort.postMessage({ success: false, error: err.message });
            }
        });
    } catch (parseErr) {
        db.close();
        parentPort.postMessage({ success: false, error: parseErr.message });
    }
});
