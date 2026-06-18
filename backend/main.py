import cv2
import numpy as np
import pytesseract
import psycopg2
import os
import re
import json
from fastapi import FastAPI, File, UploadFile, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Machine Learning & Google Gemini AI Imports
from dataset import TRAINING_DATA
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
from google import genai
from google.genai import types

load_dotenv()

pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

app = FastAPI(title="FinTrace API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global variables for ML engine
vectorizer = None
classifier = None

# Global list of valid categories for system constraints
VALID_CATEGORIES = [
    "Food & Beverage", "Groceries", "Transport", "Healthcare",
    "Entertainment", "Utilities", "Shopping", "Education",
    "Personal Care", "Other"
]

def get_db():
    return psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        database=os.getenv("DB_NAME", "fintrace"),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD", ""),
        port=os.getenv("DB_PORT", 5432)
    )

@app.on_event("startup")
def startup_pipeline():
    # 1. DB Setup
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS receipts (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL,
            raw_text TEXT NOT NULL,
            parsed_items JSONB,
            created_at TIMESTAMP DEFAULT NOW()
        );
    """)
    conn.commit()
    cur.close()
    conn.close()
    print("Database structures verified.")

    # 2. Train Naive Bayes Classifier
    global vectorizer, classifier
    texts = [item[0] for item in TRAINING_DATA]
    categories = [item[1] for item in TRAINING_DATA]
    
    vectorizer = TfidfVectorizer(lowercase=True, stop_words='english')
    X_train = vectorizer.fit_transform(texts)
    
    classifier = MultinomialNB()
    classifier.fit(X_train, categories)
    print("Categorization Machine Learning model successfully trained.")

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

def classify_item_name(name: str) -> str:
    global vectorizer, classifier
    if not vectorizer or not classifier:
        return "Other"
        
    cleaned_name = name.lower().strip()
    
    # LAYER 1: Immediate Merchant Keyword Rules Override
    merchant_rules = {
        "mcdonalds": "Food & Beverage",
        "starbucks": "Food & Beverage",
        "burger king": "Food & Beverage",
        "subway": "Food & Beverage",
        "liho": "Food & Beverage",
        "koi": "Food & Beverage",
        "yakun": "Food & Beverage",
        "fairprice": "Groceries",
        "sheng siong": "Groceries",
        "cold storage": "Groceries",
        "giant": "Groceries",
        "grab": "Transport",
        "gojek": "Transport",
        "comfortdelgro": "Transport",
        "guardian": "Healthcare",
        "watsons": "Healthcare",
        "uniqlo": "Shopping",
        "muji": "Shopping",
        "ikea": "Shopping",
        "decathlon": "Shopping",
        "courts": "Shopping",
        "harvey norman": "Shopping"
    }
    
    for merchant, category in merchant_rules.items():
        if merchant in cleaned_name:
            print(f"[Rule Hit] Item: '{name}' -> Intercepted by Merchant Rule: {category}")
            return category

    # LAYER 2: Fall back to Naive Bayes Classifier
    words = cleaned_name.split()
    vocabulary = vectorizer.vocabulary_
    has_known_words = any(word in vocabulary for word in words)
    
    if not has_known_words:
        return "LLM_FALLBACK"
        
    input_vector = vectorizer.transform([cleaned_name])
    probabilities = classifier.predict_proba(input_vector)[0]
    max_prob_idx = np.argmax(probabilities)
    confidence = probabilities[max_prob_idx]
    predicted_category = classifier.classes_[max_prob_idx]
    
    # CRITICAL FIX: Check the floor threshold BEFORE claiming a success hit!
    if confidence < 0.22:
        print(f"[ML Low Confidence] Item: '{name}' -> Low Confidence ({confidence:.4f}). Routing to Fallback.")
        return "LLM_FALLBACK"
        
    print(f"[ML Hit] Item: '{name}' -> Predicted via Bayes: {predicted_category} (Confidence: {confidence:.4f})")
    return predicted_category

def resolve_llm_fallback(items_to_resolve: list) -> list:
    """Sends all unclassified items to Gemini and returns a guaranteed list of categories."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("[Gemini Error] Missing GEMINI_API_KEY env variable.")
        return ["Other"] * len(items_to_resolve)

    try:
        client = genai.Client(api_key=api_key)
        
        # We explicitly request a flat list array ordered by index
        prompt = (
            f"You are a receipt processing engine. Classify this list of item names into their categories.\n"
            f"Allowed categories: {', '.join(VALID_CATEGORIES)}\n\n"
            f"Items:\n" + "\n".join([f"{i}. {item}" for i, item in enumerate(items_to_resolve)]) + "\n\n"
            f"Return a JSON object containing a key named 'categories' which holds an array of strings representing the categories in the exact same sequential order as the input items."
        )

        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=types.Schema(
                    type=types.Type.OBJECT,
                    properties={
                        "categories": types.Schema(
                            type=types.Type.ARRAY,
                            items=types.Schema(type=types.Type.STRING),
                            description="The assigned categories matching the order of the input items list."
                        )
                    },
                    required=["categories"]
                ),
                temperature=0.0
            ),
        )
        
        result_data = json.loads(response.text)
        categories_list = result_data.get("categories", [])
        print(f"[Gemini Resolved Batch Success]: {categories_list}")
        return categories_list

    except Exception as e:
        print(f"[Gemini Fallback Failure]: {str(e)}")
        return ["Other"] * len(items_to_resolve)

