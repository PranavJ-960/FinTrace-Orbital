import cv2
import numpy as np
import pytesseract
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware

pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

app = FastAPI(title="FinTrace API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def preprocess_image(image: np.ndarray) -> np.ndarray:
    # Scale up (2x zoom)
    image = cv2.resize(image, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
    
    # Grayscale
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    
    # Bilateral Filter (Smooths noise but keeps text sharp)
    filtered = cv2.bilateralFilter(gray, 9, 75, 75)
    
    # Adaptive Thresholding
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