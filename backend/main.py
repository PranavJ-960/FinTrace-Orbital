import cv2
import numpy as np
import pytesseract
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="FinTrace API")

# Configure CORS so your frontend (running on port 5173) can access the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/upload")
async def upload_receipt(file: UploadFile = File(...)):
    # 1. Validate that the uploaded file is actually an image
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file must be an image.")
    
    try:
        # 2. Read file contents into bytes
        contents = await file.read()
        
        # 3. Convert bytes to a numpy array and decode using OpenCV
        nparr = np.frombuffer(contents, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if image is None:
            raise HTTPException(status_code=400, detail="Failed to decode image.")
        
        # 4. Extract raw text from the image using Tesseract [cite: 61, 77]
        raw_text = pytesseract.image_to_string(image)
        
        # 5. Return the raw text directly to the frontend [cite: 61]
        return {"raw_text": raw_text}
        
    except Exception as e:
        # In case something goes wrong internally, catch it and return a 500 error
        raise HTTPException(status_code=500, detail=str(e))