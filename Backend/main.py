import os
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from db.database import Base, engine
from routes import text, image, vision, chats

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("callmissed")

app = FastAPI(
    title="Demo Chatbot using CallMissed API",
    description="Multi-Agent Chatbot",
)
_origins_env = os.getenv("FRONTEND_URL", "")
ALLOWED_ORIGINS = [o.strip() for o in _origins_env.split(",") if o.strip()] or [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables ensured.")


@app.exception_handler(Exception)
async def unhandled_exception_handler(request, exc):
    logger.exception("Unhandled error on %s %s", request.method, request.url)
    return JSONResponse(status_code=500, content={"error": "Internal server error"})


@app.get("/")
async def root():
    return {"status": "ok", "service": "callmissed-backend"}


@app.get("/health")
async def health():
    return {"status": "healthy"}


app.include_router(text.router, prefix="/api", tags=["text"])
app.include_router(image.router, prefix="/api", tags=["image"])
app.include_router(vision.router, prefix="/api", tags=["vision"])
app.include_router(chats.router, prefix="/api", tags=["chats"])
