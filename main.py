"""EduStimul backend: accounts, saved data, coins and a public student chat.
One FastAPI service that also serves the front-end from ./static."""
import asyncio, json, os, re, secrets, time
from datetime import datetime, timedelta, timezone

import bcrypt, jwt
from fastapi import Depends, FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, create_engine, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

DB = os.getenv("DATABASE_URL", "sqlite:///./edustimul.db")
for old in ("postgres://", "postgresql://"):
    if DB.startswith(old):
        DB = DB.replace(old, "postgresql+psycopg2://", 1)
SECRET = os.getenv("SECRET_KEY") or secrets.token_hex(32)  # set SECRET_KEY in production
engine = create_engine(DB, pool_pre_ping=True,
                       connect_args={"check_same_thread": False} if DB.startswith("sqlite") else {})
Session = sessionmaker(engine, expire_on_commit=False)
now_utc = lambda: datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    pw_hash: Mapped[str] = mapped_column(String(100))
    coins: Mapped[int] = mapped_column(Integer, default=0)
    state: Mapped[str] = mapped_column(Text, default="{}")
    created: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class Reward(Base):
    __tablename__ = "rewards"
    __table_args__ = (UniqueConstraint("user_id", "key"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    key: Mapped[str] = mapped_column(String(120))
    amount: Mapped[int] = mapped_column(Integer)
    day: Mapped[str] = mapped_column(String(10))


class Message(Base):
    __tablename__ = "messages"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    username: Mapped[str] = mapped_column(String(20))
    text: Mapped[str] = mapped_column(String(300))
    created: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


Base.metadata.create_all(engine)
app = FastAPI(title="EduStimul")


# ---------- auth ----------
class Creds(BaseModel):
    username: str
    password: str


def make_token(uid: int) -> str:
    return jwt.encode({"sub": str(uid), "exp": now_utc() + timedelta(days=30)}, SECRET, algorithm="HS256")


def auth_token(token: str):
    try:
        uid = int(jwt.decode(token, SECRET, algorithms=["HS256"])["sub"])
    except Exception:
        return None
    with Session() as db:
        return db.get(User, uid)


def current_user(authorization: str = Header(default="")):
    u = auth_token(authorization.removeprefix("Bearer ").strip())
    if not u:
        raise HTTPException(401, "Please log in again")
    return u


attempts: dict[str, list[float]] = {}


def throttle(name: str):
    t = time.time()
    recent = [x for x in attempts.get(name, []) if t - x < 300]
    if len(recent) >= 10:
        raise HTTPException(429, "Too many attempts. Try again in a few minutes.")
    attempts[name] = recent + [t]


@app.post("/api/register")
def register(c: Creds):
    name = c.username.strip().lower()
    if not re.fullmatch(r"[a-z0-9_]{3,20}", name):
        raise HTTPException(400, "Username: 3-20 letters, numbers or _")
    if not 8 <= len(c.password.encode()) <= 72:
        raise HTTPException(400, "Password: 8-72 characters")
    pw = bcrypt.hashpw(c.password.encode(), bcrypt.gensalt()).decode()
    with Session() as db:
        u = User(username=name, pw_hash=pw)
        db.add(u)
        try:
            db.commit()
        except IntegrityError:
            raise HTTPException(409, "That username is taken")
        return {"token": make_token(u.id)}


@app.post("/api/login")
def login(c: Creds):
    name = c.username.strip().lower()
    throttle(name)
    with Session() as db:
        u = db.scalar(select(User).where(User.username == name))
    if not u or not bcrypt.checkpw(c.password.encode()[:72], u.pw_hash.encode()):
        raise HTTPException(401, "Wrong username or password")
    return {"token": make_token(u.id)}


# ---------- saved data ----------
class StateIn(BaseModel):
    state: dict


@app.get("/api/me")
def me(u: User = Depends(current_user)):
    return {"username": u.username, "coins": u.coins, "state": json.loads(u.state or "{}")}


@app.put("/api/state")
def put_state(body: StateIn, u: User = Depends(current_user)):
    raw = json.dumps(body.state)
    if len(raw) > 300_000:
        raise HTTPException(413, "Too much data")
    with Session() as db:
        db.get(User, u.id).state = raw
        db.commit()
    return {"ok": True}


# ---------- coins ----------
REWARDS = {"task": 10, "focus": 5}
DAILY_CAP = 15  # rewarded actions per user per day


class RewardIn(BaseModel):
    kind: str
    key: str


@app.post("/api/reward")
def reward(b: RewardIn, u: User = Depends(current_user)):
    amount = REWARDS.get(b.kind)
    if not amount:
        raise HTTPException(400, "Unknown reward")
    day = now_utc().strftime("%Y-%m-%d")
    with Session() as db:
        n = db.scalar(select(func.count()).select_from(Reward).where(Reward.user_id == u.id, Reward.day == day))
        if n >= DAILY_CAP:
            return {"awarded": 0, "coins": db.get(User, u.id).coins, "reason": "daily limit"}
        db.add(Reward(user_id=u.id, key=f"{b.kind}:{b.key}"[:120], amount=amount, day=day))
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            return {"awarded": 0, "coins": db.get(User, u.id).coins, "reason": "already rewarded"}
        user = db.get(User, u.id)
        user.coins += amount
        db.commit()
        return {"awarded": amount, "coins": user.coins}


# ---------- chat ----------
class Hub:
    def __init__(self):
        self.conns: set[WebSocket] = set()

    async def broadcast(self, data: dict):
        for ws in list(self.conns):
            try:
                await ws.send_json(data)
            except Exception:
                self.conns.discard(ws)


hub = Hub()


def load_history():
    with Session() as db:
        rows = db.scalars(select(Message).order_by(Message.id.desc()).limit(50)).all()
    return [{"id": m.id, "user": m.username, "text": m.text} for m in reversed(rows)]


def save_msg(uid: int, name: str, text: str):
    with Session() as db:
        m = Message(user_id=uid, username=name, text=text)
        db.add(m)
        db.commit()
        return {"id": m.id, "user": name, "text": text}


@app.websocket("/ws")
async def chat(ws: WebSocket, token: str = ""):
    user = await asyncio.to_thread(auth_token, token)
    if not user:
        await ws.close(code=4401)
        return
    await ws.accept()
    hub.conns.add(ws)
    await ws.send_json({"type": "history", "items": await asyncio.to_thread(load_history)})
    last = 0.0
    try:
        while True:
            raw = await ws.receive_text()
            try:
                text = str(json.loads(raw).get("text", "")).strip()[:300]
            except Exception:
                continue
            t = time.monotonic()
            if not text or t - last < 1:  # one message per second
                continue
            last = t
            msg = await asyncio.to_thread(save_msg, user.id, user.username, text)
            await hub.broadcast({"type": "msg", **msg})
    except WebSocketDisconnect:
        pass
    finally:
        hub.conns.discard(ws)


@app.get("/api/health")
def health():
    return {"ok": True}


app.mount("/", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "static"), html=True), name="static")
