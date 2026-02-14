import os
import json
import asyncio
import urllib.parse
import websockets
from fastapi import FastAPI, WebSocket, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
from datetime import datetime
from bson import ObjectId

app = FastAPI()

# --- CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- CONFIG ---
username = "divyansh.panwar2003"
password = urllib.parse.quote_plus("Dehradun12345") 
MONGO_URI = f"mongodb+srv://divyanshpanwar2003:{password}@cluster0.jeeeofd.mongodb.net/?retryWrites=true&w=majority"
DB_NAME = "sdlc_studio"

# AZURE CONFIG
AGENT_WSS_URL = "wss://eygenaistudio-apim-kubernetes-dev.azure-api.net/eygs-ctp/ws/demoragagent-4b14bc4d/deployed_agent_chat?token=BC4B1_2026-02-11_11_38_19&agent_name=95fb5d5f-b3d5-4f24-8f4e-1e6f1ad7bf40&subscription-key=cb6d3d69c4c4449ea5d42721380c008d"
AGENT_NAME = "95fb5d5f-b3d5-4f24-8f4e-1e6f1ad7bf40"

# --- DB INIT ---
try:
    client = AsyncIOMotorClient(MONGO_URI)
    db = client[DB_NAME]
    print(f"Connected to MongoDB")
except Exception as e:
    print(f"CRITICAL DB ERROR: {e}")

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
    try:
        existing = await db.users.find_one({"username": user.username})
        if existing:
            raise HTTPException(status_code=400, detail="User already exists")
        await db.users.insert_one(user.dict())
        return {"status": "success", "username": user.username}
    except Exception as e:
        print(f"REGISTER ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/login")
async def login(user: UserAuth):
    try:
        record = await db.users.find_one({"username": user.username, "password": user.password})
        if not record:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        return {"status": "success", "username": user.username}
    except Exception as e:
        print(f"LOGIN ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/projects")
async def get_projects():
    try:
        projects = await db.projects.find().to_list(100)
        for p in projects:
            p["id"] = str(p["_id"])
            del p["_id"]
        return projects
    except Exception as e:
        print(f"PROJECTS ERROR: {e}")
        return []

@app.post("/api/projects")
async def create_project(project: Project):
    try:
        new_p = project.dict()
        res = await db.projects.insert_one(new_p)
        new_p["id"] = str(res.inserted_id)
        if "_id" in new_p: del new_p["_id"]
        return new_p
    except Exception as e:
        print(f"CREATE PROJECT ERROR: {e}")
        raise HTTPException(status_code=500, detail="Failed to create project")

@app.delete("/api/projects/{project_id}")
async def delete_project(project_id: str):
    try:
        result = await db.projects.delete_one({"_id": ObjectId(project_id)})
        # Optional: Delete associated versions
        await db.versions.delete_many({"projectId": project_id})
        
        if result.deleted_count == 1:
            return {"status": "success"}
        raise HTTPException(status_code=404, detail="Project not found")
    except Exception as e:
        print(f"DELETE ERROR: {e}")
        raise HTTPException(status_code=500, detail="Delete failed")

# --- VERSIONING ROUTES ---
@app.post("/api/versions")
async def save_version(version: ProjectVersion):
    try:
        v_dict = version.dict()
        res = await db.versions.insert_one(v_dict)
        return {"status": "success", "id": str(res.inserted_id)}
    except Exception as e:
        print(f"VERSION ERROR: {e}")
        raise HTTPException(status_code=500, detail="Save version failed")

@app.get("/api/versions/{project_id}")
async def get_versions(project_id: str):
    try:
        versions = await db.versions.find({"projectId": project_id}).sort("timestamp", -1).to_list(100)
        for v in versions:
            v["id"] = str(v["_id"])
            del v["_id"]
        return versions
    except Exception as e:
        return []

# --- AGENT PROXY ---
@app.websocket("/ws/chat")
async def websocket_endpoint(client_ws: WebSocket):
    await client_ws.accept()
    print("WS Connected")
    try:
        async with websockets.connect(
            AGENT_WSS_URL,
            additional_headers={"Ocp-Apim-Subscription-Key": "cb6d3d69c4c4449ea5d42721380c008d"}
        ) as azure_ws:
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
                except Exception:
                    await azure_ws.close()

            async def azure_to_browser():
                try:
                    while True:
                        res = await azure_ws.recv()
                        await client_ws.send_text(res)
                except Exception:
                    await client_ws.close()

            await asyncio.gather(browser_to_azure(), azure_to_browser())
    except Exception as e:
        print(f"WS Error: {e}")
        await client_ws.close()

app.mount("/", StaticFiles(directory="../client", html=True), name="static")
