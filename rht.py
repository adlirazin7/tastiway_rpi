import sqlite3
import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime, timezone
from collections import defaultdict

cred = credentials.Certificate("./service_account-cp4.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

DB_PATH = "/home/pi/Project/tastiway.db"
COLLECTION_NAME = "tastiway_sensors"

def read_unuploaded():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.execute("""
        SELECT id, doc, timestamp, rh, temp
        FROM rht
        WHERE upload = 0
        ORDER BY timestamp ASC
        LIMIT 144
    """)
    rows = cur.fetchall()

    conn.close()
    return rows

def mark_uploaded_many(ids):
    if not ids:
        return
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute(
        f"UPDATE rht SET upload = 1 WHERE id IN ({','.join(['?']*len(ids))})",
        ids
    )
    conn.commit()
    conn.close()

def prepare_entries(rows):
    grouped = defaultdict(list)
    row_ids = defaultdict(list)
    timestamps = defaultdict(list)

    for row_id, doc, ts_ms, rh, temp in rows:

        ts = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)

        entry = {
            "timestamp": ts,
            "rh": rh,
            "temp": temp,
        }

        grouped[doc].append(entry)
        row_ids[doc].append(row_id)
        timestamps[doc].append(ts)

    return grouped, row_ids, timestamps


def upload_grouped_to_firestore(grouped, timestamps):
    with open("rht_id.txt", "r") as f:
        ID = f.read()
        print(ID)

    for doc_id, entries in grouped.items():
        # doc_ref = db.collection(COLLECTION_NAME).document(f'{doc_id}-{ID}')
        doc_ref = db.collection(COLLECTION_NAME).document(doc_id)

        # pick latest timestamp for top-level field
        latest_ts = max(timestamps[doc_id])

        try:
            doc_ref.update({
                "data": firestore.ArrayUnion(entries),
                "timestamp": latest_ts
            })
            print(f"Updated {doc_id} with {len(entries)} entries")

        except Exception as e:
            msg = str(e)
            print(e)
            if "404" in msg and "No document" in msg:
                doc_ref.set({
                    "data": entries,
                    "timestamp": latest_ts,
                    "id" : ID
                })
                print(f"Created new doc {doc_id} with {len(entries)} entries")
            else:
                print(f"Error updating {doc_id}: {e}")
                # do NOT set doc for any other unexpected error
                continue


def main():
    rows = read_unuploaded()

    if not rows:
        print("No pending records.")
        return

    grouped, row_ids, timestamps = prepare_entries(rows)
    upload_grouped_to_firestore(grouped, timestamps)

    # mark everything uploaded
    all_ids = [rid for sub in row_ids.values() for rid in sub]
    mark_uploaded_many(all_ids)

    print("Done (batched).")


if __name__ == "__main__":
    main()