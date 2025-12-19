import sqlite3 from "sqlite3";
import { open } from "sqlite";

let db;

try {
    // Sqlite init
    db = await open({
        filename: "/home/pi/Project/tastiway.db",
        driver: sqlite3.Database,
    });

    // Retrieve current row
    const currentRows = await db.all(`SELECT * FROM current LIMIT 1;`);
    if (currentRows.length === 1) {
        const currentRow = currentRows[0];

        // Retrieve process by orderId
        const processRows = await db.all(
            `SELECT * FROM tastiway_process WHERE orderId = ?`,
            [currentRow.orderId]
        );
        console.log(JSON.stringify({
            type: "resumeProcess",
            payload: processRows[0]
        }));
    } else {
        console.log(JSON.stringify({
            type: "resumeProcess",
            payload: null
        }));
    }


} catch (err) {
    console.error("❌ Error:", err.message);
    console.error(err.stack);
} finally {
    if (db) {
        try {
            await db.close();
        } catch (err) {
            console.error("⚠️ Failed to close SQLite DB:", err.message);
        }
    }
}
