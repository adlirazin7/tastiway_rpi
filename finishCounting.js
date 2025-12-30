import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import serviceAccount from "./service_account-cp4.json" with { type: "json" };
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import fs from "fs";


// retrieve the custom machine Id 
const machineId = fs.readFileSync('/etc/machine_id_custom', 'utf8').trim();
// retrieve the argument passed
const combined = process.argv[2];
console.log("combined:", combined)
const [orderId, reject] = combined.split(",-,");
const nowMillis = Date.now();
let msg = "Start Finish Operations";

if (!orderId) {
    console.error("❌ Missing orderId argument!");
    process.exit(1);
}


// set the uom
const machineUom = {
    TMM001: "kg",
    ZPL001: "PACK",
    ZTP001: "PACK",
    SMW001: "kg",
    BPM001: "Bag",
    TEST001: "PACK",

}


let db;
let dbFirestore;
let currentRow
let duration;

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




    //* update sqlite -- table tastiway-process
    try {
        const currentRows = await db.all(`SELECT * FROM current LIMIT 1;`);
        currentRow = currentRows[0]
        if (orderId === currentRow['orderId']) {
            await db.run(
                `UPDATE tastiway_process
                SET stop = ?, counts = ?, reject = ?
                WHERE orderId = ?`,
                [nowMillis, currentRow['counts'], reject, orderId]
            );
        } else {
            console.log("❌ orderId inside current and in the flow are different !!!")
        }
        // clear the current table
        await db.run("DELETE FROM current;");
        console.log("✅ Sqlite - update finish at tastiway_process");
    } catch (err) {
        throw new Error(`❌ 'tastiway_process' table handling failed: ${err.message}`);
    }



    //* Sqlilte -- add the last data to table log -- make sure to clear the orderId first to prevent from race condition with the log updater
    try {
        // retrieve latest duration 
        const latestRow = await db.all(`SELECT duration, timestamp from log WHERE orderId=? ORDER BY id DESC LIMIT 1`, [currentRow["orderId"]]);
        if (latestRow.length === 0) {
            duration = 0
        } else {
            duration = latestRow[0]["duration"] + (nowMillis - latestRow[0]["timestamp"]) // in millisecond
        }
        await db.run(
            `INSERT INTO log (orderId, count, andon, timestamp, duration) VALUES (?,?,?,?,?)`, [currentRow["orderId"], currentRow["counts"], currentRow["andon"], nowMillis, duration]
        );
        console.log("✅ Sqlite - add last log data ");
    } catch (err) {
        throw new Error(`❌ Update 'log' table failed: ${err.message}`);
    }



    //* Firestore -- update status
    try {
        await dbFirestore
            .collection("tastiway_plans")
            .doc(orderId)
            .update(
                {
                    status: "completed",
                    updatedAt: new Date(),
                },
            );
        console.log("✅ Firestore - update status at plan");
    } catch (err) {
        console.log(`⚠️ Firestore update status failed (manual will fail): ${err.message}`);
    }


    //* Firestore -- update ANDON signal system
    try {
        await dbFirestore
            .collection("tastiway_machines")
            .doc(machineId)
            .set(
                {
                    status: "yellow",
                    lastSeen: new Date(),
                    count: null,
                    expectedQuantity: null,
                    productName: null,
                },
                { merge: true }
            );
        console.log("✅ Firestore - update machines");
    } catch (err) {
        console.log(`❌ Firestore update Andon status failed: ${err.message}`);
    }

    //* Firestore -- update finish info into collection report
    try {

        await dbFirestore
            .collection("tastiway_reports")
            .doc(orderId)
            .update(
                {
                    stop: Timestamp.fromMillis(nowMillis),
                    finalCount: currentRow["counts"],
                    reject: currentRow["counts"] - reject,
                    uom: machineUom[machineId],
                },
            )
        // once added into 'report', modify the updated
        await db.run(
            `UPDATE tastiway_process
        SET uploaded = 1
        WHERE orderId = ?`,
            [orderId]
        );
        console.log("✅ Firestore - update report");

    } catch (err) {
        console.log(`❌ Firestore add into record failed: ${err.message} for ${orderId}`);
    }

    console.log(
        JSON.stringify({
            status: "success",
            orderId,
        })
    );

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
