
import sqlite3

# Connect to the database


def create_or_update_logs_db(db):
    db.execute("""
        CREATE TABLE IF NOT EXISTS logs (
            type TEXT,
            session_id TEXT,
            ip_address TEXT,
            message TEXT,
            response TEXT,
            error TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    db.commit()


def get_logs_from_db(db):
    logs_ = db.execute(
        "SELECT * FROM logs").fetchall()
    logs = []
    for log in logs_:
        logs.append(log)
    return logs


def update_logs_in_db(db, dict):
    db.execute("""
         INSERT INTO logs (type, session_id, ip_address, message, response, error)
         VALUES (?, ?, ?, ?, ?, ?)
      """, (dict["type"], dict['session_id'], dict['ip'], dict['message'], dict['response'], dict['error']))
    db.commit()
