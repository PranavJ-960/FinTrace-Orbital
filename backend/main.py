import cv2
import numpy as np
import pytesseract
import psycopg2
import os
import re
import json
import statistics
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from fastapi import FastAPI, File, UploadFile, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from apscheduler.schedulers.background import BackgroundScheduler
from datetime import datetime

# Machine Learning & Google Gemini AI Imports
from dataset import TRAINING_DATA
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
from google import genai
from google.genai import types

load_dotenv()

if os.name == 'posix':  # This means it's running on Linux/Docker (Render)
    pytesseract.pytesseract.tesseract_cmd = '/usr/bin/tesseract'

# pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

app = FastAPI(title="FinTrace API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", 
        "http://127.0.0.1:5173", 
        "https://fintraceorbital.vercel.app"  # <-- Removed the "/" at the end!
    ],
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

# Pydantic Validation Models for Post Routes
class ReportRequest(BaseModel):
    user_id: str

class PreferenceRequest(BaseModel):
    user_id: str
    email_reports_enabled: bool

HTML_REPORT_TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>FinTrace Financial Fingerprint Report</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #020817; color: #f1f5f9; margin: 0; padding: 20px; }}
        .container {{ max-width: 600px; margin: 0 auto; background: #0f172a; border: 1px solid #1e293b; border-radius: 12px; padding: 24px; }}
        .header {{ border-bottom: 1px solid #1e293b; padding-bottom: 16px; margin-bottom: 20px; }}
        .title {{ color: #3b82f6; font-size: 24px; font-weight: 700; margin: 0; }}
        .subtitle {{ color: #64748b; font-size: 14px; margin: 4px 0 0 0; }}
        .stat-grid {{ width: 100%; margin-bottom: 20px; }}
        .stat-card {{ background: #1e293b; padding: 14px; border-radius: 8px; text-align: center; }}
        .stat-label {{ font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600; margin-bottom: 4px; }}
        .stat-value {{ font-size: 18px; font-weight: 700; color: #f1f5f9; }}
        .section-title {{ font-size: 15px; font-weight: 600; color: #94a3b8; margin: 20px 0 10px 0; border-bottom: 1px solid #1e293b; padding-bottom: 4px; }}
        .anomaly-alert {{ background: rgba(239, 68, 68, 0.1); border: 1px solid #ef4444; border-radius: 8px; padding: 12px; margin-bottom: 16px; }}
        .anomaly-title {{ color: #fca5a5; font-size: 13px; font-weight: 700; margin-bottom: 4px; }}
        .item-table {{ width: 100%; border-collapse: collapse; margin-top: 10px; }}
        .item-row td {{ padding: 10px; border-bottom: 1px solid #1e293b; font-size: 13px; }}
        .item-name {{ color: #cbd5e1; }}
        .item-val {{ text-align: right; color: #f1f5f9; font-weight: 600; }}
        .footer {{ text-align: center; font-size: 11px; color: #475569; margin-top: 24px; padding-top: 12px; border-top: 1px solid #1e293b; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 class="title">FinTrace Insights</h1>
            <p class="subtitle">Your Personalized Financial Fingerprint Report</p>
        </div>
        {anomaly_block}
        <table class="stat-grid" cellspacing="8">
            <tr>
                <td class="stat-card"><div class="stat-label">Total Volume</div><div class="stat-value">${overall_total:.2f}</div></td>
                <td class="stat-card"><div class="stat-label">Monthly Average</div><div class="stat-value">${monthly_avg:.2f}</div></td>
                <td class="stat-card"><div class="stat-label">Active Windows</div><div class="stat-value">{month_count} Mos</div></td>
            </tr>
        </table>
        <div class="section-title">Spending Distributions by Category</div>
        <table class="item-table">{category_rows}</table>
        <div class="footer">Sent automatically via your FinTrace Instance Architecture.<br>NUS Orbital 2026</div>
    </div>
</body>
</html>
"""

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

        z_score = (total - mean_total) / std_dev if std_dev > 0 else 0.0
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
        database=os.getenv("DB_NAME", "postgres"),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD", ""),
        port=os.getenv("DB_PORT", 5432)
    )

def send_report_email(recipient_email: str, html_content: str):
    smtp_server   = os.getenv("SMTP_SERVER", "smtp.gmail.com")
    smtp_port     = int(os.getenv("SMTP_PORT", 465))
    smtp_user     = os.getenv("SMTP_USER")
    smtp_password = os.getenv("SMTP_PASSWORD")

    if not smtp_user or not smtp_password:
        print("[Email Error] Missing SMTP_USER or SMTP_PASSWORD in .env")
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "FinTrace — Your Financial Fingerprint Report"
        msg["From"]    = f"FinTrace <{smtp_user}>"
        msg["To"]      = recipient_email
        msg.attach(MIMEText(html_content, "html"))

        with smtplib.SMTP_SSL(smtp_server, smtp_port) as server:
            server.login(smtp_user, smtp_password)
            server.sendmail(smtp_user, recipient_email, msg.as_string())

        print(f"[Email Sent] Report dispatched to {recipient_email}")
        return True

    except Exception as e:
        print(f"[Email Error] {str(e)}")
        return False

def compile_and_send_report_for_user(user_id: str, recipient_email: str):
    conn = get_db()
    cur = conn.cursor()
    
    cur.execute("""
        SELECT to_char(date_trunc('month', r.created_at), 'YYYY-MM') AS month,
               COALESCE(elem->>'category', 'Other') AS category,
               SUM((elem->>'price')::numeric) AS total
        FROM receipts r
        JOIN receipt_shares rs ON r.id = rs.receipt_id,
        jsonb_array_elements(r.parsed_items) AS elem
        WHERE rs.user_id = %s
        GROUP BY month, category
        ORDER BY month;
    """, (user_id,))
    rows = cur.fetchall()

    monthly_map = {}
    category_totals = {}
    overall_total = 0.0

    for month, cat, total in rows:
        val = float(total)
        overall_total += val
        category_totals[cat] = category_totals.get(cat, 0.0) + val
        monthly_map.setdefault(month, {"month": month, "total": 0.0})
        monthly_map[month]["total"] += val

    monthly_list = sorted(list(monthly_map.values()), key=lambda x: x["month"])
    anomalies = detect_spending_anomalies(monthly_list)

    anomaly_block = ""
    if anomalies:
        anomaly_block = f"""
        <div class="anomaly-alert">
            <div class="anomaly-title">⚠️ SPENDING SPIKE DETECTED</div>
            <p style="margin: 0; font-size: 13px; color: #cbd5e1;">
                In <strong>{anomalies[0]['month']}</strong>, spending hit <strong>${anomalies[0]['total']:.2f}</strong>.
            </p>
        </div>
        """

    category_rows = ""
    for cat in sorted(category_totals.keys()):
        category_rows += f"""
        <tr class="item-row">
            <td class="item-name">{cat}</td>
            <td class="item-val">${category_totals[cat]:.2f}</td>
        </tr>
        """

    month_count = max(len(monthly_list), 1)
    compiled_html = HTML_REPORT_TEMPLATE.format(
        anomaly_block=anomaly_block,
        overall_total=overall_total,
        monthly_avg=overall_total / month_count,
        month_count=month_count,
        category_rows=category_rows
    )

    cur.close()
    conn.close()
    return send_report_email(recipient_email, compiled_html)

def automated_monthly_report_job():
    print(f"[{datetime.now()}] APScheduler background cron executing monthly opt-in report loop...")
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT clerk_id, email FROM users_directory WHERE email_reports_enabled = TRUE;")
        users = cur.fetchall()
        cur.close()
        conn.close()
        
        for uid, email in users:
            print(f"Sending automated report summary to verified profile link: {email}")
            compile_and_send_report_for_user(uid, email)
    except Exception as e:
        print(f"[Automation Cron Pipeline Failure]: {str(e)}")

@app.on_event("startup")
def startup_pipeline():
    conn = get_db()
    cur = conn.cursor()
    
    cur.execute("""
        CREATE TABLE IF NOT EXISTS receipts (
            id SERIAL PRIMARY KEY, user_id TEXT NOT NULL, raw_text TEXT NOT NULL,
            parsed_items JSONB, created_at TIMESTAMP DEFAULT NOW()
        );
    """)
    
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users_directory (
            clerk_id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
            email_reports_enabled BOOLEAN DEFAULT FALSE
        );
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS receipt_shares (
            id SERIAL PRIMARY KEY, receipt_id INTEGER REFERENCES receipts(id) ON DELETE CASCADE,
            user_id TEXT NOT NULL, amount_owed NUMERIC(10, 2) DEFAULT 0.00, is_owner BOOLEAN DEFAULT FALSE
        );
    """)
    
    conn.commit()
    cur.close()
    conn.close()
    print("Database collaborative structures verified.")

    global vectorizer, classifier
    texts = [item[0] for item in TRAINING_DATA]
    categories = [item[1] for item in TRAINING_DATA]
    
    vectorizer = TfidfVectorizer(lowercase=True, stop_words='english')
    X_train = vectorizer.fit_transform(texts)
    
    classifier = MultinomialNB()
    classifier.fit(X_train, categories)
    print("Categorization Machine Learning model successfully trained.")

    # Initialize task scheduler system loop
    scheduler = BackgroundScheduler()
    scheduler.add_job(automated_monthly_report_job, trigger='cron', day='last', hour=23, minute=59)
    scheduler.start()
    print("APScheduler framework attached. Cron loop armed.")

@app.post("/api/update-preference")
async def update_preference(payload: PreferenceRequest):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("UPDATE users_directory SET email_reports_enabled = %s WHERE clerk_id = %s;", (payload.email_reports_enabled, payload.user_id))
        conn.commit()
        cur.close()
        conn.close()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/request-report")
async def request_report(payload: ReportRequest):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT email FROM users_directory WHERE clerk_id = %s;", (payload.user_id,))
        row = cur.fetchone()
        cur.close()
        conn.close()
        if not row:
            raise HTTPException(status_code=404, detail="User account signature entry missing.")
        
        success = compile_and_send_report_for_user(payload.user_id, row[0])
        if not success:
            raise HTTPException(status_code=500, detail="Mail node failed.")
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
        clean_email = email.strip().lower()
        
        cur.execute(
            "SELECT display_name, clerk_id, email FROM users_directory WHERE LOWER(email) = %s;",
            (clean_email,)
        )
        row = cur.fetchone()
        cur.close()
        conn.close()

        if not row:
            raise HTTPException(status_code=404, detail="Friend not found in system directory.")

        return {"success": True, "display_name": row[0], "clerk_id": row[1], "email": row[2]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/split-receipt")
async def split_receipt(request: Request):
    try:
        body = await request.json()
        items = body.get("items", [])
        participants = body.get("participants", [])
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
        split_distribution = body.get("split_distribution", None)

        if not user_id or not raw_text:
            raise HTTPException(status_code=400, detail="Missing mandatory values.")

        conn = get_db()
        cur = conn.cursor()
        
        cur.execute(
            "INSERT INTO receipts (user_id, raw_text, parsed_items) VALUES (%s, %s, %s) RETURNING id;",
            (user_id, raw_text, json.dumps(parsed_items))
        )
        new_receipt_id = cur.fetchone()[0]

        if split_distribution:
            for uid, bill in split_distribution.items():
                cur.execute(
                    "INSERT INTO receipt_shares (receipt_id, user_id, amount_owed, is_owner) VALUES (%s, %s, %s, %s);",
                    (new_receipt_id, uid, float(bill.get("total", 0.0)), uid == user_id)
                )
        else:
            estimated_total = sum(float(i.get("price", 0.0)) for i in parsed_items)
            cur.execute(
                "INSERT INTO receipt_shares (receipt_id, user_id, amount_owed, is_owner) VALUES (%s, %s, %s, %s);",
                (new_receipt_id, user_id, estimated_total, True)
            )

        conn.commit()
        cur.close()
        conn.close()
        return {"success": True, "receipt_id": new_receipt_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/receipts")
async def get_receipts(user_id: str):
    try:
        conn = get_db()
        cur = conn.cursor()
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
                "id": row[0], "raw_text": row[1], "parsed_items": row[2] or [], "created_at": str(row[3]),
                "amount_owed": float(row[4]), "is_owner": row[5], "uploaded_by_name": row[6]
            })
        return {"receipts": receipts}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/spending-summary")
async def get_spending_summary(user_id: str, months: int = 6):
    try:
        conn = get_db()
        cur = conn.cursor()
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
                'month': m, 'total': round(monthly[m]['total'], 2),
                'by_category': {k: round(v, 2) for k, v in monthly[m]['by_category'].items()}
            })

        cur.execute("SELECT SUM(amount_owed) FROM receipt_shares WHERE user_id = %s;", (user_id,))
        overall_total_row = cur.fetchone()
        overall_total = float(overall_total_row[0]) if overall_total_row and overall_total_row[0] is not None else 0.0

        cur.execute(
            """
            SELECT COALESCE(elem->>'category', 'Other') AS category, SUM((elem->>'price')::numeric)
            FROM receipts r JOIN receipt_shares rs ON r.id = rs.receipt_id,
            jsonb_array_elements(r.parsed_items) AS elem
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
        prompt = f"Categorize into: {', '.join(VALID_CATEGORIES)}\nItems:\n" + "\n".join(items) + "\nReturn JSON object: {{'categories': [str]}}"
        res = client.models.generate_content(model='gemini-2.5-flash', contents=prompt, config=types.GenerateContentConfig(response_mime_type="application/json", temperature=0.0))
        return json.loads(res.text).get("categories", ["Other"] * len(items))
    except: return ["Other"] * len(items)

def parse_receipt_items(raw_text: str) -> list:
    lines = raw_text.split('\n')
    items = []
    fallback_queue = []
    price_pattern = re.compile(r'\$?\d+[.,]\d{1,2}(?:\s*)$')
 
    skip_keywords = ['total', 'tax', 'gst', 'cash', 'visa', 'subtotal', 'change', 'nets', 'received', 'due']
    
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
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/parse")
async def parse_receipt(request: Request):
    body = await request.json()
    raw_text = body.get("raw_text")
    if not raw_text: raise HTTPException(status_code=400, detail="raw_text required.")
    return {"items": parse_receipt_items(raw_text)}