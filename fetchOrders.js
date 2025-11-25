import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import serviceAccount from "./service_account-cp4.json" with { type: "json" };
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import fs from "fs";

// retrieve the custom machine Id 
const machineId = fs.readFileSync('/etc/machine_id_custom', 'utf8').trim();
// Initialize the firestore sdk
initializeApp({ credential: cert(serviceAccount) });
const dbFirestore = getFirestore();

const dbPath = "/home/pi/Project/tastiway.db";

const db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
});


const now = new Date();
const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const start = addDays(dayStart(now), -1);
const end = addDays(dayStart(now), 2);

try {
    // Fetch data from firestore 
    let snap;
    try {
        snap = await dbFirestore
            .collection("tastiway_plans")
            .where("machineId", "==", machineId)
            .where("status", "==", "pending")
            .where("start", ">=", Timestamp.fromDate(start))
            .where("start", "<", Timestamp.fromDate(end))
            .limit(100)
            .get();
    } catch (firestoreErr) {
        throw new Error(`🔥 Firestore fetch failed: ${firestoreErr.message}`);
    }

    if (snap.empty) {
        console.log("No data found in production plans");
        process.exit(0);
    }

    // delete all the orders - more simple -- the user could update the order when status === 'pending'
    try {
        await db.run("DELETE FROM tastiway_plans");
        await db.run("DELETE FROM sqlite_sequence WHERE name='tastiway_plans'"); // reset the id 
    } catch (sqliteErr) {
        throw new Error(`💾 SQLite delete/reset failed: ${sqliteErr.message}`);
    }
    // insert into sqlite 
    let insertedCount = 0;
    try {
        for (const doc of snap.docs) {
            const data = doc.data();
            await db.run(
                `INSERT INTO tastiway_plans
          (start, end, orderId, productName, quantity)
         VALUES (?, ?, ?, ?, ?)`,
                [
                    data.start?.toDate().toISOString() ?? null,
                    data.end?.toDate().toISOString() ?? null,
                    data.orderId ?? null,
                    data.productName ?? null,
                    data.quantity ?? null,
                ]
            );
            insertedCount++;
        }
    } catch (sqliteInsertErr) {
        throw new Error(`💾 SQLite insert failed: ${sqliteInsertErr.message}`);
    }

    console.log("✅ Refreshed Firestore → SQLite successfully");
    console.log(
        JSON.stringify({
            status: "success",
            count: insertedCount,
        })
    );

} catch (err) {
    console.error("❌ Error during sync:", err.message);
} finally {
    await db.close();
}
