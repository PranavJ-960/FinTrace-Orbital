import cv2
import numpy as np
import pytesseract
import psycopg2
import os
from fastapi import FastAPI, File, UploadFile, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

print("DB HOST:", os.getenv("DB_HOST")) 

pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

app = FastAPI(title="FinTrace API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    return psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        database=os.getenv("DB_NAME", "fintrace"),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD", ""),
        port=os.getenv("DB_PORT", 5432)
    )

@app.on_event("startup")
def create_tables():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS receipts (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL,
            raw_text TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        );
    """)
    conn.commit()
    cur.close()
    conn.close()

def preprocess_image(image: np.ndarray) -> np.ndarray:
    image = cv2.resize(image, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    filtered = cv2.bilateralFilter(gray, 9, 75, 75)
    thresh = cv2.adaptiveThreshold(
        filtered, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY, 15, 8
    )
    kernel = np.ones((2, 2), np.uint8)
    processed = cv2.dilate(thresh, kernel, iterations=1)
    return processed

@app.post("/api/upload")
async def upload_receipt(file: UploadFile = File(...)):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file must be an image.")

    try:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if image is None:
            raise HTTPException(status_code=400, detail="Failed to decode image.")

        processed = preprocess_image(image)
        custom_config = r'--psm 6'
        raw_text = pytesseract.image_to_string(processed, config=custom_config)

        return {"text": raw_text}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")

@app.post("/api/save")
async def save_receipt(request: Request):
    body = await request.json()

    user_id = body.get("user_id")
    raw_text = body.get("raw_text")

    if not user_id or not raw_text:
        raise HTTPException(status_code=400, detail="user_id and raw_text are required.")

    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO receipts (user_id, raw_text) VALUES (%s, %s) RETURNING id;",
            (user_id, raw_text)
        )
        new_id = cur.fetchone()[0]
        conn.commit()
        cur.close()
        conn.close()

        return {"success": True, "receipt_id": new_id}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error: {str(e)}")