FROM python:3.10-slim

# 1. Install system dependencies (Tesseract Engine and updated OpenCV dependencies)
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 2. Copy dependencies and install python packages
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 3. Copy full project code
COPY . .

# 4. Expose the default FastAPI port
EXPOSE 8000

# 5. Execute production server using Uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]