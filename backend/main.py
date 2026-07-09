import cv2
import numpy as np
import pytesseract
import psycopg2
import os
import re
import json
import statistics
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

vectorizer = None
classifier = None

VALID_CATEGORIES = [
    "Food & Beverage", "Groceries", "Transport", "Healthcare",
    "Entertainment", "Utilities", "Shopping", "Education",
    "Personal Care", "Other"
]


def detect_spending_anomalies(monthly_totals, z_threshold: float = 2.0, min_points: int = 3):
    if len(monthly_totals) < min_points:
        return []

    totals = [float(item.get("total", 0.0)) for item in monthly_totals if item.get("total") is not None]
    if len(totals) < min_points:
        return []

    mean_total = statistics.fmean(totals)
    if mean_total <= 0:
        return []

    std_dev = statistics.pstdev(totals)
    anomalies = []

    for item in monthly_totals:
        total = float(item.get("total", 0.0))
        if total <= 0:
            continue

        if std_dev > 0:
            z_score = (total - mean_total) / std_dev
        else:
            z_score = 0.0

        deviation_pct = ((total - mean_total) / mean_total) * 100 if mean_total > 0 else 0.0
        is_anomaly = z_score >= z_threshold or deviation_pct >= 60.0

        if is_anomaly:
            severity = "high" if z_score >= z_threshold or deviation_pct >= 60.0 else "medium"
            anomalies.append({
                "month": item.get("month"),
                "total": round(total, 2),
                "expected_total": round(mean_total, 2),
                "deviation": round(total - mean_total, 2),
                "deviation_pct": round(deviation_pct, 2),
                "z_score": round(z_score, 2),
                "severity": severity,
                "reason": "Spending was significantly above the recent monthly average."
            })

    return anomalies


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
    # 1. DB Setup with Collaborative Schema extensions
    conn = get_db()
    cur = conn.cursor()
    
    # Core receipts storage ledger
    cur.execute("""
        CREATE TABLE IF NOT EXISTS receipts (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL,
            raw_text TEXT NOT NULL,
            parsed_items JSONB,
            created_at TIMESTAMP DEFAULT NOW()
        );
    """)
    
    # Global multi-tenant identity cache ledger
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users_directory (
            clerk_id TEXT PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            display_name TEXT NOT NULL
        );
    """)

    # Relational link junction mapping to trigger instant cross-user feed rendering
    cur.execute("""
        CREATE TABLE IF NOT EXISTS receipt_shares (
            id SERIAL PRIMARY KEY,
            receipt_id INTEGER REFERENCES receipts(id) ON DELETE CASCADE,
            user_id TEXT NOT NULL,
            amount_owed NUMERIC(10, 2) DEFAULT 0.00,
            is_owner BOOLEAN DEFAULT FALSE
        );
    """)
    
    conn.commit()
    cur.close()
    conn.close()
    print("Database collaborative structures verified.")

    # 2. Train Naive Bayes Classifier
    global vectorizer, classifier
    texts = [item[0] for item in TRAINING_DATA]
    categories = [item[1] for item in TRAINING_DATA]
    
    vectorizer = TfidfVectorizer(lowercase=True, stop_words='english')
    X_train = vectorizer.fit_transform(texts)
    
    classifier = MultinomialNB()
    classifier.fit(X_train, categories)
    print("Categorization Machine Learning model successfully trained.")

@app.post("/api/sync-user")
async def sync_user(request: Request):
    try:
        body = await request.json()
        clerk_id = body.get("clerk_id")
        email = body.get("email")
        display_name = body.get("display_name", email.split("@")[0] if email else "User")

        if not clerk_id or not email:
            raise HTTPException(status_code=400, detail="Missing sync parameters.")

        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO users_directory (clerk_id, email, display_name)
            VALUES (%s, %s, %s)
            ON CONFLICT (clerk_id) DO UPDATE SET email = EXCLUDED.email, display_name = EXCLUDED.display_name;
            """,
            (clerk_id, email.lower().strip(), display_name)
        )
        conn.commit()
        cur.close()
        conn.close()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/search-friend")
async def search_friend(email: str):
    try:
        conn = get_db()
        cur = conn.cursor()
        
        # Enforce lowercasing on both sides to eliminate casing errors
        clean_email = email.strip().lower()
        print(f"[Lookup Debug] Searching directory for email: '{clean_email}'")
        
        cur.execute(
            "SELECT display_name, clerk_id, email FROM users_directory WHERE LOWER(email) = %s;",
            (clean_email,)
        )
        row = cur.fetchone()
        cur.close()
        conn.close()

        if not row:
            # Crucial: Returning a clean 404 block instead of letting an empty fetch break the server
            print(f"[Lookup Alert] No account matches email: '{clean_email}'")
            raise HTTPException(status_code=404, detail="Friend not found in system directory.")

        print(f"[Lookup Success] Found linked profile: Name: {row[0]}, ID: {row[1]}")
        return {"success": True, "display_name": row[0], "clerk_id": row[1], "email": row[2]}
        
    except psycopg2.Error as db_err:
        print(f"[Lookup Database Crash]: {str(db_err)}")
        raise HTTPException(status_code=500, detail=f"Database operational error: {str(db_err)}")
    except Exception as e:
        print(f"[Lookup System Failure]: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/split-receipt")
