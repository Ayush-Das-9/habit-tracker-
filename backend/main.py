import os
import asyncio
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
from groq import Groq
import httpx

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
activities_col = db["activities"]

# Groq
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
groq_client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

# Keep-alive for Render
RENDER_URL = os.getenv("RENDER_EXTERNAL_URL")

async def keep_alive():
    """Ping own URL every 12 minutes to prevent Render free-tier spin-down."""
    if not RENDER_URL:
        print("RENDER_EXTERNAL_URL not set — keep-alive disabled.")
        return
    print(f"Keep-alive started → pinging {RENDER_URL} every 12 min")
    async with httpx.AsyncClient() as client:
        while True:
            await asyncio.sleep(12 * 60)  # 12 minutes
            try:
                r = await client.get(RENDER_URL)
                print(f"Keep-alive ping: {r.status_code}")
            except Exception as e:
                print(f"Keep-alive ping failed: {e}")

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(keep_alive())


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
    async for doc in activities_col.find({"person_id": pid}):
        docs.append(doc_to_dict(doc))
    return {"activities": docs}


# --- Add activity ---
@app.post("/api/person/{pid}/activities")
async def add_activity(pid: str, body: ActivityIn):
    person = await persons.find_one({"person_id": pid})
    if not person:
        raise HTTPException(404, "Person not found")
    doc = {"person_id": pid, "name": body.name, "completions": []}
    result = await activities_col.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return {"activity": doc}


# --- Mark done (one-way, no undo) ---
@app.post("/api/person/{pid}/activities/{act_id}/done")
async def mark_done(pid: str, act_id: str):
    today_str = date.today().isoformat()
    result = await activities_col.update_one(
        {"_id": ObjectId(act_id), "person_id": pid},
        {"$addToSet": {"completions": today_str}},
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Activity not found")
    updated = await activities_col.find_one({"_id": ObjectId(act_id)})
    return {"activity": doc_to_dict(updated)}


# --- Delete activity ---
@app.delete("/api/person/{pid}/activities/{act_id}")
async def delete_activity(pid: str, act_id: str):
    result = await activities_col.delete_one({"_id": ObjectId(act_id), "person_id": pid})
    if result.deleted_count == 0:
        raise HTTPException(404, "Activity not found")
    return {"deleted": True}


# --- AI Agent ---
@app.get("/api/person/{pid}/agent")
async def agent_analyze(pid: str):
    if not groq_client:
        raise HTTPException(500, "GROQ_API_KEY not configured")

    person = await persons.find_one({"person_id": pid})
    if not person:
        raise HTTPException(404, "Person not found")

    # Fetch all habits
    habits = []
    async for doc in activities_col.find({"person_id": pid}):
        habits.append({
            "name": doc.get("name", "Unknown"),
            "completions": doc.get("completions", [])
        })

    if not habits:
        return {"answers": [
            "No habits found to analyze.",
            "No habits found to analyze.",
            "No habits found to analyze."
        ]}

    # Build context
    context = "User Habit Data:\n"
    for i, h in enumerate(habits, 1):
        completed = ", ".join(h["completions"]) if h["completions"] else "Never completed"
        context += f"{i}. Habit: {h['name']}\n   Completed on: {completed}\n"

    prompt = f"""You are a habit analysis agent. Here is the user's habit data:

{context}

Today's date is {date.today().isoformat()}.

Answer these 3 questions ONLY. Keep answers short and direct (2-3 sentences max each).
Format your response as exactly 3 numbered answers, nothing else.

1. Which habits have been done continuously for more than 20 consecutive days?
2. Which activity does the user spend the most time on (most completions)?
3. If any habit has been done for more than 21 consecutive days, suggest removing it from the tracker since it is now a permanent habit.
"""

    try:
        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are a habit analysis agent. Give short direct answers."},
                {"role": "user", "content": prompt}
            ]
        )
        answer_text = response.choices[0].message.content
        return {"answer": answer_text}
    except Exception as e:
        raise HTTPException(500, f"AI error: {str(e)}")


# --- Serve frontend ---
@app.get("/")
async def index():
    return FileResponse(FRONTEND_DIR / "index.html")

app.mount("/", StaticFiles(directory=str(FRONTEND_DIR)), name="static")