def parse_receipt_items(raw_text: str) -> list:
    lines = raw_text.split('\n')
    items = []
    fallback_queue = []

    price_pattern = re.compile(r'\$?\d+[.,]\d{1,2}(?:\s*)$')
    skip_keywords = [
        'total', 'subtotal', 'sub-total', 'tax', 'gst', 'change',
        'cash', 'visa', 'mastercard', 'nets', 'receipt', 'thank',
        'member', 'points', 'savings', 'discount', 'rounding',
        'date', 'tel', 'street', 'shop', 'purchase'
    ]

    for line in lines:
        line = line.strip()
        if not line:
            continue

        line_lower = line.lower()
        if any(kw in line_lower for kw in skip_keywords):
            continue

        cleaned_line = re.sub(r'^\d+[.,]\s*', '', line).strip()
        price_match = price_pattern.search(cleaned_line)
        if not price_match:
            continue

        price_str = price_match.group().strip().replace('$', '').replace(',', '.')
        try:
            price = float(price_str)
        except ValueError:
            continue

        if price == 0.00:
            continue

        item_name = cleaned_line[:price_match.start()].strip()
        item_name = re.sub(r'[\.\-\s]+$', '', item_name).strip()

        if not item_name:
            continue

        category = classify_item_name(item_name)

        item_obj = {
            "name": item_name,
            "price": price,
            "category": category,
            "raw_line": line
        }
        
        if category == "LLM_FALLBACK":
            fallback_queue.append(item_name)
            
        items.append(item_obj)

    # LAYER 3: Handle structural array index injection
    if fallback_queue:
        print(f"[Pipeline Routing] Forwarding {len(fallback_queue)} items to gemini-2.5-flash...")
        resolved_categories = resolve_llm_fallback(fallback_queue)
        
        fallback_idx = 0
        for item in items:
            if item["category"] == "LLM_FALLBACK":
                # Fallback to 'Other' if the list lengths somehow mismatch
                if fallback_idx < len(resolved_categories):
                    item["category"] = resolved_categories[fallback_idx]
                else:
                    item["category"] = "Other"
                fallback_idx += 1

    return items

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

@app.post("/api/parse")
async def parse_receipt(request: Request):
    body = await request.json()
    raw_text = body.get("raw_text")

    if not raw_text:
        raise HTTPException(status_code=400, detail="raw_text is required.")

    items = parse_receipt_items(raw_text)

    return {
        "items": items,
        "item_count": len(items),
        "estimated_total": round(sum(i["price"] for i in items), 2)
    }

