"""Direct-to-Postgres migration runner.

Usage: python scripts/apply-migration.py <schema.sql> [more.sql ...]
Reads DATABASE_URL from .env.local (the database password never lives anywhere else).
Executes the whole file as one statement — the SQL files are idempotent by design,
so re-running any migration is always safe.
"""

import re
import sys
from pathlib import Path

import psycopg2

ROOT = Path(__file__).resolve().parent.parent


def load_db_url() -> str:
    for line in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines():
        m = re.match(r"^DATABASE_URL=(\S+)\s*$", line)
        if m:
            return m.group(1)
    sys.exit("DATABASE_URL not set in .env.local")


def apply(sql_path: str) -> None:
    sql_file = Path(sql_path)
    if not sql_file.is_absolute():
        sql_file = ROOT / sql_path
    sql = sql_file.read_text(encoding="utf-8")
    conn = psycopg2.connect(load_db_url(), connect_timeout=20)
    try:
        cur = conn.cursor()
        cur.execute(sql)
        fetched = cur.fetchall() if cur.description else []
        conn.commit()
        print(f"{sql_file.name}: APPLIED, statements returned {len(fetched)} notices")
        for notice in conn.notices[-4:]:
            print("  ", notice.strip()[:160])
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    for path in sys.argv[1:]:
        apply(path)