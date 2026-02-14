import os
import json
import asyncio
import urllib.parse
import websockets
from fastapi import FastAPI, WebSocket, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
from datetime import datetime
from bson import ObjectId
from dotenv import load_dotenv 

# 1. Load environment variables
load_dotenv() 

app = FastAPI()

# --- CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- CONFIGURATION (LOADED FROM .ENV) ---
mongo_user_env = os.getenv("MONGO_USER")
mongo_pass_env = os.getenv("MONGO_PASSWORD")
mongo_cluster_env = os.getenv("MONGO_CLUSTER")
DB_NAME = os.getenv("DB_NAME")

# URL Encode the password (safety check)
if not mongo_pass_env:
    print("❌ WARNING: MONGO_PASSWORD not found in .env file")
    mongo_pass_encoded = ""
else:
    mongo_pass_encoded = urllib.parse.quote_plus(mongo_pass_env)

# Construct URI
if mongo_user_env and mongo_cluster_env:
    MONGO_URI = f"mongodb+srv://{mongo_user_env}:{mongo_pass_encoded}@{mongo_cluster_env}/?retryWrites=true&w=majority"
else:
    MONGO_URI = None
    print("❌ CRITICAL: MONGO_USER or MONGO_CLUSTER missing in .env")

# Azure Agent
AGENT_WSS_URL = os.getenv("AZURE_AGENT_WSS_URL")
AGENT_NAME = os.getenv("AZURE_AGENT_NAME")
# Use a default empty string if key is missing to prevent crash
AGENT_HEADERS = {"Ocp-Apim-Subscription-Key": os.getenv("AZURE_SUB_KEY", "")}

# --- DB INIT ---
db = None # Initialize globally to prevent NameError

if MONGO_URI:
    try:
        client = AsyncIOMotorClient(MONGO_URI)
        db = client[DB_NAME]
        print(f"✅ Connected to MongoDB at {mongo_cluster_env}")
    except Exception as e:
        print(f"❌ CRITICAL DB ERROR: {e}")
else:
    print("⚠️  Skipping DB connection due to missing config.")

# --- MODELS ---
class UserAuth(BaseModel):
    username: str
    password: str

class Project(BaseModel):
    name: str
    lob: str
    department: str
    application: str
    module: str = "Core"
    description: str
    owner: str = "System"
    projectType: str = "New Development"
    createdOn: str = datetime.now().strftime("%Y-%m-%d")

class ProjectVersion(BaseModel):
    projectId: str
    versionName: str
    content: str
    timestamp: str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

# --- ROUTES ---

@app.post("/api/register")
async def register(user: UserAuth):
    if db is None: raise HTTPException(503, "Database not connected")
    try:
        existing = await db.users.find_one({"username": user.username})
        if existing: raise HTTPException(status_code=400, detail="User already exists")
        await db.users.insert_one(user.dict())
        return {"status": "success", "username": user.username}
    except Exception as e:
        print(f"Register Error: {e}")
        raise HTTPException(status_code=500, detail="Registration failed")

@app.post("/api/login")
async def login(user: UserAuth):
    if db is None: raise HTTPException(503, "Database not connected")
    try:
        record = await db.users.find_one({"username": user.username, "password": user.password})
        if not record: raise HTTPException(status_code=401, detail="Invalid credentials")
        return {"status": "success", "username": user.username}
    except Exception as e:
        print(f"Login Error: {e}")
        raise HTTPException(status_code=500, detail="Login failed")

# UPDATED: Filters projects by Owner
@app.get("/api/projects")
async def get_projects(owner: str = Query(None)):
    if db is None: return []
    try:
        # If owner is provided, filter by it. Otherwise return all.
        query = {"owner": owner} if owner else {}
        
        projects = await db.projects.find(query).to_list(100)
        for p in projects:
            p["id"] = str(p["_id"])
            del p["_id"]
        return projects
    except Exception as e: return []

@app.post("/api/projects")
async def create_project(project: Project):
    if db is None: raise HTTPException(503, "Database not connected")
    try:
        new_p = project.dict()
        res = await db.projects.insert_one(new_p)
        new_p["id"] = str(res.inserted_id)
        if "_id" in new_p: del new_p["_id"]
        return new_p
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to create project")

@app.delete("/api/projects/{project_id}")
async def delete_project(project_id: str):
    if db is None: raise HTTPException(503, "Database not connected")
    try:
        res = await db.projects.delete_one({"_id": ObjectId(project_id)})
        # Also delete versions associated with this project
        await db.versions.delete_many({"projectId": project_id})
        
        if res.deleted_count == 1: return {"status": "success"}
        raise HTTPException(status_code=404, detail="Not found")
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/versions")
async def save_version(version: ProjectVersion):
    if db is None: raise HTTPException(503, "Database not connected")
    try:
        v_dict = version.dict()
        res = await db.versions.insert_one(v_dict)
        return {"status": "success", "id": str(res.inserted_id)}
    except Exception as e: raise HTTPException(status_code=500, detail="Save failed")

@app.get("/api/versions/{project_id}")
async def get_versions(project_id: str):
    if db is None: return []
    try:
        versions = await db.versions.find({"projectId": project_id}).sort("timestamp", -1).to_list(100)
        for v in versions:
            v["id"] = str(v["_id"])
            del v["_id"]
        return versions
    except Exception as e: return []

# --- WEBSOCKET WITH MOCK FALLBACK ---
async def mock_agent_responder(client_ws: WebSocket):
    await client_ws.send_text(json.dumps({"type": "stream", "message": "\n\n**[OFFLINE MODE]** Azure Agent is down. Using Mock Responder.\n\n"}))
    try:
        while True:
            data = await client_ws.receive_text()
            user_input = json.loads(data).get("input", "").lower()
            
            if "toc" in user_input:
                response_text = "1. Executive Summary\n2. Scope\n3. Functional Requirements\n4. Risks"
            else:
                response_text = "### Mock Response\nThis is a simulation because the Azure Agent is currently unavailable."
            
            chunk_size = 5
            for i in range(0, len(response_text), chunk_size):
                chunk = response_text[i:i+chunk_size]
                await client_ws.send_text(json.dumps({"type": "stream", "message": chunk}))
                await asyncio.sleep(0.05) 
            await client_ws.send_text(json.dumps({"type": "end", "message": ""}))
    except Exception: pass

@app.websocket("/ws/chat")
async def websocket_endpoint(client_ws: WebSocket):
    await client_ws.accept()
    print("Browser connected to WS")
    
    try:
        if not AGENT_WSS_URL: raise Exception("No Azure URL Configured")
        
        async with websockets.connect(AGENT_WSS_URL, additional_headers=AGENT_HEADERS) as azure_ws:
            print("✅ Connected to Azure Agent")
            async def browser_to_azure():
                try:
                    while True:
                        data = await client_ws.receive_text()
                        user_input = json.loads(data).get("input")
                        payload = {
                            "agent_name": AGENT_NAME,
                            "chat_token": "", 
                            "graph_payload": {},
                            "inputs": {"input": user_input}
                        }
                        await azure_ws.send(json.dumps(payload))
                except Exception: await azure_ws.close()

            async def azure_to_browser():
                try:
                    while True:
                        res = await azure_ws.recv()
                        await client_ws.send_text(res)
                except Exception: await client_ws.close()

            await asyncio.gather(browser_to_azure(), azure_to_browser())

    except Exception as e:
        print(f"⚠️ Azure Agent Error: {e}")
        await mock_agent_responder(client_ws)

# --- STATIC FILES ---
app.mount("/", StaticFiles(directory="../client", html=True), name="static")