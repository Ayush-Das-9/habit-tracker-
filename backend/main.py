from pathlib import Path
import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, field_validator
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from datetime import datetime, date
from dotenv import load_dotenv

FRONTEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(Path(__file__).parent / ".env")

# ── App setup ──────────────────────────────────────────
app = FastAPI(title="Habit Tracker API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── MongoDB connection ─────────────────────────────────
MONGO_URI = os.getenv("MONGO_URI")
if not MONGO_URI:
    raise RuntimeError("MONGO_URI environment variable is required")

client = AsyncIOMotorClient(MONGO_URI)
db = client["habit_tracker"]
persons_col = db["persons"]
activities_col = db["activities"]


# ── Models ─────────────────────────────────────────────
class PersonIn(BaseModel):
    person_id: str = Field(..., pattern=r"^\d{5}$")


class ActivityIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)


class ActivityUpdate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)


# ── Helper ─────────────────────────────────────────────
def serialize_doc(doc):
    """Convert MongoDB document to JSON-safe dict."""
    doc["_id"] = str(doc["_id"])
    return doc


async def get_person_or_404(person_id: str):
    person = await persons_col.find_one({"person_id": person_id})
    if not person:
        raise HTTPException(404, "Person not found")
    return person


# ── Endpoints ──────────────────────────────────────────

# --- Person ---
@app.post("/api/person")
async def create_or_get_person(body: PersonIn):
    """Create person if not exists, or return existing."""
    existing = await persons_col.find_one({"person_id": body.person_id})
    if existing:
        return {"status": "existing", "person": serialize_doc(existing)}

    doc = {"person_id": body.person_id, "created_at": datetime.utcnow()}
    result = await persons_col.insert_one(doc)
    doc["_id"] = result.inserted_id
    return {"status": "created", "person": serialize_doc(doc)}


# --- Activities CRUD ---
@app.get("/api/person/{person_id}/activities")
async def list_activities(person_id: str):
    await get_person_or_404(person_id)
    cursor = activities_col.find({"person_id": person_id})
    activities = []
    async for doc in cursor:
        activities.append(serialize_doc(doc))
    return {"activities": activities}


@app.post("/api/person/{person_id}/activities")
async def add_activity(person_id: str, body: ActivityIn):
    await get_person_or_404(person_id)
    doc = {
        "person_id": person_id,
        "name": body.name,
        "completions": [],  # list of date strings "YYYY-MM-DD"
    }
    result = await activities_col.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return {"activity": doc}


@app.put("/api/person/{person_id}/activities/{activity_id}")
async def update_activity(person_id: str, activity_id: str, body: ActivityUpdate):
    await get_person_or_404(person_id)
    result = await activities_col.update_one(
        {"_id": ObjectId(activity_id), "person_id": person_id},
        {"$set": {"name": body.name}},
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Activity not found")
    updated = await activities_col.find_one({"_id": ObjectId(activity_id)})
    return {"activity": serialize_doc(updated)}


@app.delete("/api/person/{person_id}/activities/{activity_id}")
async def delete_activity(person_id: str, activity_id: str):
    await get_person_or_404(person_id)
    result = await activities_col.delete_one(
        {"_id": ObjectId(activity_id), "person_id": person_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(404, "Activity not found")
    return {"deleted": True}


@app.post("/api/person/{person_id}/activities/{activity_id}/toggle")
async def toggle_activity(person_id: str, activity_id: str):
    """Toggle today's completion for an activity."""
    await get_person_or_404(person_id)
    today_str = date.today().isoformat()  # "YYYY-MM-DD"

    activity = await activities_col.find_one(
        {"_id": ObjectId(activity_id), "person_id": person_id}
    )
    if not activity:
        raise HTTPException(404, "Activity not found")

    completions = activity.get("completions", [])
    if today_str in completions:
        # Remove (undo)
        await activities_col.update_one(
            {"_id": ObjectId(activity_id)},
            {"$pull": {"completions": today_str}},
        )
        done = False
    else:
        # Add (complete)
        await activities_col.update_one(
            {"_id": ObjectId(activity_id)},
            {"$addToSet": {"completions": today_str}},
        )
        done = True

    updated = await activities_col.find_one({"_id": ObjectId(activity_id)})
    return {"done": done, "activity": serialize_doc(updated)}


# ── Serve frontend ─────────────────────────────────────
@app.get("/")
async def serve_index():
    return FileResponse(FRONTEND_DIR / "index.html")


app.mount("/", StaticFiles(directory=str(FRONTEND_DIR)), name="static")
