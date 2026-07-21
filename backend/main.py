import cv2
import numpy as np
import pytesseract
import psycopg2
import os
import re
import json
import statistics
import httpx
import asyncio
import io
from concurrent.futures import ThreadPoolExecutor
from fastapi import FastAPI, File, UploadFile, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from apscheduler.schedulers.background import BackgroundScheduler
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable

# Machine Learning & Google Gemini AI Imports
from dataset import TRAINING_DATA
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
from google import genai
from google.genai import types

load_dotenv()

if os.name == 'posix':
    pytesseract.pytesseract.tesseract_cmd = '/usr/bin/tesseract'

app = FastAPI(title="FinTrace API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://fintraceorbital.vercel.app"
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

_executor = ThreadPoolExecutor(max_workers=2)

class PreferenceRequest(BaseModel):
    user_id: str
    email_reports_enabled: bool

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

def automated_monthly_report_job():
    print(f"[{datetime.now()}] APScheduler background cron executing monthly opt-in report loop...")
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT clerk_id, email FROM users_directory WHERE email_reports_enabled = TRUE;")
        users = cur.fetchall()
        cur.close()
        conn.close()
        print(f"[Cron] Found {len(users)} users with reports enabled.")
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

    scheduler = BackgroundScheduler()
    scheduler.add_job(automated_monthly_report_job, trigger='cron', day='last', hour=23, minute=59)
    scheduler.start()
    print("APScheduler framework attached. Cron loop armed.")

@app.api_route("/", methods=["GET", "HEAD"])
def health_check():
    return JSONResponse({"status": "ok", "service": "FinTrace API"})

@app.get("/api/download-report")
async def download_report(user_id: str):
    try:
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
        cur.close()
        conn.close()

        monthly_map = {}
        category_totals = {}
        overall_total = 0.0

        for month, cat, total in rows:
            val = float(total)
            overall_total += val
            category_totals[cat] = category_totals.get(cat, 0.0) + val
            monthly_map.setdefault(month, {"month": month, "total": 0.0})
            monthly_map[month]["total"] += val

        monthly_list = sorted(monthly_map.values(), key=lambda x: x["month"])
        month_count = max(len(monthly_list), 1)
        avg_monthly = overall_total / month_count
        anomalies = detect_spending_anomalies(monthly_list)

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer, 
            pagesize=A4,
            rightMargin=18*mm, 
            leftMargin=18*mm,
            topMargin=18*mm, 
            bottomMargin=18*mm
        )

        elements = []

        # Color Palette
        PRIMARY_BLUE = colors.HexColor('#3b82f6')
        ACCENT_EMERALD = colors.HexColor('#10b981')
        TEXT_LIGHT = colors.HexColor('#f8fafc')
        TEXT_MUTED = colors.HexColor('#94a3b8')
        BG_DARK = colors.HexColor('#0f172a')
        CARD_BG = colors.HexColor('#1e293b')
        ROW_ALT = colors.HexColor('#111827')
        BORDER_COLOR = colors.HexColor('#334155')

        # Typography Styles
        title_style = ParagraphStyle('DocTitle', fontSize=22, fontName='Helvetica-Bold', textColor=PRIMARY_BLUE, spaceAfter=2)
        sub_style = ParagraphStyle('DocSub', fontSize=10, fontName='Helvetica', textColor=TEXT_MUTED, spaceAfter=14)
        section_style = ParagraphStyle('DocSection', fontSize=10, fontName='Helvetica-Bold', textColor=TEXT_MUTED, spaceBefore=14, spaceAfter=8)
        
        stat_label_style = ParagraphStyle('StatLabel', fontSize=8, fontName='Helvetica-Bold', textColor=TEXT_MUTED, alignment=1)
        stat_val_style = ParagraphStyle('StatVal', fontSize=15, fontName='Helvetica-Bold', textColor=TEXT_LIGHT, alignment=1)

        cell_text_left = ParagraphStyle('CellLeft', fontSize=9, fontName='Helvetica', textColor=colors.HexColor('#cbd5e1'))
        cell_text_bold = ParagraphStyle('CellBold', fontSize=9, fontName='Helvetica-Bold', textColor=TEXT_LIGHT)
        cell_text_right = ParagraphStyle('CellRight', fontSize=9, fontName='Helvetica-Bold', textColor=TEXT_LIGHT, alignment=2)
        cell_text_right_muted = ParagraphStyle('CellRightMuted', fontSize=9, fontName='Helvetica', textColor=TEXT_MUTED, alignment=2)

        # Header Section
        elements.append(Paragraph("FinTrace Insights", title_style))
        elements.append(Paragraph(f"Financial Fingerprint Statement — Generated {datetime.now().strftime('%b %d, %Y')}", sub_style))
        elements.append(HRFlowable(width="100%", thickness=1, color=BORDER_COLOR, spaceAfter=14))

        # Anomaly Alert Box
        if anomalies:
            alert_text = Paragraph(
                f"⚠️ <b>SPENDING SPIKE DETECTED:</b> In {anomalies[0]['month']}, total reached <b>${anomalies[0]['total']:.2f}</b> "
                f"(expected ~${anomalies[0]['expected_total']:.2f}).",
                ParagraphStyle('AlertMsg', fontSize=9.5, fontName='Helvetica', textColor=colors.HexColor('#fca5a5'))
            )
            alert_table = Table([[alert_text]], colWidths=[174*mm])
            alert_table.setStyle(TableStyle([
                ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#3f1313')),
                ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#ef4444')),
                ('TOPPADDING', (0,0), (-1,-1), 8),
                ('BOTTOMPADDING', (0,0), (-1,-1), 8),
                ('LEFTPADDING', (0,0), (-1,-1), 12),
                ('RIGHTPADDING', (0,0), (-1,-1), 12),
            ]))
            elements.append(alert_table)
            elements.append(Spacer(1, 10))

        # Overview Stats Cards
        elements.append(Paragraph("EXECUTIVE OVERVIEW", section_style))
        stat_data = [
            [Paragraph('TOTAL VOLUME', stat_label_style), Paragraph('MONTHLY AVERAGE', stat_label_style), Paragraph('ACTIVE WINDOWS', stat_label_style)],
            [Paragraph(f'${overall_total:.2f}', stat_val_style), Paragraph(f'${avg_monthly:.2f}', stat_val_style), Paragraph(f'{month_count} Mos', stat_val_style)],
        ]
        stat_table = Table(stat_data, colWidths=[58*mm, 58*mm, 58*mm])
        stat_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), BG_DARK),
            ('BACKGROUND', (0,1), (-1,1), CARD_BG),
            ('TOPPADDING', (0,0), (-1,-1), 8),
            ('BOTTOMPADDING', (0,0), (-1,-1), 8),
            ('GRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ]))
        elements.append(stat_table)
        elements.append(Spacer(1, 12))

        # Category Breakdown Table
        elements.append(Paragraph("SPENDING DISTRIBUTION BY CATEGORY", section_style))
        cat_data = [[
            Paragraph('Category', cell_text_bold), 
            Paragraph('Amount ($)', ParagraphStyle('THRight', fontSize=9, fontName='Helvetica-Bold', textColor=TEXT_MUTED, alignment=2)), 
            Paragraph('Share (%)', ParagraphStyle('THRight2', fontSize=9, fontName='Helvetica-Bold', textColor=TEXT_MUTED, alignment=2))
        ]]

        sorted_categories = sorted(category_totals.items(), key=lambda x: -x[1])
        for cat, val in sorted_categories:
            pct = (val / overall_total * 100) if overall_total > 0 else 0
            cat_data.append([
                Paragraph(cat, cell_text_left),
                Paragraph(f"${val:.2f}", cell_text_right),
                Paragraph(f"{pct:.1f}%", cell_text_right_muted)
            ])

        cat_table = Table(cat_data, colWidths=[94*mm, 40*mm, 40*mm])
        cat_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), BG_DARK),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [CARD_BG, ROW_ALT]),
            ('GRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
            ('TOPPADDING', (0,0), (-1,-1), 6),
            ('BOTTOMPADDING', (0,0), (-1,-1), 6),
            ('LEFTPADDING', (0,0), (-1,-1), 10),
            ('RIGHTPADDING', (0,0), (-1,-1), 10),
        ]))
        elements.append(cat_table)
        elements.append(Spacer(1, 12))

        # Monthly Breakdown Table
        if monthly_list:
            elements.append(Paragraph("HISTORICAL MONTHLY SUMMARY", section_style))
            month_data = [[
                Paragraph('Month', cell_text_bold), 
                Paragraph('Total Spent ($)', ParagraphStyle('THRight3', fontSize=9, fontName='Helvetica-Bold', textColor=TEXT_MUTED, alignment=2))
            ]]
            for m in monthly_list:
                month_data.append([
                    Paragraph(m['month'], cell_text_left),
                    Paragraph(f"${m['total']:.2f}", cell_text_right)
                ])

            month_table = Table(month_data, colWidths=[87*mm, 87*mm])
            month_table.setStyle(TableStyle([
                ('BACKGROUND', (0,0), (-1,0), BG_DARK),
                ('ROWBACKGROUNDS', (0,1), (-1,-1), [CARD_BG, ROW_ALT]),
                ('GRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
                ('TOPPADDING', (0,0), (-1,-1), 6),
                ('BOTTOMPADDING', (0,0), (-1,-1), 6),
                ('LEFTPADDING', (0,0), (-1,-1), 10),
                ('RIGHTPADDING', (0,0), (-1,-1), 10),
            ]))
            elements.append(month_table)

        # Footer
        elements.append(Spacer(1, 20))
        elements.append(HRFlowable(width="100%", thickness=1, color=BORDER_COLOR, spaceAfter=8))
        elements.append(Paragraph(
            "FinTrace Intelligence Engine · NUS Orbital 2026 Platform Instance",
            ParagraphStyle('DocFooter', fontSize=8, textColor=TEXT_MUTED, fontName='Helvetica', alignment=1)
        ))

        doc.build(elements)
        buffer.seek(0)

        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=fintrace-financial-report.pdf"}
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/update-preference")
async def update_preference(payload: PreferenceRequest):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("UPDATE users_directory SET email_reports_enabled = %s WHERE clerk_id = %s;",
                    (payload.email_reports_enabled, payload.user_id))
        conn.commit()
        cur.close()
        conn.close()
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

        breakdown = {p["clerk_id"]: {"subtotal": 0.0, "adjustment_share": 0.0, "total": 0.0,
                                      "display_name": p["display_name"]} for p in participants}
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
                "id": row[0], "raw_text": row[1], "parsed_items": row[2] or [],
                "created_at": str(row[3]), "amount_owed": float(row[4]),
                "is_owner": row[5], "uploaded_by_name": row[6]
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
            monthly.setdefault(month, {'total': 0.0, 'by_category': {}})
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
        by_category = {row[0]: float(row[1]) for row in cat_rows}

        cur.close()
        conn.close()

        anomalies = detect_spending_anomalies(monthly_list)

        return {
            'totals': {'overall': round(overall_total, 2),
                       'by_category': {k: round(v, 2) for k, v in by_category.items()}},
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
    thresh = cv2.adaptiveThreshold(filtered, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                   cv2.THRESH_BINARY, 15, 8)
    kernel = np.ones((2, 2), np.uint8)
    return cv2.dilate(thresh, kernel, iterations=1)

def classify_item_name(name: str) -> str:
    global vectorizer, classifier
    if not vectorizer or not classifier: return "Other"
    cleaned_name = name.lower().strip()
    merchant_rules = {
        "mcdonalds": "Food & Beverage", "starbucks": "Food & Beverage",
        "fairprice": "Groceries", "grab": "Transport"
    }
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
        prompt = (f"Categorize into: {', '.join(VALID_CATEGORIES)}\nItems:\n" +
                  "\n".join(items) + "\nReturn JSON object: {'categories': [str]}")
        res = client.models.generate_content(
            model='gemini-2.5-flash', contents=prompt,
            config=types.GenerateContentConfig(response_mime_type="application/json", temperature=0.0)
        )
        return json.loads(res.text).get("categories", ["Other"] * len(items))
    except:
        return ["Other"] * len(items)

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
        try:
            price = float(match.group().strip().replace('$', '').replace(',', '.'))
        except:
            continue
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
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Invalid image file.")
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