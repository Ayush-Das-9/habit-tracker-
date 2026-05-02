# Habit Tracker

Track daily habits with a simple web interface. Each user gets their own dashboard using a 5-digit ID.

## What it does

- Log in with a 5-digit person ID
- Add, rename, delete activities
- Mark activities as done for the day
- See a monthly heatmap of your completions

## Tech used

- HTML, CSS, JavaScript (frontend)
- FastAPI + MongoDB Atlas (backend)

## How to run

1. Install dependencies:

```
cd backend
pip install -r requirements.txt
```

2. Add your MongoDB connection string in `backend/.env`:

```
MONGO_URI=your_connection_string_here
```

3. Start the server:

```
uvicorn main:app --reload
```

4. Open http://127.0.0.1:8000

## API routes

```
POST   /api/person                                  - login/register
GET    /api/person/{pid}/activities                  - list activities
POST   /api/person/{pid}/activities                  - add activity
PUT    /api/person/{pid}/activities/{id}             - rename activity
DELETE /api/person/{pid}/activities/{id}             - delete activity
POST   /api/person/{pid}/activities/{id}/toggle      - toggle done for today
```
