import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import serviceAccount from "./service_account-cp4.json" with { type: "json" };
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import fs from "fs";

// retrieve the custom machine Id 
const machineId = fs.readFileSync('/etc/machine_id_custom', 'utf8').trim();

let db;
let dbFirestore;
let currentRow;

try {
    // firebase init
    try {
        initializeApp({ credential: cert(serviceAccount) });
        dbFirestore = getFirestore();
    } catch (err) {
        throw new Error(`❌ Firestore initialization failed: ${err.message}`);
    }

    // Sqlite init
    const dbPath = "/home/pi/Project/tastiway.db";
    try {
        db = await open({
            filename: dbPath,
            driver: sqlite3.Database,
        });
    } catch (err) {
        throw new Error(`❌  SQLite open failed: ${err.message}`);
    }

    // retrive sqlite -- table current
    try {
        currentRow = await db.all(`SELECT * FROM current LIMIT 1;`);
    } catch (err) {
        throw new Error(`❌ Retrieve 'current' table failed: ${err.message}`);
    }

    // Firestore -- update ANDON signal system
    if (currentRow.length === 0) {
        try {
            await dbFirestore
                .collection("tastiway_machines")
                .doc(machineId)
                .set(
                    {
                        status: "yellow",
                        lastSeen: new Date(),
                    },
                    { merge: true }
                );
        } catch (err) {
            throw new Error(`❌ Firestore update Andon status failed: ${err.message}`);
        }
    } else {
        try {
            await dbFirestore
                .collection("tastiway_machines")
                .doc(machineId)
                .set(
                    {
                        status: "green",
                        lastSeen: new Date(),
                    },
                    { merge: true }
                );
        } catch (err) {
            throw new Error(`❌ Firestore update Andon status failed: ${err.message}`);
        }
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