async def split_receipt(request: Request):
    try:
        body = await request.json()
        items = body.get("items", [])
        participants = body.get("participants", []) # Contains dict format: {"clerk_id": str, "display_name": str}
        adjustment = float(body.get("adjustment", 0.0))

        if not participants:
            raise HTTPException(status_code=400, detail="Participants array required.")

        breakdown = {p["clerk_id"]: {"subtotal": 0.0, "adjustment_share": 0.0, "total": 0.0, "display_name": p["display_name"]} for p in participants}
        total_item_cost = 0.0

        for item in items:
            price = float(item.get("price", 0.0))
            assigned_ids = item.get("assignedToIds", [])
            
            if not assigned_ids:
                assigned_ids = [p["clerk_id"] for p in participants]

            total_item_cost += price
            split_share = price / len(assigned_ids)

            for uid in assigned_ids:
                if uid in breakdown:
                    breakdown[uid]["subtotal"] += split_share

        for uid, ledger in breakdown.items():
            if total_item_cost > 0:
                ledger["adjustment_share"] = adjustment * (ledger["subtotal"] / total_item_cost)
            else:
                ledger["adjustment_share"] = adjustment / len(participants)
                
            ledger["total"] = round(ledger["subtotal"] + ledger["adjustment_share"], 2)
            ledger["subtotal"] = round(ledger["subtotal"], 2)
            ledger["adjustment_share"] = round(ledger["adjustment_share"], 2)

        return {"success": True, "grand_total": round(total_item_cost + adjustment, 2), "breakdown": breakdown}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/save")
async def save_receipt(request: Request):
    try:
        body = await request.json()
        user_id = body.get("user_id")
        raw_text = body.get("raw_text")
        parsed_items = body.get("parsed_items", [])
        split_distribution = body.get("split_distribution", None) # Map of user_id -> bill breakdown details

        if not user_id or not raw_text:
            raise HTTPException(status_code=400, detail="Missing mandatory values.")

        conn = get_db()
        cur = conn.cursor()
        
        # 1. Insert Base Receipt Meta
        cur.execute(
            "INSERT INTO receipts (user_id, raw_text, parsed_items) VALUES (%s, %s, %s) RETURNING id;",
            (user_id, raw_text, json.dumps(parsed_items))
        )
        new_receipt_id = cur.fetchone()[0]

        # 2. Map Multi-party junction permissions
        if split_distribution:
            # Shared ledger split distribution mapping matrix
            for uid, bill in split_distribution.items():
                cur.execute(
                    "INSERT INTO receipt_shares (receipt_id, user_id, amount_owed, is_owner) VALUES (%s, %s, %s, %s);",
                    (new_receipt_id, uid, float(bill.get("total", 0.0)), uid == user_id)
                )
        else:
            # Standard single-user mapping fallback fallback
            estimated_total = sum(float(i.get("price", 0.0)) for i in parsed_items)
            cur.execute(
                "INSERT INTO receipt_shares (receipt_id, user_id, amount_owed, is_owner) VALUES (%s, %s, %s, %s);",
                (new_receipt_id, user_id, estimated_total, True)
            )

        conn.commit()
        cur.close()
        conn.close()
        return {"success": True, "receipt_id": new_receipt_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/receipts")
async def get_receipts(user_id: str):
    try:
        conn = get_db()
        cur = conn.cursor()
        # Apollo 11 Shared Junction query: Pulls receipts owned by user OR shared with user automatically!
        cur.execute(
            """
            SELECT r.id, r.raw_text, r.parsed_items, r.created_at, rs.amount_owed, rs.is_owner, u.display_name
            FROM receipts r
            JOIN receipt_shares rs ON r.id = rs.receipt_id
            JOIN users_directory u ON r.user_id = u.clerk_id
            WHERE rs.user_id = %s
            ORDER BY r.created_at DESC;
            """,
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
                "created_at": str(row[3]),
                "amount_owed": float(row[4]),
                "is_owner": row[5],
                "uploaded_by_name": row[6]
            })
        return {"receipts": receipts}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/spending-summary")
