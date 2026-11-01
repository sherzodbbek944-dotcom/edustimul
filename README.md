# EduStimul (full-stack version)

FastAPI + PostgreSQL backend that also serves the front-end in `static/`.

Features: accounts (username + password), data saved per student, coins for finished daily tasks and focus sessions, one public student chat.

## Run locally

```
python -m venv .venv
.venv\Scripts\activate        (Windows)   |   source .venv/bin/activate   (Mac/Linux)
pip install -r requirements.txt
uvicorn main:app --reload
```
Open http://127.0.0.1:8000. Locally it uses a SQLite file; on Render it uses PostgreSQL.

## Deploy on Render

1. Push this folder to a GitHub repository (`main.py`, `requirements.txt`, `render.yaml`, `static/` at the top level).
2. In Render: New, then Blueprint, pick the repository. `render.yaml` creates the web service and the database and connects them.
3. Wait for the build. Open the `.onrender.com` link, create an account.

## How coins work

- +10 for ticking a daily-plan task, +5 for a finished focus session.
- Each task can be rewarded once, and each account can earn from at most 15 actions per day.
- The server enforces this, but it cannot verify that a task was really done. Coins are motivation, not proof.

## Known limits

- No password reset (no email is collected). Keep your password safe.
- Chat is one public room with a 300-character limit and one message per second. It has no moderation tools yet.
- The chat runs in one server process, which is fine for the free plan.
