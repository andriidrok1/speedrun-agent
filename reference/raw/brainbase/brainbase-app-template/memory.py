from langchain.schema import (
    AIMessage,
    HumanMessage,
    SystemMessage
)

import sqlite3

# Connect to the database
def create_or_update_db(db):
    db.execute("""
        CREATE TABLE IF NOT EXISTS chat_history (
            session_id TEXT,
            type TEXT,
            msg TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    db.commit()


def get_history_from_db(db, session_id):

    if session_id is None:
         return []
    
    #  create_or_update_db()

    history_ = db.execute(
        "SELECT * FROM chat_history WHERE session_id = ?", (session_id,)).fetchall()

    history = []

    for msg in history_:
        if msg[1] == "human":
            history.append(HumanMessage(content=msg[2]))
        elif msg[1] == "ai":
            history.append(AIMessage(content=msg[2]))

    return history


def update_history_in_db(db, session_id, msg, msg_type):

    #  create_or_update_db()

    db.execute("""
           INSERT INTO chat_history (session_id, type, msg)
           VALUES (?, ?, ?)
        """, (session_id, msg_type, msg))

    db.commit()
