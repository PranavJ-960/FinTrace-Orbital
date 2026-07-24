# FinTrace — Receipt Intelligence & Financial Tracking Web System

**NUS Orbital 2026 Project Submission (Apollo 11 Level of Achievement)**

| | |
|---|---|
| **Team Name** | FinTrace |
| **Repository** | [github.com/PranavJ-960/FinTrace-Orbital](https://github.com/PranavJ-960/FinTrace-Orbital) |
| **Live Production Platform** | [fintraceorbital.vercel.app](https://fintraceorbital.vercel.app) |
| **Team Members** | Pranav Jagatheeswaran (A0325298U), Euan Luke Tan (A0325322R) |

---

## 📋 Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Motivation & Problem Statement](#2-motivation--problem-statement)
3. [Project Aim & Core Objectives](#3-project-aim--core-objectives)
4. [Core Features & Extension Features](#4-core-features--extension-features)
   - 4.1 [Core Features (Milestone 1–2)](#41-core-features-milestone-12)
   - 4.2 [Extension Features (Milestone 3)](#42-extension-features-milestone-3)
5. [Explicit User Roles & Permission Hierarchy](#5-explicit-user-roles--permission-hierarchy)
6. [User Stories](#6-user-stories)
7. [Functional & Non-Functional Requirements](#7-functional--non-functional-requirements)
8. [System Architecture & High-Level Design](#8-system-architecture--high-level-design)
9. [Database Schema & UML Design Diagrams](#9-database-schema--uml-design-diagrams)
   - 9.1 [Entity-Relationship (ER) Diagram](#91-entity-relationship-er-diagram)
   - 9.2 [System Class Diagram](#92-system-class-diagram)
   - 9.3 [End-to-End Sequence Diagram](#93-end-to-end-sequence-diagram)
10. [Technology Stack & Architectural Rationale](#10-technology-stack--architectural-rationale)
11. [Core Subsystem Implementations](#11-core-subsystem-implementations)
    - 11.1 [OpenCV Image Preprocessing & Tesseract OCR Pipeline](#111-opencv-image-preprocessing--tesseract-ocr-pipeline)
    - 11.2 [Structured Regex Parsing & Line Filtering Engine](#112-structured-regex-parsing--line-filtering-engine)
    - 11.3 [Hybrid Categorization Engine](#113-hybrid-categorization-engine-rules--tf-idf-naive-bayes--gemini-fallback)
    - 11.4 [Proportional Bill-Splitting & Extra Charge Distribution](#114-proportional-bill-splitting--extra-charge-distribution-matrix)
    - 11.5 [Z-Score Statistical Anomaly Detection Engine](#115-z-score-statistical-anomaly-detection-engine)
12. [New Features Implemented Post-Peer Feedback](#12-new-features-implemented-post-peer-feedback)
    - 12.1 [Manual Receipt Text Entry & Raw Editing Drawer](#121-manual-receipt-text-entry--raw-editing-drawer)
    - 12.2 [Batch History Deletion & Ownership Protection Flow](#122-batch-history-deletion--ownership-protection-flow)
    - 12.3 [Downloadable Financial Fingerprint PDF Report Engine](#123-downloadable-financial-fingerprint-pdf-report-engine)
13. [User Interface & User Experience (UI/UX) Showcase](#13-user-interface--user-experience-uiux-showcase)
14. [Testing Strategy, Evaluation & Analytics](#14-testing-strategy-evaluation--analytics)
    - 14.1 [Automated Backend Testing Suite (pytest)](#141-automated-backend-testing-suite-pytest)
    - 14.2 [User Testing Methodology & Task Metrics](#142-user-testing-methodology--task-metrics)
    - 14.3 [System Usability Scale (SUS) Results](#143-system-usability-scale-sus-results--evaluation-analysis)
15. [Engineering Challenges & Technical Decision Log](#15-engineering-challenges--technical-decision-log)
    - 15.1 [Render SMTP Blocking vs. Downloadable PDF Generation](#151-render-smtp-blocking-vs-downloadable-pdf-generation)
    - 15.2 [OCR Preprocessing Optimizations for Thermal Paper](#152-ocr-preprocessing-optimizations-for-low-quality-thermal-paper)
    - 15.3 [CORS Protocols & Multi-Environment Configuration](#153-cors-protocols--multi-environment-configuration)
16. [Software Engineering Practices & Code Quality](#16-software-engineering-practices--code-quality)
17. [Complete REST API Reference](#17-complete-rest-api-reference)
18. [Setup, Local Installation & Deployment Guide](#18-setup-local-installation--deployment-guide)
19. [Project Structure & Repository Layout](#19-project-structure--repository-layout)
20. [Milestone Progress, Timeline & Future Roadmap](#20-milestone-progress-development-timeline--future-roadmap)
21. [References & Acknowledgments](#21-references--acknowledgments)
22. [Project Log](#22-project-log)
---

## 1. Executive Summary

FinTrace is an enterprise-grade, full-stack receipt intelligence web application designed to automate personal expense logging, bill-splitting, and financial analytical reporting. Developed for the NUS Orbital 2026 programme under the Apollo 11 Level of Achievement, FinTrace addresses the widespread friction of manual expense entry by converting raw receipt images into structured, categorised relational database records.

The platform integrates a multi-stage OpenCV image enhancement engine, Tesseract OCR, a hybrid three-tier machine learning classification system (combining merchant rule sets, TF-IDF + Naive Bayes, and Google Gemini 2.5 Flash LLM fallbacks), interactive Recharts dashboard analytics, an exact proportional bill-splitting algorithm, statistical Z-score anomaly detection, and an automated PDF report generation service.

```
                ┌───────────────────────────────────────────────────────────────────────────────────┐
                │                          FINTRACE PIPELINE OVERVIEW                               │
                │                                                                                   │
                │  [Raw Image] → [OpenCV Preprocessing] → [Tesseract OCR] → [Regex Parser]          │
                │                                                              │                    │
                │                                                              ▼                    │
                │                                                     [Hybrid Classification]       │
                │                                                              │                    │
                │                                                              ▼                    │
                │  [PDF Summary] ← [Analytics Dashboard] ← [PostgreSQL DB] ← [Save & Split Engine]  │
                └───────────────────────────────────────────────────────────────────────────────────┘
```

*Figure 1. High-level FinTrace processing pipeline, from raw image capture to persisted, categorised financial records.*

![App Overview](docs/images/app-overview.png)
*Figure 2. FinTrace landing dashboard on first load.*

---

## 2. Motivation & Problem Statement

### 2.1 Motivation

As university students transitioning toward complete financial independence, managing daily expenses is a critical yet tedious responsibility. In Singapore, young adults frequently collect paper receipts from hawker centres, supermarkets (e.g. NTUC FairPrice), food courts (e.g. Kopitiam), and convenience stores. However, maintaining a manual financial log via spreadsheet software or traditional budgeting applications requires significant effort, leading to high drop-off rates.

### 2.2 Problem Statement

| # | Problem | Description |
|---|---------|--------------|
| 1 | **High Manual Data Entry Overhead** | Existing personal finance tools force users to type out merchant names, item costs, dates, and categories manually, creating friction. |
| 2 | **Incompatibility with Localised Singapore Receipts** | Western-centric receipt scanning applications fail to parse localised item abbreviations, mixed-language lines, and SGD currency structures common in Singapore retail and F&B sectors. |
| 3 | **Low-Quality Thermal Paper Receipts** | Receipts printed on thermal paper fade easily, suffer from light reflections, wrinkle in pockets, or feature faint fonts, rendering standard OCR engines inaccurate. |
| 4 | **Complexity in Shared Expense Distribution** | Splitting a restaurant bill with peers often involves manual calculations for item ownership, GST (9%), service charges (10%), and discounts. |

---

## 3. Project Aim & Core Objectives

FinTrace provides a seamless end-to-end receipt extraction and expense management system tailored for real-world usage in Singapore.

| # | Objective | Description |
|---|-----------|--------------|
| 1 | **Automated Extraction** | Convert raw, noisy receipt photos into text via computer vision. |
| 2 | **Structured Parsing** | Extract item names, individual prices, and tax adjustments using regex. |
| 3 | **Hybrid Classification** | Categorise items accurately using ML and LLM fallback engines. |
| 4 | **Expense Analytics** | Render real-time visual dashboards showing category spending trends. |
| 5 | **Statistical Alerts** | Flag spending anomalies automatically using mathematical standard deviation. |
| 6 | **Collaborative Split** | Divide shared bill items among linked users with exact tax scaling. |

---

## 4. Core Features & Extension Features

FinTrace's feature set is split into **Core Features**, delivered across Milestones 1–2, and **Extension Features**, added in Milestone 3 to extend the platform beyond a single-user OCR proof of concept into a full collaborative financial tool. This mirrors the project's actual development trajectory and reflects the scope agreed on for the Apollo 11 level of achievement.

### 4.1 Core Features (Milestone 1–2)

| # | Feature | Status | Summary |
|---|---------|--------|---------|
| 1 | **Receipt Upload & Image Preprocessing** | ✅ Complete | Users upload a receipt photo via the React frontend. The backend runs it through a multi-stage OpenCV pipeline (2× scaling, grayscale conversion, bilateral filtering, adaptive thresholding, morphological dilation) before OCR, to handle angled photos, uneven lighting, and thermal-paper fading. See [Section 11.1](#111-opencv-image-preprocessing--tesseract-ocr-pipeline). |
| 2 | **Item Extraction & Text Parsing** | ✅ Complete | A rule-based parser (`POST /api/parse`) extracts structured line items from raw OCR text using price-pattern regex, skip-keyword line filtering, and name trimming. See [Section 11.2](#112-structured-regex-parsing--line-filtering-engine). |
| 3 | **Item Categorisation Pipeline** | ✅ Complete | A three-layer hybrid pipeline — merchant keyword rules, a TF-IDF + Naive Bayes classifier, and a Google Gemini LLM fallback for low-confidence items — assigns each item to one of 10 spending categories. See [Section 11.3](#113-hybrid-categorization-engine-rules--tf-idf-naive-bayes--gemini-fallback). |
| 4 | **Spending Dashboard** | ✅ Complete | A Recharts-powered `SpendingDashboard` component visualises category share (pie chart) and monthly trends (line/stacked chart), fed by `GET /api/spending-summary`. |
| 5 | **User Accounts & Receipt History** | ✅ Complete | Clerk-based JWT authentication secures sign-in, and PostgreSQL stores each user's raw OCR text and parsed items, retrievable via `GET /api/receipts`. |
| 6 | **Manual Entry & Correction Interface** | ✅ Complete | An editable textarea lets users correct OCR mistakes, fix misread prices, or remove noisy lines before saving, so the system remains usable even when OCR accuracy is imperfect. |

### 4.2 Extension Features (Milestone 3)

| # | Feature | Status | Summary |
|---|---------|--------|---------|
| 7 | **Statistical Anomaly Detection** | ✅ Complete | Population Z-scores and month-over-month deviation percentages flag unusual spending spikes against a user's historical average, surfaced as alert banners on the dashboard. See [Section 11.5](#115-z-score-statistical-anomaly-detection-engine). |
| 8 | **Receipt / Bill Splitting** | ✅ Complete | Items can be assigned to specific participants, with service charges, GST, and other adjustments distributed proportionally to each person's subtotal via `POST /api/split-receipt`. See [Section 11.4](#114-proportional-bill-splitting--extra-charge-distribution-matrix). |
| 9 | **Financial Fingerprint Report** | ✅ Complete | Originally scoped as an emailed monthly summary; re-implemented as an on-demand, downloadable PDF report (ReportLab) after Render's SMTP port restrictions made outbound email infeasible on the free tier. See [Section 15.1](#151-render-smtp-blocking-vs-downloadable-pdf-generation) and [Section 12.3](#123-downloadable-financial-fingerprint-pdf-report-engine). |

Two further items were added directly in response to peer/user-testing feedback rather than being part of the original Milestone 3 scope — **batch receipt history deletion** and **manual receipt typing without a photo upload** — detailed in [Section 12](#12-new-features-implemented-post-peer-feedback).

---

## 5. Explicit User Roles & Permission Hierarchy

To maintain data security, transactional isolation, and operational integrity, FinTrace defines three user roles within its relational database and API routing architecture.

```
                                    ┌──────────────────────────────────────────────┐
                                    │               GUEST / PUBLIC                 │
                                    │   - Unauthenticated browser visitor          │
                                    │   - Read access: landing page & docs only    │
                                    └──────────────────────┬───────────────────────┘
                                                            │
                                                            ▼
                                    ┌──────────────────────────────────────────────┐
                                    │             REGISTERED MEMBER                │
                                    │   - Authenticated via Clerk JWT              │
                                    │   - Full access: upload, parse, analytics    │
                                    └──────────────────────┬───────────────────────┘
                                                            │
                                                            ▼
                                    ┌──────────────────────────────────────────────┐
                                    │         COLLABORATIVE PEER (FRIEND)          │
                                    │   - Linked to shared receipts via directory  │
                                    │   - Read/split access to shared records      │
                                    └──────────────────────────────────────────────┘
```
*Figure 3. FinTrace's three-tier user role hierarchy.*

| User Role | Identification Mechanism | Access Level | Functional Privileges & Scope Boundaries |
|---|---|---|---|
| **Guest / Public** | Unauthenticated HTTP request | Read-only | May access public landing pages, setup documentation, and login portals. Blocked from triggering backend OCR processing, invoking Gemini LLM endpoints, or viewing stored records. |
| **Registered Member** | Validated Clerk OAuth session / bearer token | Full user level | Can upload receipt photos, trigger OCR pipelines, execute manual text entry, modify item details, store records in PostgreSQL, view personal spending dashboards, delete owned receipts, and download financial reports. |
| **Collaborative Peer** | Looked up via `users_directory` by email | Shared item level | Can be added into bill-splitting sessions by a receipt owner. Receives shared balance updates in their personal dashboard and history view. Cannot edit or delete receipts owned by other members. |

---

## 6. User Stories

```
[User Story 1: Student]      → "Upload receipt photo"         → [Auto Extraction & Classification]
[User Story 2: Frugal User]  → "View monthly dashboard"        → [Recharts Category Visual Analytics]
[User Story 3: Alert User]   → "Flag unusual spending"         → [Z-Score Mathematical Alerts]
[User Story 4: Group Peer]   → "Split bill with friends"       → [Proportional Extra Charge Allocation]
[User Story 5: Faded Paper]  → "Type receipt manually"         → [Direct Text-to-JSON Parsing Engine]
[User Story 6: Power User]   → "Batch select & delete"         → [Ownership-Protected Bulk Purge]
```

- **As a student** managing a monthly allowance, I want to upload receipt photos from hawker stalls and stores, so that my expenses are recorded automatically without typing.
- **As a user** reviewing my monthly budget, I want to see visual category breakdowns (Food, Groceries, Transport), so that I can identify areas to reduce spending.
- **As a user** monitoring unexpected financial spikes, I want to receive automated alerts when monthly category totals deviate from historical averages, so that I can manage overspending early.
- **As a peer** dining out with friends, I want to assign individual items to specific participants and split tax/service charges proportionally, so that everyone pays fairly.
- **As a user** holding a crumpled or faded thermal receipt, I want an interface to manually type or edit raw receipt lines, so that my expense records remain accurate even when OCR fails.
- **As a power user** maintaining database cleanliness, I want to batch-select and bulk-delete old receipts from my history, so that my personal spending dashboard remains relevant and clutter-free.
- **As a user** reviewing personal finances offline, I want to export my spending history as a PDF report, so that I can archive my financial records.

---

## 7. Functional & Non-Functional Requirements

### 7.1 Functional Requirements

| Module | Functional Specification |
|---|---|
| **Authentication** | Authenticate users securely via Clerk OAuth / JWT. |
| **Vision Pipeline** | Accept image files (PNG, JPG, WebP) and execute OpenCV preprocessing. |
| **OCR Text Extraction** | Convert processed image binaries into string data using Tesseract. |
| **Parsing Engine** | Extract item names, filter non-item lines, and parse price formats. |
| **Categorisation** | Assign items to 10 categories using ML and Gemini fallback. |
| **Bill Splitting** | Calculate individual balances including proportional tax scaling. |
| **History & Deletion** | Store receipts in PostgreSQL and support bulk deletion. |
| **Report Generation** | Render styled PDF statements using ReportLab. |

### 7.2 Non-Functional Requirements

| Requirement | Target |
|---|---|
| **Performance** | End-to-end receipt scanning, OCR processing, and categorisation must complete in ≤ 3.5 seconds under standard network conditions. |
| **OCR Extraction Accuracy** | The vision preprocessing pipeline must improve raw character recognition on faded thermal receipts by ≥ 35% compared to raw, unprocessed Tesseract passes. |
| **Security & Isolation** | PostgreSQL queries must enforce user identification filters to prevent cross-account data leaks. |
| **Scalability** | The backend must handle async concurrent processing via `ThreadPoolExecutor` workers. |
| **Usability** | The web application must maintain an overall System Usability Scale (SUS) rating exceeding 80.0 points. |

---

## 8. System Architecture & High-Level Design

FinTrace utilises a decoupled three-tier client-server architecture.

```
                    ┌─────────────────────────────────────────────────────────────────────────────────┐
                    │                         PRESENTATION TIER (Frontend)                            │
                    │              React 18 (TypeScript) + Vite + Clerk Auth + Recharts               │
                    └─────────────────────────────────────┬───────────────────────────────────────────┘
                                                        │ HTTPS / REST JSON APIs
                                                        ▼
                    ┌─────────────────────────────────────────────────────────────────────────────────┐
                    │                       APPLICATION TIER (FastAPI Backend)                        │
                    │  ┌───────────────────────┐  ┌──────────────────────────┐  ┌───────────────────┐ │
                    │  │ OpenCV & Tesseract OCR│  │ ML & Gemini Classifier   │  │ Split & Anomaly   │ │
                    │  │                       │  │                          │  │ Engine            │ │
                    │  └───────────────────────┘  └──────────────────────────┘  └───────────────────┘ │
                    └─────────────────────────────────────┬───────────────────────────────────────────┘
                                                        │ SQL via psycopg2
                                                        ▼
                    ┌─────────────────────────────────────────────────────────────────────────────────┐
                    │                          DATA TIER (Database Layer)                             │
                    │                        Relational PostgreSQL Database Engine                    │
                    │              [users_directory] ↔ [receipts] ↔ [receipt_shares]                  │
                    └─────────────────────────────────────────────────────────────────────────────────┘
```
*Figure 4. Three-tier decoupled architecture separating presentation, application, and data concerns.*

![Architecture Screenshot](docs/images/architecture-diagram.png)
*Figure 5. Deployed architecture: Vercel (frontend) ↔ Render (backend) ↔ managed PostgreSQL.*

---

## 9. Database Schema & UML Design Diagrams

### 9.1 Entity-Relationship (ER) Diagram

```
                +------------------------------------+       +-----------------------------------+
                |          users_directory           |       |             receipts              |
                +------------------------------------+       +-----------------------------------+
                | PK | clerk_id             | TEXT   | <---+ | PK | id              | SERIAL     |
                |    | email                | TEXT   |     | | FK | user_id         | TEXT       | --+
                |    | display_name         | TEXT   |     | |    | raw_text        | TEXT       |   |
                |    | email_reports_enabled| BOOLEAN|     | |    | parsed_items    | JSONB      |   |
                +------------------------------------+     | |    | created_at      | TIMESTAMP  |   |
                                ^                        | +-----------------------------------+   |
                                |                        |                   ^                     |
                                |                        |                   |                     |
                                |                        | ON DELETE CASCADE |                     |
                                |     +------------------+-------------------+                     |
                                |     |                                                            |
                                |     |    +-----------------------------------+                   |
                                |     |    |          receipt_shares           |                   |
                                |     |    +-----------------------------------+                   |
                                |     +--  | PK | id         | SERIAL          |                   |
                                +--------  | FK | user_id    | TEXT            |                   |
                                            | FK | receipt_id | INTEGER         | <-----------------+
                                            |    | amount_owed| NUMERIC(10,2)   |
                                            |    | is_owner   | BOOLEAN         |
                                            +-----------------------------------+
```
*Figure 6. Entity-relationship diagram of the `users_directory`, `receipts`, and `receipt_shares` tables.*

### 9.2 System Class Diagram

```
                ┌──────────────────────────────────────┐          ┌──────────────────────────────────────┐
                │            FastAPIApplication        │          │         CategorizationEngine         │
                ├──────────────────────────────────────┤          ├──────────────────────────────────────┤
                │ + app: FastAPI                       │          │ - vectorizer: TfidfVectorizer        │
                │ + scheduler: BackgroundScheduler     │          │ - classifier: MultinomialNB          │
                ├──────────────────────────────────────┤          ├──────────────────────────────────────┤
                │ + upload_receipt(file): JSON         │─────────>│ + classify_item_name(name): String   │
                │ + parse_receipt(request): JSON       │          │ + resolve_llm_fallback(items): List  │
                │ + save_receipt(request): JSON        │          └──────────────────────────────────────┘
                │ + delete_receipts(payload): JSON     │
                │ + download_report(user_id): Stream   │          ┌──────────────────────────────────────┐
                └──────────────────┬───────────────────┘          │          ReceiptSplitEngine          │
                                   │                              ├──────────────────────────────────────┤
                                   │                              │ + calculate_split(items, parts): Dict│
                                   ▼                              └──────────────────────────────────────┘
                ┌──────────────────────────────────────┐
                │           DatabaseManager            │          ┌──────────────────────────────────────┐
                │                                      │          │         AnomalyDetectionEngine       │
                ├──────────────────────────────────────┤          ├──────────────────────────────────────┤
                │ + get_db(): Connection               │          │ + detect_anomalies(totals): List     │
                │ + sync_user(clerk_id, email): Void   │          └──────────────────────────────────────┘
                └──────────────────────────────────────┘
```
*Figure 7. Class-level decomposition of core backend responsibilities.*

### 9.3 End-to-End Sequence Diagram

```
User (Browser)        React App (UI)          FastAPI Backend         Tesseract/Gemini        PostgreSQL
     │                       │                        │                       │                    │
     ├─ 1. Drop image file ─>│                        │                       │                    │
     │                       ├─ 2. POST /api/upload ─>│                       │                    │
     │                       │   (multipart file)     ├─ 3. Preprocess & OCR> │                    │
     │                       │                        │<─ 4. Raw text string  ┤                    │
     │                       │                        │                       │                    │
     │                       │                        ├─ 5. Extract & classify items ─────────────>│
     │                       │                        │<─ 6. Category mapping ─────────────────────┤
     │                       │<─ 7. Render editor ────┤                       │                    │
     │                       │   with JSON items      │                       │                    │
     │                       │                        │                       │                    │
     ├─ 8. Click save ──────>│                        │                       │                    │
     │                       ├─ 9. POST /api/save ───>│                       │                    │
     │                       │                        ├─ 10. INSERT record ───────────────────────>│
     │                       │                        │<─ 11. Transaction OK ──────────────────────┤
     │                       │<─ 12. Success toast ───┤                       │                    │
```
*Figure 8. End-to-end sequence flow from receipt upload through OCR, classification, and persistence.*

---

## 10. Technology Stack & Architectural Rationale

| Architectural Layer | Technology Selection | Rationale & Selection Advantage |
|---|---|---|
| Frontend UI | React 18 + TypeScript | Component modularity, strong typing. |
| Build Tool | Vite | Fast HMR and lightweight bundles. |
| Authentication | Clerk Auth API | Managed JWT sessions & OAuth security. |
| Data Charts | Recharts | Responsive SVG charting. |
| Backend API | FastAPI (Python 3.11) | High performance, async routes. |
| Computer Vision | OpenCV (cv2) + NumPy | Advanced image filtering. |
| OCR Processing | Tesseract OCR Engine | Open-source OCR parsing. |
| Machine Learning | scikit-learn (Naive Bayes) | TF-IDF text classification. |
| AI LLM Engine | Google Gemini 2.5 Flash | Fast, structured JSON fallback. |
| PDF Engine | ReportLab | Server-side programmatic PDF creation. |
| Relational DB | PostgreSQL | Strong schema guarantees & JSONB support. |

---

## 11. Core Subsystem Implementations

### 11.1 OpenCV Image Preprocessing & Tesseract OCR Pipeline

```
                    ┌───────────────────────────────────────────────────────────────────────────┐
                    │                     OPENCV IMAGE ENHANCEMENT FLOW                         │
                    │                                                                           │
                    │  [Input Image] → [Scale 2x] → [Grayscale] → [Bilateral Filter]            │
                    │                                              → [Adaptive Threshold]       │
                    │                                              → [Dilate]                   │
                    └───────────────────────────────────────────────────────────────────────────┘
```

```python
def preprocess_image(image: np.ndarray) -> np.ndarray:
    # 1. Upscale image 2x using cubic interpolation to optimize character
    #    height for OCR
    image = cv2.resize(image, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)

    # 2. Convert BGR color space to grayscale to remove color noise
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # 3. Apply bilateral filtering to smooth background noise while
    #    preserving sharp text edges
    filtered = cv2.bilateralFilter(gray, 9, 75, 75)

    # 4. Apply adaptive Gaussian thresholding to binarize the image
    #    under uneven lighting
    thresh = cv2.adaptiveThreshold(
        filtered, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY, 15, 8
    )

    # 5. Morphological dilation to reconnect broken character strokes
    #    on thermal paper
    kernel = np.ones((2, 2), np.uint8)
    return cv2.dilate(thresh, kernel, iterations=1)
```

![OCR Preprocessing Stages](docs/images/ocr-preprocessing-stages.png)
*Figure 9. Visual comparison of raw image vs. each preprocessing stage output.*

### 11.2 Structured Regex Parsing & Line Filtering Engine

The extraction module scans raw text strings line-by-line using regular expressions:

```python
def parse_receipt_items(raw_text: str) -> list:
    lines = raw_text.split('\n')
    items = []
    fallback_queue = []

    # Regex matching price values at line ends (e.g., $12.50, 4.50, 3,20)
    price_pattern = re.compile(r'\$?\d+[.,]\d{1,2}(?:\s*)$')
    skip_keywords = ['total', 'tax', 'gst', 'cash', 'visa', 'subtotal',
                      'change', 'nets', 'received', 'due']

    for line in lines:
        line = line.strip()
        if not line or any(k in line.lower() for k in skip_keywords):
            continue

        cleaned = re.sub(r'^\d+[.,]\s*', '', line).strip()
        match = price_pattern.search(cleaned)
        if not match:
            continue

        try:
            price = float(match.group().strip().replace('$', '').replace(',', '.'))
        except ValueError:
            continue

        if price == 0.0:
            continue

        name = re.sub(r'[\.\-\s]+$', '', cleaned[:match.start()]).strip()
        if not name:
            continue

        cat = classify_item_name(name)
        if cat == "LLM_FALLBACK":
            fallback_queue.append(name)

        items.append({"name": name, "price": price, "category": cat, "raw_line": line})

    # Resolve queued low-confidence items in a single batch call to Gemini
    if fallback_queue:
        res_cats = resolve_llm_fallback(fallback_queue)
        f_idx = 0
        for i in items:
            if i["category"] == "LLM_FALLBACK":
                i["category"] = res_cats[f_idx] if f_idx < len(res_cats) else "Other"
                f_idx += 1

    return items
```

### 11.3 Hybrid Categorization Engine (Rules + TF-IDF Naive Bayes + Gemini Fallback)

Categorisation utilises three layers, escalating from cheap deterministic rules to a statistical model, and finally to an LLM fallback only when confidence is low:

```python
def classify_item_name(name: str) -> str:
    global vectorizer, classifier
    if not vectorizer or not classifier:
        return "Other"

    cleaned_name = name.lower().strip()

    # Layer 1: Merchant keyword overrides
    merchant_rules = {
        "mcdonalds": "Food & Beverage",
        "starbucks": "Food & Beverage",
        "fairprice": "Groceries",
        "grab": "Transport"
    }
    for m, cat in merchant_rules.items():
        if m in cleaned_name:
            return cat

    # Check vocabulary coverage
    if not any(w in vectorizer.vocabulary_ for w in cleaned_name.split()):
        return "LLM_FALLBACK"

    # Layer 2: TF-IDF + Multinomial Naive Bayes model
    probs = classifier.predict_proba(vectorizer.transform([cleaned_name]))[0]
    idx = np.argmax(probs)

    # Layer 3: Confidence gating (route to Gemini if < 22% confidence)
    return classifier.classes_[idx] if probs[idx] >= 0.22 else "LLM_FALLBACK"
```

### 11.4 Proportional Bill-Splitting & Extra Charge Distribution Matrix

When splitting costs among participants, additional charges (such as service tax, GST, or tips) are allocated proportionally based on each individual's subtotal:

```
Adjustment Share(u) = Extra Charges × ( Subtotal(u) / Total Item Cost )
Total Owed(u)        = Subtotal(u) + Adjustment Share(u)
```

```python
@app.post("/api/split-receipt")
async def split_receipt(request: Request):
    body = await request.json()
    items = body.get("items", [])
    participants = body.get("participants", [])
    adjustment = float(body.get("adjustment", 0.0))

    if not participants:
        raise HTTPException(status_code=400, detail="Participants array required.")

    breakdown = {
        p["clerk_id"]: {
            "subtotal": 0.0, "adjustment_share": 0.0, "total": 0.0,
            "display_name": p["display_name"]
        } for p in participants
    }
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

    return {
        "success": True,
        "grand_total": round(total_item_cost + adjustment, 2),
        "breakdown": breakdown
    }
```

### 11.5 Z-Score Statistical Anomaly Detection Engine

FinTrace uses population standard deviation to detect spending spikes across monthly totals:

```python
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

        # Trigger alert if Z-score >= 2.0 OR monthly spending jumped by >= 60%
        if z_score >= z_threshold or deviation_pct >= 60.0:
            anomalies.append({
                "month": item.get("month"),
                "total": round(total, 2),
                "expected_total": round(mean_total, 2),
                "deviation": round(total - mean_total, 2),
                "deviation_pct": round(deviation_pct, 2),
                "z_score": round(z_score, 2),
                "severity": "high",
                "reason": "Spending was significantly above the recent monthly average."
            })

    return anomalies
```

---

## 12. New Features Implemented Post-Peer Feedback

Based on peer evaluations and user testing feedback collected after Milestone 2, three core extensions were added to the platform:

| # | Feature | Description |
|---|---------|--------------|
| 1 | **Manual Receipt Typing** | Direct raw text input drawer for damaged physical receipts. |
| 2 | **Batch History Deletion** | Selection mode with bulk `DELETE` endpoint and owner validation. |
| 3 | **Downloadable PDF Report** | Server-side PDF generation using ReportLab to bypass SMTP limits. |

### 12.1 Manual Receipt Text Entry & Raw Editing Drawer

Users can bypass photo uploads entirely by opening a manual text drawer, pasting or typing receipt text directly, and submitting it to the same parsing pipeline used for OCR output. This directly addresses peer feedback that faded or torn thermal receipts sometimes fail OCR entirely.

![Manual Entry Drawer](docs/images/manual-entry-drawer.png)
*Figure 10. Manual receipt text entry drawer.*

### 12.2 Batch History Deletion & Ownership Protection Flow

Users can toggle Selection Mode in the History view to select multiple receipts for removal. The API verifies ownership before deletion to prevent non-owners from modifying shared records:

```python
@app.delete("/api/receipts")
async def delete_receipts(payload: DeleteReceiptsRequest):
    if not payload.receipt_ids:
        raise HTTPException(status_code=400, detail="No receipt IDs provided.")
    try:
        conn = get_db()
        cur = conn.cursor()

        # Enforce user ownership check to prevent unauthorized deletion
        # of shared records
        cur.execute(
            """
            DELETE FROM receipts
            WHERE user_id = %s AND id = ANY(%s)
            RETURNING id;
            """,
            (payload.user_id, payload.receipt_ids)
        )
        deleted_ids = [row[0] for row in cur.fetchall()]
        conn.commit()
        cur.close()
        conn.close()
        return {"success": True, "deleted_count": len(deleted_ids), "deleted_ids": deleted_ids}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

### 12.3 Downloadable Financial Fingerprint PDF Report Engine

Due to outgoing SMTP port restrictions on free cloud hosting tiers and verified domain requirements when utilizing https-based outgoing email services, automated emails were replaced with an on-demand PDF report generator. Built using ReportLab, the endpoint builds structured spending reports directly in memory and returns them as downloadable byte streams (`application/pdf`).

```python
@app.get("/api/download-report")
async def download_report(user_id: str):
    # Query database and build PDF document structure using
    # ReportLab's SimpleDocTemplate
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        rightMargin=18 * mm, leftMargin=18 * mm,
        topMargin=18 * mm, bottomMargin=18 * mm
    )
    elements = []

    # Appends title, executive summary stat cards, category table,
    # and anomaly banners...
    doc.build(elements)
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=fintrace-financial-report.pdf"}
    )
```

![PDF Report Sample](docs/images/pdf-report-sample.png)
*Figure 11. Sample generated financial fingerprint PDF report.*

---

## 13. User Interface & User Experience (UI/UX) Showcase

### 13.1 Interactive Drag-and-Drop Uploader

The primary workspace includes a dropzone supporting file drag-and-drop, image selection, and live AI step-by-step processing feedback.

```
                        +----------------------------------------------------------------------+
                        |                          FinTrace Workspace                          |
                        |  [  User Profile ]                          [ NUS Orbital 2026 ]     |
                        |                                                                      |
                        |  +-----------------------------------------------------------------+ |
                        |  |                 Hey, Pranav                                     | |
                        |  |                 Your spending this month: $348.50               | |
                        |  +-----------------------------------------------------------------+ |
                        |                                                                      |
                        |  + - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -+  |
                        |  |                       [  File Icon ]                           |  |
                        |  |                   Drop receipt image here                      |  |
                        |  |               Drag & drop or click to upload                   |  |
                        |  + - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -+  |
                        |                                                                      |
                        |                [  Open Manual Text Entry Drawer ]                    |
                        +----------------------------------------------------------------------+
```
*Figure 12. Primary receipt upload workspace.*

### 13.2 Paper Receipt Review & Item Correction Interface

Once parsed, items are presented in a white paper receipt layout, enabling users to modify OCR text, re-scan, or allocate items to friends.

```
+---------------------------------------------------------------------+
|                          REVIEW RESULTS                             |
|  -------------------------------------------------------------------|
|  ORIGINAL TEXT                                    [ 🔄 Re-scan ]    |
|  +-------------------------------------------------------------+    |
|  | McChicken Meal 7.50                                          |   |
|  | FairPrice Milk 3.20                                          |   |
|  +-------------------------------------------------------------+    |
|                                                                       |
|  ITEMS                                            [ 👥 Split Bill ] |
|  +-------------------------------------------------------------+    |
|  | McChicken Meal     🍔 Food & Beverage                $7.50  |    |
|  | Fresh Milk         🛒 Groceries                      $3.20  |    |
|  +-------------------------------------------------------------+    |
|                                                                       |
|  [ 💾 Save Receipt ]                              [ 🗑️ Discard ]    |
+---------------------------------------------------------------------+
```
*Figure 13. Receipt review and item-correction interface.*

### 13.3 Spending Analytics Dashboard

The Insights tab displays spending analytics powered by Recharts, including monthly trend area charts, category pie charts, and anomaly alert banners.

```
+---------------------------------------------------------------------+
|                        SPENDING DASHBOARD                           |
|  +-------------------------------------------------------------+    |
|  | ⚠️ SPENDING SPIKE DETECTED: 2026-03 total reached $300.00    |    |
|  | Expected ~$90.00 based on historical average.                |   |
|  +-------------------------------------------------------------+    |
|                                                                       |
|  [ Total: $680.00 ]  [ Monthly Avg: $136.00 ]  [ Top: Food & Bev ]  |
|                                                                       |
|  MONTHLY SPENDING TREND                                              |
|  $300 |                                    *                        |
|  $150 |                    *               |                        |
|   $80 |       *            |               |                        |
|    $0 +-------+------------+---------------+---------------------   |
|            2026-01      2026-02         2026-03                     |
|                                                                       |
|  [ ⬇️ Download Financial Report (PDF) ]                              |
+---------------------------------------------------------------------+
```
*Figure 14. Spending Dashboard displaying category breakdowns, monthly trend, and anomaly alerts.*

![Dashboard Screenshot](docs/images/dashboard.png)
*Figure 15. Live spending dashboard screenshot from the deployed application.*

---

## 14. Testing Strategy, Evaluation & Analytics

### 14.1 Automated Backend Testing Suite (pytest)

Backend route handler correctness, database isolation, and parsing logic were evaluated using pytest unit and integration suites:

```
================================== test session starts ==================================
platform linux -- Python 3.11.4, pytest-7.4.0, pluggy-1.2.0
rootdir: /fintrace/backend
collected 21 items

tests/test_main.py::test_detects_large_monthly_spending_spike PASSED           [  4%]
tests/test_main.py::test_ignores_normal_months PASSED                          [  9%]
tests/test_main.py::test_save_receipt_success PASSED                           [ 14%]
tests/test_main.py::test_save_receipt_missing_fields PASSED                    [ 19%]
tests/test_main.py::test_save_receipt_with_split_distribution PASSED           [ 23%]
tests/test_main.py::test_save_receipt_no_split_computes_estimated_total PASSED [ 28%]
tests/test_main.py::test_get_receipts_returns_expected_data PASSED             [ 33%]
tests/test_main.py::test_delete_receipts_success PASSED                        [ 38%]
tests/test_main.py::test_delete_receipts_empty_ids_returns_400 PASSED          [ 42%]
tests/test_main.py::test_delete_receipts_ignores_non_owned_receipts PASSED     [ 47%]
tests/test_main.py::test_get_spending_summary_returns_expected_structure PASSED[ 52%]
tests/test_main.py::test_download_report_success PASSED                        [ 57%]
tests/test_main.py::test_search_friend_found PASSED                            [ 61%]
tests/test_main.py::test_search_friend_not_found PASSED                        [ 66%]
tests/test_main.py::test_sync_user_success PASSED                              [ 71%]
tests/test_main.py::test_split_receipt_even_split_no_assignment PASSED         [ 76%]
tests/test_main.py::test_split_receipt_specific_assignment PASSED              [ 80%]
tests/test_main.py::test_split_receipt_adjustment_proportional PASSED          [ 85%]
tests/test_main.py::test_parse_receipt_success PASSED                          [ 90%]
tests/test_main.py::test_upload_receipt_invalid_file_type PASSED               [ 95%]
tests/test_main.py::test_upload_receipt_success PASSED                         [100%]

================================== 21 passed in 1.84s ===================================
```

### 14.2 User Testing Methodology & Task Metrics

Usability testing was conducted with target users (N = 5). Participants were asked to complete six core operational tasks, rating each on a 1–5 satisfaction scale.

| Evaluated Task Step | Score 3 | Score 4 | Score 5 | Pass % |
|---|---|---|---|---|
| Task 1: Account Creation & Clerk Sign-in | 0% (0) | 20% (1) | 80% (4) | 100% |
| Task 2: Upload Receipt Image & Execute Scan | 0% (0) | 20% (1) | 60% (3) | 100% |
| Task 3: Locate/Correct OCR Mistake & Re-scan | 20% (1) | 0% (0) | 80% (4) | 100% |
| Task 4: Add Friend & Split Bill Proportionally | 20% (1) | 20% (1) | 60% (3) | 100% |
| Task 5: Save Receipt & Verify History View | 20% (1) | 20% (1) | 60% (3) | 100% |
| Task 6: Explore Spending Dashboard Insights | 0% (0) | 40% (2) | 60% (3) | 100% |

### 14.3 System Usability Scale (SUS) Results & Evaluation Analysis

Following task completion, users evaluated the platform using the standard 10-item System Usability Scale (SUS):

| SUS Metric Question Item | Mean Score | Agreement % |
|---|---|---|
| 1. I think that I would like to use this app frequently. | 5.0 / 5.0 (Strong Agree) | 100% |
| 2. I found the app unnecessarily complex. | 1.4 / 5.0 (Strong Disagree) | 100% |
| 3. I thought the app was easy to use. | 4.4 / 5.0 (Agree) | 80% |
| 4. I need technical support to use this app. | 1.4 / 5.0 (Strong Disagree) | 100% |
| 5. Functions in this app were well integrated. | 4.6 / 5.0 (Strong Agree) | 100% |
| 6. There was too much inconsistency in this app. | 1.0 / 5.0 (Strong Disagree) | 100% |
| 7. Most people would learn to use this app quickly. | 5.0 / 5.0 (Strong Agree) | 100% |
| 8. I found the app very cumbersome/awkward to use. | 1.0 / 5.0 (Strong Disagree) | 100% |
| 9. I felt very confident using the app. | 5.0 / 5.0 (Strong Agree) | 100% |
| 10. I needed to learn many things before getting started. | 1.4 / 5.0 (Strong Disagree) | 100% |

> **Overall FinTrace SUS Score: 91.25 / 100.0 (Grade A+ Usability Rating)**

---

## 15. Engineering Challenges & Technical Decision Log

### 15.1 Render SMTP Blocking vs. Downloadable PDF Generation

**Challenge:** Free cloud hosting environments (such as Render) block outgoing SMTP ports (25, 465, 587) to prevent spam transmission. Third-party transactional email HTTP APIs (such as SendGrid or Resend) require custom domain DNS ownership verification, which the team did not have for this project.

**Solution:** Replaced email transmission with an on-demand PDF report generator (`/api/download-report`). Built using ReportLab, the backend constructs styled PDF reports in memory and streams them directly to the client.

```
                        [User Clicks Download] → [GET /api/download-report] → [Query PostgreSQL]
                            → [ReportLab PDF Generation] → [Stream Bytes to Browser]
```

### 15.2 OCR Preprocessing Optimizations for Low-Quality Thermal Paper

**Challenge:** Receipts printed on thermal paper suffer from faded ink, thin fonts, and ambient reflections, leading to character recognition errors during raw Tesseract scans.

**Solution:** Standardised a multi-stage OpenCV preprocessing pipeline prior to OCR execution:

1. Image upscaling (2×) using cubic interpolation to raise font sizes into Tesseract's optimal recognition range.
2. Grayscale conversion to eliminate colour noise.
3. Bilateral noise filtering to preserve text-boundary contrast.
4. Adaptive Gaussian thresholding to compensate for shadows and glare.
5. Morphological dilation (2×2 kernel) to reconnect broken character strokes.

### 15.3 CORS Protocols & Multi-Environment Configuration

**Challenge:** Serving the React SPA from Vercel while running the FastAPI backend on Render resulted in Cross-Origin Resource Sharing (CORS) pre-flight blocks.

**Solution:** Configured dynamic CORS middleware in FastAPI to accept origins from local development environments as well as production deployments:

```python
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
```

---

## 16. Software Engineering Practices & Code Quality

### 16.1 System Architecture & Layer Separation

FinTrace applies a clear separation of concerns across its codebase:

```
fintrace/
├── frontend/                          # Presentation Tier (React + TypeScript)
│   ├── src/
│   │   ├── components/                # UI components 
|   |   |   └── SpendingDashboard.tsx
│   │   ├── App.tsx                    # Application logic & navigation state
│   │   └── main.tsx                   # Root mounting & Clerk context initialization
└── backend/                           # Application & Data Tier (FastAPI engine)
    ├── main.py                        # API endpoints, processing pipelines & scheduled jobs
    ├── dataset.py                     # Training corpus for machine learning classification
    └── tests/                         # Automated test suite (pytest)
```

### 16.2 Database Security & SQL Injection Prevention

Database interactions utilise parameterised SQL queries (`%s` placeholders via `psycopg2`) to prevent SQL injection attacks, rather than string concatenation.

### 16.3 Continuous Integration & Automated Verification

Pull requests require verification through automated test runs (`pytest`) before being merged into the primary production branch, via a GitHub Actions workflow.

---

## 17. Complete REST API Reference

| Method | Endpoint Route | Input Payload / Params | Response Output Structure |
|---|---|---|---|
| `POST` | `/api/upload` | Multipart form file (`file`) | `{ text: string }` |
| `POST` | `/api/parse` | `{ raw_text: string }` | `{ items: Array<ParsedItem> }` |
| `POST` | `/api/save` | `{ user_id, raw_text, items, ... }` | `{ success: true, id: int }` |
| `GET` | `/api/receipts` | Query: `user_id` | `{ receipts: Array<Record> }` |
| `DELETE` | `/api/receipts` | `{ user_id, receipt_ids: List }` | `{ deleted_count: int }` |
| `GET` | `/api/spending-summary` | Query: `user_id, months` | `{ totals, monthly, ... }` |
| `POST` | `/api/split-receipt` | `{ items, participants, extra }` | `{ grand_total, breakdown }` |
| `GET` | `/api/download-report` | Query: `user_id` | Streaming PDF file binary |
| `POST` | `/api/sync-user` | `{ clerk_id, email, display_name }` | `{ success: true }` |
| `GET` | `/api/search-friend` | Query: `email` | `{ clerk_id, display_name }` |

Full interactive OpenAPI documentation is available at `/docs` once the backend server is running (see [Section 18](#18-setup-local-installation--deployment-guide)).

---

## 18. Setup, Local Installation & Deployment Guide
 
### 18.1 System Dependencies
 
- **Node.js Engine:** ≥ v18.0.0
- **Python Runtime:** ≥ v3.10.0
- **PostgreSQL Engine:** local instance or managed cloud database (e.g. Render, Supabase, ElephantSQL)
- **Tesseract OCR Binary Engine:**
  - **Windows:** Download the installer from the official Tesseract GitHub releases page. Add the installation directory (`C:\Program Files\Tesseract-OCR`) to your System PATH.
  - **macOS:** `brew install tesseract`
  - **Linux (Ubuntu/Debian):** `sudo apt update && sudo apt install -y tesseract-ocr`
### 18.2 Backend Setup (FastAPI & PostgreSQL)
 
> **Note on `requirements.txt`:** The repository intentionally keeps two `requirements.txt` files — one at the project root and one inside `backend/`. Render's build/deploy service is scoped to the `backend/` directory only (it cannot see the frontend or repo root at build time), so `backend/requirements.txt` is the one Render actually installs from in production. The root-level copy exists for tooling and CI steps that run from the repository root. For local development, always install from `backend/requirements.txt`.
 
```bash
# 1. Clone repository
git clone https://github.com/PranavJ-960/FinTrace-Orbital.git
cd FinTrace-Orbital/backend
 
# 2. Set up Python virtual environment
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
 
# 3. Install dependencies from the backend's requirements.txt
pip install -r requirements.txt
 
# 4. Configure local environment variables (.env)
echo "DB_HOST=localhost" >> .env
echo "DB_NAME=postgres" >> .env
echo "DB_USER=postgres" >> .env
echo "DB_PASSWORD=your_password" >> .env
echo "DB_PORT=5432" >> .env
echo "GEMINI_API_KEY=your_gemini_api_key_here" >> .env
 
# 5. Launch FastAPI development server
uvicorn main:app --reload --port 8000
```
 
API documentation is available at `http://127.0.0.1:8000/docs`.
 
#### Alternative: Run the Backend with Docker
 
The backend also ships with a `Dockerfile`, so it can be built and run without setting up a local Python environment at all:
 
```bash
cd FinTrace-Orbital/backend
 
# Build the image
docker build -t fintrace-backend .
 
# Run the container (pass your .env file through)
docker run --env-file .env -p 8000:8000 fintrace-backend
```
 
### 18.3 Frontend Setup (React & Vite)
 
```bash
# 1. Navigate to frontend folder
cd ../frontend
 
# 2. Install Node packages
npm install
 
# 3. Configure local environment file (.env.local)
echo "VITE_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key_here" > .env.local
echo "VITE_API_URL=http://127.0.0.1:8000" >> .env.local
 
# 4. Run Vite development server
npm run dev
```
 
Frontend application is available at `http://localhost:5173`.
 
### 18.4 Production Deployment
 
- **Frontend:** Deployed to Vercel, auto-building from the `main` branch on push.
- **Backend:** Deployed to Render as a web service, with environment variables configured via the Render dashboard.
- **Database:** PostgreSQL hosted on Supabase, connected via DATABASE_URL environment variable.
---
 
## 19. Project Structure & Repository Layout
 
```
FinTrace-Orbital/
├── backend/
│   ├── tests/
│   │   └── test_main.py                 # Automated API & pipeline unit test suite
│   ├── .env                             # Local backend environment variables (not committed)
│   ├── dataset.py                       # Machine learning training data corpus
│   ├── Dockerfile                       # Container build definition for the backend service
│   ├── main.py                          # Core FastAPI application & routing logic
│   ├── pytest.ini                       # pytest configuration
│   └── requirements.txt                 # Python dependencies (installed by Render at build time)
├── Docs/                                # Supporting documentation & diagrams
├── frontend/
│   ├── public/                          # Static assets served as-is
│   ├── src/
│   │   ├── assets/                      # Images, icons, and static media
│   │   ├── components/
│   │   │   └── SpendingDashboard.tsx    # Interactive charting analytics UI
│   │   ├── App.css                      # Application-level styles
│   │   ├── App.tsx                      # Primary application state & layout engine
│   │   ├── index.css                    # Global styles
│   │   └── main.tsx                     # React root mounting & Clerk context
│   ├── .env.local                       # Local frontend environment variables (not committed)
│   ├── .gitignore
│   ├── eslint.config.js                 # ESLint rules for the frontend
│   ├── index.html                       # Primary web application document
│   ├── package.json                     # Node module package declaration
│   ├── package-lock.json
│   ├── README.md                        # Frontend-specific notes
│   ├── tsconfig.json                    # TypeScript compiler configuration
│   ├── tsconfig.app.json
│   ├── tsconfig.node.json
│   └── vite.config.ts                   # Vite bundler build settings
├── .gitignore
├── README.md                            # Complete system documentation report
└── requirements.txt                     # Root-level copy for tooling that runs from repo root
```
 
> Local, environment-specific folders such as `__pycache__/`, `.pytest_cache/`, `.venv/`, `venv/`, and `node_modules/` are generated automatically and excluded from the repository via `.gitignore`; they're omitted from the layout above for clarity.

---

## 20. Milestone Progress, Development Timeline & Future Roadmap
 
| Development Phase | Deliverables & Milestone Achievements |
|---|---|
| **Milestone 1 (May)** | Initial project proposal, architecture setup, and OpenCV OCR pipeline. |
| **Milestone 2 (June)** | FastAPI REST APIs, PostgreSQL integration, ML classifier, and Recharts dashboard. |
| **Milestone 3 (July)** | Bill-splitting, anomaly detection, batch deletion, and PDF report generation. |
 
### Future Roadmap Ideas
 
- **Camera Integration for Mobile Web:** Add direct camera capture triggers using browser media APIs to remove the need to manually upload saved photos.
- **Multi-Currency Conversion:** Support automatically converting foreign currency amounts (e.g. MYR, JPY, USD) into SGD using daily exchange rate APIs.
- **Budget Limit Tracking:** Allow users to define monthly target spending thresholds per category and receive notifications when approaching limits.
---
 
## 21. References & Acknowledgments
 
- **NUS School of Computing (SoC):** Orbital 2026 Programme Management & Skylab Assessment Teams.
- **OpenCV** (Open Source Computer Vision Library): image enhancement documentation for adaptive thresholding and bilateral filtering.
- **Tesseract OCR Engine:** Google's open-source optical character recognition documentation.
- **FastAPI:** high-performance Python API framework and OpenAPI validation documentation.
- **ReportLab:** programmatic PDF generation engine documentation.
- **Recharts:** React charting library documentation.
- **Clerk:** identity management and JWT session documentation.
---
 
## 22. Project Log
 
Full task-by-task project log with dates and hours is maintained here: [FinTrace Project Log - Google Sheets](https://docs.google.com/spreadsheets/d/19o-82zqusLOTXPOMhEbv3fp2qDXGYndIJxKAq4dviGc/edit?gid=0#gid=0)

---
<p align="center">FinTrace — NUS Orbital 2026</p>