# 🌟 Habit Tracker

> Track daily habits with a simple web interface. Each user gets their own personalized dashboard using a secure 5-digit ID.

---

## ✨ Features

- 🔐 **Secure Access**: Log in with a unique 5-digit person ID.
- ➕ **Manage Habits**: Easily add and delete activities.
- ✅ **Daily Tracking**: Mark activities as done for the day with a single click.
- 📅 **Visual Insights**: See a monthly heatmap of your completions.
- 🤖 **AI Agent**: Get AI-powered analysis and insights into your habits.

---

## 💻 Tech Stack

- **Frontend**: HTML, CSS, Vanilla JavaScript
- **Backend**: FastAPI ⚡ (Python)
- **Database**: MongoDB Atlas 🍃
- **AI Integration**: Groq API 🧠

---

## 🚀 Getting Started

Follow these steps to run the application locally:

### 1. Install Dependencies

Navigate to the `backend` directory and install the required Python packages:

```bash
cd backend
pip install -r requirements.txt
```

### 2. Configure Environment Variables

Create a `.env` file in the `backend` directory and add your credentials:

```env
MONGO_URI=your_mongodb_connection_string_here
GROQ_API_KEY=your_groq_api_key_here
```

### 3. Start the Server

Run the FastAPI server using Uvicorn:

```bash
uvicorn main:app --reload
```

### 4. Open the App

Visit the application in your browser at:  
👉 **[http://127.0.0.1:8000](http://127.0.0.1:8000)**

---

## 📡 API Routes

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/person` | Login or register a new user |
| `GET` | `/api/person/{pid}/activities` | List all activities for a user |
| `POST` | `/api/person/{pid}/activities` | Add a new activity |
| `POST` | `/api/person/{pid}/activities/{id}/done`| Mark an activity as done for today |
| `DELETE`| `/api/person/{pid}/activities/{id}` | Delete an activity |
| `GET` | `/api/person/{pid}/agent` | Get AI agent analysis of habits |
