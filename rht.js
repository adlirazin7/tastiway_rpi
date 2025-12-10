import fs from "fs/promises";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

import serviceAccount from "./service_account-cp4.json" with { type: "json" };

initializeApp({
  credential: cert(serviceAccount),
});

const dbFirestore = getFirestore();

const DB_PATH = "/home/pi/Project/tastiway.db";
const COLLECTION_NAME = "tastiway_sensors";

async function readUnuploaded() {
  const db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database,
  });

  const rows = await db.all(`
    SELECT id, doc, timestamp, rh, temp
    FROM rht
    WHERE upload = 0
    ORDER BY timestamp ASC
    LIMIT 144
  `);

  await db.close();
  return rows;
}

async function markUploadedMany(ids) {
  if (!ids || ids.length === 0) return;

  const db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database,
  });

  const placeholders = ids.map(() => "?").join(",");

  await db.run(
    `UPDATE rht SET upload = 1 WHERE id IN (${placeholders})`,
    ids
  );

  await db.close();
}

function prepareEntries(rows) {
  const grouped = {};
  const rowIds = {};
  const timestamps = {};

  for (const row of rows) {
    const { id, doc, timestamp, rh, temp } = row;

    const ts = Timestamp.fromMillis(Number(timestamp));

    const entry = {
      timestamp: ts,
      rh,
      temp,
    };

    if (!grouped[doc]) {
      grouped[doc] = [];
      rowIds[doc] = [];
      timestamps[doc] = [];
    }

    grouped[doc].push(entry);
    rowIds[doc].push(id);
    timestamps[doc].push(ts);
  }

  return { grouped, rowIds, timestamps };
}

async function uploadGroupedToFirestore(grouped, timestamps) {
    const idPath = new URL("./rht_id.txt", import.meta.url);
    const ID = await fs.readFile(idPath, "utf8");

  for (const docId of Object.keys(grouped)) {
    const entries = grouped[docId];
    const latestTs = timestamps[docId].reduce((a, b) =>
      a.toMillis() > b.toMillis() ? a : b
    );

    const docRef = dbFirestore.collection(COLLECTION_NAME).doc(docId);

    try {
      await docRef.update({
        data: FieldValue.arrayUnion(...entries),
        timestamp: latestTs,
      });

      console.log(`Updated ${docId} with ${entries.length} entries`);
    } catch (err) {
      const msg = String(err);

      console.log(err);

      if (msg.includes("No document to update")) {
        // Create new document
        await docRef.set({
          data: entries,
          timestamp: latestTs,
          id: ID,
        });

        console.log(`Created new doc ${docId} with ${entries.length} entries`);
      } else {
        console.log(`Error updating ${docId}:`, err);
        continue;
      }
    }
  }
}

async function rht() {
  const rows = await readUnuploaded();

  if (!rows || rows.length === 0) {
    console.log("No pending records.");
    return;
  }

  const { grouped, rowIds, timestamps } = prepareEntries(rows);
  await uploadGroupedToFirestore(grouped, timestamps);

  const allIds = Object.values(rowIds).flat();
  await markUploadedMany(allIds);

  console.log("Done (batched).");
}

rht();