async def get_spending_summary(user_id: str, months: int = 6):
    try:
        conn = get_db()
        cur = conn.cursor()
        # Aggregates only what the specific user actually owes from shared records!
        cur.execute(
            """
            SELECT to_char(date_trunc('month', r.created_at), 'YYYY-MM') AS month,
                   COALESCE(elem->>'category', 'Other') AS category,
                   SUM((elem->>'price')::numeric) AS total
            FROM receipts r
            JOIN receipt_shares rs ON r.id = rs.receipt_id,
            jsonb_array_elements(r.parsed_items) AS elem
            WHERE rs.user_id = %s
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

        cur.execute(
            "SELECT SUM(amount_owed) FROM receipt_shares WHERE user_id = %s;", (user_id,)
        )
        overall_total_row = cur.fetchone()
        overall_total = float(overall_total_row[0]) if overall_total_row and overall_total_row[0] is not None else 0.0

        cur.execute(
            """
            SELECT COALESCE(elem->>'category', 'Other') AS category, SUM((elem->>'price')::numeric)
            FROM receipts r JOIN receipt_shares rs ON r.id = rs.receipt_id, jsonb_array_elements(r.parsed_items) AS elem
            WHERE rs.user_id = %s GROUP BY category;
            """, (user_id,)
        )
        cat_rows = cur.fetchall()
        by_category = { row[0]: float(row[1]) for row in cat_rows }

        cur.close()
        conn.close()

        anomalies = detect_spending_anomalies(monthly_list)

        return {
            'totals': { 'overall': round(overall_total, 2), 'by_category': {k: round(v, 2) for k, v in by_category.items()} },
            'monthly': monthly_list,
            'categories': sorted(list(categories_set)) or VALID_CATEGORIES,
            'anomalies': anomalies
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def preprocess_image(image: np.ndarray) -> np.ndarray:
    image = cv2.resize(image, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    filtered = cv2.bilateralFilter(gray, 9, 75, 75)
    thresh = cv2.adaptiveThreshold(filtered, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 15, 8)
    kernel = np.ones((2, 2), np.uint8)
    return cv2.dilate(thresh, kernel, iterations=1)

def classify_item_name(name: str) -> str:
    global vectorizer, classifier
    if not vectorizer or not classifier: return "Other"
    cleaned_name = name.lower().strip()
    merchant_rules = {"mcdonalds": "Food & Beverage", "starbucks": "Food & Beverage", "fairprice": "Groceries", "grab": "Transport"}
    for m, cat in merchant_rules.items():
        if m in cleaned_name: return cat
    if not any(w in vectorizer.vocabulary_ for w in cleaned_name.split()): return "LLM_FALLBACK"
    probs = classifier.predict_proba(vectorizer.transform([cleaned_name]))[0]
    idx = np.argmax(probs)
    return classifier.classes_[idx] if probs[idx] >= 0.22 else "LLM_FALLBACK"

def resolve_llm_fallback(items: list) -> list:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key: return ["Other"] * len(items)
    try:
        client = genai.Client(api_key=api_key)
        prompt = f"Categorize into: {', '.join(VALID_CATEGORIES)}\nItems:\n" + "\n".join(items) + "\nReturn JSON object: {'categories': [str]}"
        res = client.models.generate_content(model='gemini-2.5-flash', contents=prompt, config=types.GenerateContentConfig(response_mime_type="application/json", temperature=0.0))
        return json.loads(res.text).get("categories", ["Other"] * len(items))
    except: return ["Other"] * len(items)

def parse_receipt_items(raw_text: str) -> list:
    lines = raw_text.split('\n')
    items = []
    fallback_queue = []
    price_pattern = re.compile(r'\$?\d+[.,]\d{1,2}(?:\s*)$')
    skip_keywords = ['total', 'tax', 'gst', 'cash', 'visa', 'subtotal']

    for line in lines:
        line = line.strip()
        if not line or any(k in line.lower() for k in skip_keywords): continue
        cleaned = re.sub(r'^\d+[.,]\s*', '', line).strip()
        match = price_pattern.search(cleaned)
        if not match: continue
        try: price = float(match.group().strip().replace('$', '').replace(',', '.'))
        except: continue
        if price == 0.0: continue
        name = re.sub(r'[\.\-\s]+$', '', cleaned[:match.start()]).strip()
        if not name: continue
        cat = classify_item_name(name)
        if cat == "LLM_FALLBACK": fallback_queue.append(name)
        items.append({"name": name, "price": price, "category": cat, "raw_line": line})

    if fallback_queue:
        res_cats = resolve_llm_fallback(fallback_queue)
        f_idx = 0
        for i in items:
            if i["category"] == "LLM_FALLBACK":
                i["category"] = res_cats[f_idx] if f_idx < len(res_cats) else "Other"
                f_idx += 1
    return items

@app.post("/api/upload")
async def upload_receipt(file: UploadFile = File(...)):
    if not file.content_type.startswith("image/"): raise HTTPException(status_code=400, detail="Invalid image file.")
    try:
        img = cv2.imdecode(np.frombuffer(await file.read(), np.uint8), cv2.IMREAD_COLOR)
        if img is None: raise HTTPException(status_code=400, detail="Decode error.")
        txt = pytesseract.image_to_string(preprocess_image(img), config=r'--psm 6')
        return {"text": txt}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/parse")
async def parse_receipt(request: Request):
    body = await request.json()
    raw_text = body.get("raw_text")
    if not raw_text: raise HTTPException(status_code=400, detail="raw_text required.")
    return {"items": parse_receipt_items(raw_text)}