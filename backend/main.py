import os
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from datetime import datetime, date
from dotenv import load_dotenv

FRONTEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(Path(__file__).parent / ".env")

app = FastAPI(title="Habit Tracker")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# MongoDB
MONGO_URI = os.getenv("MONGO_URI")
if not MONGO_URI:
    raise RuntimeError("MONGO_URI not set in .env")

db = AsyncIOMotorClient(MONGO_URI)["habit_tracker"]
persons = db["persons"]
activities = db["activities"]


# Request models
class PersonIn(BaseModel):
    person_id: str = Field(..., pattern=r"^\d{5}$")

class ActivityIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)


def doc_to_dict(doc):
    """Turn a Mongo doc into a JSON-safe dict."""
    doc["_id"] = str(doc["_id"])
    return doc


# --- Login / register person ---
@app.post("/api/person")
async def login(body: PersonIn):
    existing = await persons.find_one({"person_id": body.person_id})
    if existing:
        return {"status": "existing", "person": doc_to_dict(existing)}
    doc = {"person_id": body.person_id, "created_at": datetime.utcnow()}
    result = await persons.insert_one(doc)
    doc["_id"] = result.inserted_id
    return {"status": "created", "person": doc_to_dict(doc)}


# --- List activities ---
@app.get("/api/person/{pid}/activities")
async def list_activities(pid: str):
    docs = []
    async for doc in activities.find({"person_id": pid}):
        docs.append(doc_to_dict(doc))
    return {"activities": docs}


# --- Add activity ---
@app.post("/api/person/{pid}/activities")
async def add_activity(pid: str, body: ActivityIn):
    person = await persons.find_one({"person_id": pid})
    if not person:
        raise HTTPException(404, "Person not found")
    doc = {"person_id": pid, "name": body.name, "completions": []}
    result = await activities.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return {"activity": doc}


# --- Mark done (one-way, no undo) ---
@app.post("/api/person/{pid}/activities/{act_id}/done")
async def mark_done(pid: str, act_id: str):
    today_str = date.today().isoformat()
    result = await activities.update_one(
        {"_id": ObjectId(act_id), "person_id": pid},
        {"$addToSet": {"completions": today_str}},
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Activity not found")
    updated = await activities.find_one({"_id": ObjectId(act_id)})
    return {"activity": doc_to_dict(updated)}


# --- Delete activity ---
@app.delete("/api/person/{pid}/activities/{act_id}")
async def delete_activity(pid: str, act_id: str):
    result = await activities.delete_one({"_id": ObjectId(act_id), "person_id": pid})
    if result.deleted_count == 0:
        raise HTTPException(404, "Activity not found")
    return {"deleted": True}


# --- Serve frontend ---
@app.get("/")
async def index():
    return FileResponse(FRONTEND_DIR / "index.html")

app.mount("/", StaticFiles(directory=str(FRONTEND_DIR)), name="static")
