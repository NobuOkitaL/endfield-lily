from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import dev, inventory, operators, weapons

app = FastAPI(title="ZMD 终末地识别后端", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(inventory.router)
app.include_router(operators.router)
app.include_router(weapons.router)
app.include_router(dev.router)


@app.get("/health")
def health():
    return {"status": "ok"}