@app.post("/api/save")
async def save_receipt(request: Request):
    body = await request.json()

    user_id = body.get("user_id")
    raw_text = body.get("raw_text")
    parsed_items = body.get("parsed_items", [])

    if not user_id or not raw_text:
        raise HTTPException(status_code=400, detail="user_id and raw_text are required.")

    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO receipts (user_id, raw_text, parsed_items) VALUES (%s, %s, %s) RETURNING id;",
            (user_id, raw_text, json.dumps(parsed_items))
        )
        new_id = cur.fetchone()[0]
        conn.commit()
        cur.close()
        conn.close()

        return {"success": True, "receipt_id": new_id}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error: {str(e)}")

@app.get("/api/receipts")
async def get_receipts(user_id: str):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            "SELECT id, raw_text, parsed_items, created_at FROM receipts WHERE user_id = %s ORDER BY created_at DESC;",
            (user_id,)
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()

        receipts = []
        for row in rows:
            receipts.append({
                "id": row[0],
                "raw_text": row[1],
                "parsed_items": row[2] or [],
                "created_at": str(row[3])
            })

        return {"receipts": receipts}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error: {str(e)}")


@app.get("/api/spending-summary")
async def get_spending_summary(user_id: str, months: int = 6):
    """Return aggregated spending data for the given user over the past `months` months.
    Response schema:
      {
        'totals': {'overall': float, 'by_category': {category: float}},
        'monthly': [ {'month': 'YYYY-MM', 'total': float, 'by_category': {category: float}}, ... ],
        'categories': [str,...]
      }
    """
    try:
        conn = get_db()
        cur = conn.cursor()

        # Aggregate monthly totals per category
        cur.execute(
            """
            SELECT to_char(date_trunc('month', r.created_at), 'YYYY-MM') AS month,
                   COALESCE(elem->>'category', 'Other') AS category,
                   SUM((elem->>'price')::numeric) AS total
            FROM receipts r, jsonb_array_elements(r.parsed_items) AS elem
            WHERE r.user_id = %s
              AND r.created_at >= (date_trunc('month', current_date) - INTERVAL %s)
            GROUP BY month, category
            ORDER BY month;
            """,
            (user_id, f"{months} months")
        )

        rows = cur.fetchall()

        monthly = {}
        categories_set = set()
        for month, category, total in rows:
            categories_set.add(category)
            monthly.setdefault(month, { 'total': 0.0, 'by_category': {} })
            monthly[month]['by_category'][category] = float(total)
            monthly[month]['total'] += float(total)

        monthly_list = []
        for m in sorted(monthly.keys()):
            monthly_list.append({
                'month': m,
                'total': round(monthly[m]['total'], 2),
                'by_category': {k: round(v, 2) for k, v in monthly[m]['by_category'].items()}
            })

        # Overall total
        cur.execute(
            """
            SELECT SUM((elem->>'price')::numeric) FROM receipts r, jsonb_array_elements(r.parsed_items) AS elem
            WHERE r.user_id = %s;
            """,
            (user_id,)
        )
        overall_total_row = cur.fetchone()
        overall_total = float(overall_total_row[0]) if overall_total_row and overall_total_row[0] is not None else 0.0

        # Totals by category
        cur.execute(
            """
            SELECT COALESCE(elem->>'category', 'Other') AS category,
                   SUM((elem->>'price')::numeric) AS total
            FROM receipts r, jsonb_array_elements(r.parsed_items) AS elem
            WHERE r.user_id = %s
            GROUP BY category;
            """,
            (user_id,)
        )
        cat_rows = cur.fetchall()
        by_category = { row[0]: float(row[1]) for row in cat_rows }

        cur.close()
        conn.close()

        return {
            'totals': { 'overall': round(overall_total, 2), 'by_category': {k: round(v, 2) for k, v in by_category.items()} },
            'monthly': monthly_list,
            'categories': sorted(list(categories_set)) or VALID_CATEGORIES
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error: {str(e)}")