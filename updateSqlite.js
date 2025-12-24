import sqlite3 from "sqlite3";
import { open } from "sqlite";

let db;

try {
    const dbPath = "/home/pi/Project/tastiway.db";

    db = await open({
        filename: dbPath,
        driver: sqlite3.Database,
    });
    // add the coloumn that want to be updated
    const tables = [
        {
            name: "current",
            columns: [
                { name: "start", sql: "ALTER TABLE current ADD COLUMN start INTEGER;" },
                { name: "andon", sql: "ALTER TABLE current ADD COLUMN andon TEXT NOT NULL DEFAULT '';" },
                { name: "pic", sql: "ALTER TABLE current ADD COLUMN pic TEXT NOT NULL DEFAULT '';" },
            ],
        },
        {
            name: "tastiway_plans",
            columns: [
                { name: "batchId", sql: "ALTER TABLE tastiway_plans ADD COLUMN batchId TEXT NOT NULL DEFAULT '';" },
            ],
        },
        {
            name: "tastiway_process",
            columns: [
                { name: "reject", sql: "ALTER TABLE tastiway_process ADD COLUMN reject INTEGER DEFAULT 0;" },
                { name: "pic", sql: "ALTER TABLE tastiway_process ADD COLUMN pic TEXT NOT NULL DEFAULT '';" },
                { name: "batchId", sql: "ALTER TABLE tastiway_process ADD COLUMN batchId TEXT;" },
                { name: "uploadedStart", sql: "ALTER TABLE tastiway_process ADD COLUMN uploadedStart INTEGER DEFAULT 0;" },
                { name: "productName", sql: "ALTER TABLE tastiway_process ADD COLUMN productName TEXT NOT NULL DEFAULT '';" },
                { name: "expectedQuantity", sql: "ALTER TABLE tastiway_process ADD COLUMN expectedQuantity INTEGER DEFAULT 0;" },
                { name: "expectedStart", sql: "ALTER TABLE tastiway_process ADD COLUMN expectedStart INTEGER DEFAULT '';" },
                { name: "expectedEnd", sql: "ALTER TABLE tastiway_process ADD COLUMN expectedEnd INTEGER DEFAULT '';" },
            ],
        },
        {
            name: "log",
            columns: [
                { name: "uploaded", sql: "ALTER TABLE log ADD COLUMN uploaded INTEGER DEFAULT 0;" },
                { name: "duration", sql: "ALTER TABLE log ADD COLUMN duration INTEGER DEFAULT 0;" },
            ],
        },
    ];

    for (const table of tables) {
        const existingCols = await db.all(`PRAGMA table_info(${table.name});`);
        const colNames = existingCols.map(c => c.name);

        for (const col of table.columns) {
            if (!colNames.includes(col.name)) {
                await db.exec(col.sql);
                console.log(`✅ Added ${table.name}.${col.name}`);
            } else {
                console.log(`ℹ️ Exists ${table.name}.${col.name}`);
            }
        }
    }

} catch (err) {
    console.error("❌ Error:", err.message);
} finally {
    if (db) await db.close();
}
