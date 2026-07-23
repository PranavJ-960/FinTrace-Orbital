import json

import pytest
from fastapi.testclient import TestClient

from main import app, detect_spending_anomalies


# ---------------------------------------------------------------------------
# Shared fakes / fixtures
# ---------------------------------------------------------------------------

class FakeCursor:
    def __init__(self, responses=None):
        self.responses = responses or []
        self.queries = []
        self.params = []
        self.lastrowid = 1

    def execute(self, query, params=None):
        self.queries.append(query)
        self.params.append(params)

    def fetchone(self):
        if self.responses:
            return self.responses.pop(0)
        return None

    def fetchall(self):
        if self.responses:
            response = self.responses.pop(0)
            return response
        return []

    def close(self):
        pass


class FakeConnection:
    def __init__(self, cursor):
        self._cursor = cursor
        self.committed = False

    def cursor(self):
        return self._cursor

    def commit(self):
        self.committed = True

    def close(self):
        pass


@pytest.fixture(autouse=True)
def patch_db(monkeypatch):
    fake_cursor = FakeCursor()
    fake_conn = FakeConnection(fake_cursor)

    def fake_get_db():
        return fake_conn

    monkeypatch.setattr('main.get_db', fake_get_db)
    return fake_cursor


# ---------------------------------------------------------------------------
# Anomaly detection (pure function, no DB)
# ---------------------------------------------------------------------------

def test_detects_large_monthly_spending_spike():
    monthly_totals = [
        {"month": "2026-01", "total": 80.0},
        {"month": "2026-02", "total": 90.0},
        {"month": "2026-03", "total": 300.0},
    ]

    anomalies = detect_spending_anomalies(monthly_totals)

    assert len(anomalies) == 1
    assert anomalies[0]["month"] == "2026-03"
    assert anomalies[0]["severity"] == "high"


def test_ignores_normal_months():
    monthly_totals = [
        {"month": "2026-01", "total": 80.0},
        {"month": "2026-02", "total": 90.0},
        {"month": "2026-03", "total": 95.0},
    ]

    anomalies = detect_spending_anomalies(monthly_totals)

    assert anomalies == []


# ---------------------------------------------------------------------------
# /api/save
# ---------------------------------------------------------------------------

def test_save_receipt_success(monkeypatch):
    cursor = FakeCursor(responses=[(123,)])
    conn = FakeConnection(cursor)

    def fake_get_db():
        return conn

    monkeypatch.setattr('main.get_db', fake_get_db)

    client = TestClient(app)
    payload = {
        'user_id': 'user-123',
        'raw_text': 'Coffee 4.50',
        'parsed_items': [{'name': 'Coffee', 'price': 4.5, 'category': 'Food & Beverage'}]
    }

    response = client.post('/api/save', json=payload)
    assert response.status_code == 200
    assert response.json() == {'success': True, 'receipt_id': 123}
    assert conn.committed


def test_save_receipt_missing_fields(monkeypatch):
    client = TestClient(app)
    response = client.post('/api/save', json={'raw_text': 'Coffee 4.50'})
    assert response.status_code == 400
    assert response.json()['detail'] == 'Missing mandatory values.'


def test_save_receipt_with_split_distribution(monkeypatch):
    cursor = FakeCursor(responses=[(123,)])
    conn = FakeConnection(cursor)

    def fake_get_db():
        return conn

    monkeypatch.setattr('main.get_db', fake_get_db)
    client = TestClient(app)

    payload = {
        'user_id': 'user-123',
        'raw_text': 'Dinner 45.00',
        'parsed_items': [{'name': 'Dinner', 'price': 45.0, 'category': 'Food & Beverage'}],
        'split_distribution': {
            'user-123': {'total': 30.0},
            'user-456': {'total': 15.0}
        }
    }

    response = client.post('/api/save', json=payload)
    assert response.status_code == 200
    assert response.json() == {'success': True, 'receipt_id': 123}
    assert conn.committed
    assert len(cursor.queries) == 3
    assert 'INSERT INTO receipts' in cursor.queries[0]
    assert 'INSERT INTO receipt_shares' in cursor.queries[1]
    assert 'INSERT INTO receipt_shares' in cursor.queries[2]


def test_save_receipt_no_split_computes_estimated_total(monkeypatch):
    # Covers the "manual add receipt" flow: no split_distribution provided,
    # so the code should sum parsed_items itself and mark the user as owner.
    cursor = FakeCursor(responses=[(999,)])
    conn = FakeConnection(cursor)
    monkeypatch.setattr('main.get_db', lambda: conn)

    client = TestClient(app)
    payload = {
        'user_id': 'user-123',
        'raw_text': 'Manual entry',
        'parsed_items': [
            {'name': 'Item A', 'price': 10.0, 'category': 'Other'},
            {'name': 'Item B', 'price': 5.5, 'category': 'Other'},
        ]
    }
    response = client.post('/api/save', json=payload)
    assert response.status_code == 200

    # second query is the receipt_shares insert; check the amount_owed param
    shares_params = cursor.params[1]
    assert shares_params[2] == 15.5  # 10.0 + 5.5
    assert shares_params[3] is True  # is_owner


# ---------------------------------------------------------------------------
# /api/receipts (GET / DELETE)
# ---------------------------------------------------------------------------

def test_get_receipts_returns_expected_data(monkeypatch):
    rows = [
        (1, 'Coffee 4.50', [{'name': 'Coffee', 'price': 4.5, 'category': 'Food & Beverage', 'raw_line': 'Coffee 4.50'}], '2026-07-11 10:00:00', 4.5, True, 'Alice')
    ]
    cursor = FakeCursor(responses=[rows])
    conn = FakeConnection(cursor)

    def fake_get_db():
        return conn

    monkeypatch.setattr('main.get_db', fake_get_db)
    client = TestClient(app)

    response = client.get('/api/receipts', params={'user_id': 'user-123'})
    assert response.status_code == 200
    data = response.json()
    assert 'receipts' in data
    assert len(data['receipts']) == 1
    receipt = data['receipts'][0]
    assert receipt['id'] == 1
    assert receipt['raw_text'] == 'Coffee 4.50'
    assert receipt['amount_owed'] == 4.5
    assert receipt['uploaded_by_name'] == 'Alice'


def test_get_receipts_returns_empty_list(monkeypatch):
    cursor = FakeCursor(responses=[[]])
    conn = FakeConnection(cursor)

    def fake_get_db():
        return conn

    monkeypatch.setattr('main.get_db', fake_get_db)
    client = TestClient(app)

    response = client.get('/api/receipts', params={'user_id': 'user-123'})
    assert response.status_code == 200
    assert response.json() == {'receipts': []}


def test_delete_receipts_success(monkeypatch):
    cursor = FakeCursor(responses=[[(1,), (2,)]])  # rows returned by RETURNING id
    conn = FakeConnection(cursor)
    monkeypatch.setattr('main.get_db', lambda: conn)

    client = TestClient(app)
    response = client.request('DELETE', '/api/receipts', json={
        'user_id': 'user-123', 'receipt_ids': [1, 2]
    })
    assert response.status_code == 200
    data = response.json()
    assert data['deleted_count'] == 2
    assert data['deleted_ids'] == [1, 2]
    assert conn.committed


def test_delete_receipts_empty_ids_returns_400():
    client = TestClient(app)
    response = client.request('DELETE', '/api/receipts', json={
        'user_id': 'user-123', 'receipt_ids': []
    })
    assert response.status_code == 400


def test_delete_receipts_ignores_non_owned_receipts(monkeypatch):
    # User tries to delete a receipt they don't own. The query filters by
    # user_id = owner, so RETURNING id comes back empty -- no error, just 0 deleted.
    cursor = FakeCursor(responses=[[]])
    conn = FakeConnection(cursor)
    monkeypatch.setattr('main.get_db', lambda: conn)

    client = TestClient(app)
    response = client.request('DELETE', '/api/receipts', json={
        'user_id': 'user-456', 'receipt_ids': [1]
    })
    assert response.status_code == 200
    assert response.json()['deleted_count'] == 0


def test_delete_receipts_db_error_returns_500(monkeypatch):
    def broken_get_db():
        raise Exception("db down")
    monkeypatch.setattr('main.get_db', broken_get_db)

    client = TestClient(app)
    response = client.request('DELETE', '/api/receipts', json={
        'user_id': 'user-123', 'receipt_ids': [1]
    })
    assert response.status_code == 500


# ---------------------------------------------------------------------------
# /api/spending-summary
# ---------------------------------------------------------------------------

def test_get_spending_summary_returns_expected_structure(monkeypatch):
    monthly_rows = [
        ('2026-01', 'Food & Beverage', 50.0),
        ('2026-02', 'Groceries', 60.0),
        ('2026-03', 'Food & Beverage', 200.0),
    ]
    overall_total_row = (310.0,)
    category_rows = [('Food & Beverage', 250.0), ('Groceries', 60.0)]

    cursor = FakeCursor(responses=[monthly_rows, overall_total_row, category_rows])
    conn = FakeConnection(cursor)

    def fake_get_db():
        return conn

    monkeypatch.setattr('main.get_db', fake_get_db)
    client = TestClient(app)

    response = client.get('/api/spending-summary', params={'user_id': 'user-123', 'months': 6})
    assert response.status_code == 200
    data = response.json()

    assert data['totals']['overall'] == 310.0
    assert 'by_category' in data['totals']
    assert data['totals']['by_category']['Food & Beverage'] == 250.0
    assert 'monthly' in data
    assert len(data['monthly']) == 3
    assert data['monthly'][0]['month'] == '2026-01'
    assert data['monthly'][0]['total'] == 50.0
    assert 'categories' in data
    assert 'Food & Beverage' in data['categories']
    assert 'anomalies' in data
    assert isinstance(data['anomalies'], list)


def test_get_spending_summary_empty_returns_defaults(monkeypatch):
    cursor = FakeCursor(responses=[[], (0.0,), []])
    conn = FakeConnection(cursor)

    def fake_get_db():
        return conn

    monkeypatch.setattr('main.get_db', fake_get_db)
    client = TestClient(app)

    response = client.get('/api/spending-summary', params={'user_id': 'user-123', 'months': 6})
    assert response.status_code == 200
    data = response.json()
    assert data['totals']['overall'] == 0.0
    assert data['monthly'] == []
    assert 'categories' in data
    assert data['anomalies'] == []


# ---------------------------------------------------------------------------
# /api/download-report
# ---------------------------------------------------------------------------

def test_download_report_success(monkeypatch):
    monthly_rows = [
        ('2026-01', 'Food & Beverage', 50.0),
        ('2026-02', 'Groceries', 300.0),
    ]
    cursor = FakeCursor(responses=[monthly_rows])
    conn = FakeConnection(cursor)
    monkeypatch.setattr('main.get_db', lambda: conn)

    client = TestClient(app)
    response = client.get('/api/download-report', params={'user_id': 'user-123'})

    assert response.status_code == 200
    assert response.headers['content-type'] == 'application/pdf'
    assert 'fintrace-financial-report.pdf' in response.headers['content-disposition']
    assert len(response.content) > 0


def test_download_report_no_data_does_not_crash(monkeypatch):
    # month_count = max(len(monthly_list), 1) guards div-by-zero -- verify it holds
    cursor = FakeCursor(responses=[[]])
    conn = FakeConnection(cursor)
    monkeypatch.setattr('main.get_db', lambda: conn)

    client = TestClient(app)
    response = client.get('/api/download-report', params={'user_id': 'user-123'})
    assert response.status_code == 200


def test_download_report_db_error_returns_500(monkeypatch):
    def broken_get_db():
        raise Exception("connection refused")
    monkeypatch.setattr('main.get_db', broken_get_db)

    client = TestClient(app)
    response = client.get('/api/download-report', params={'user_id': 'user-123'})
    assert response.status_code == 500


# ---------------------------------------------------------------------------
# /api/update-preference
# ---------------------------------------------------------------------------

def test_update_preference_success(monkeypatch):
    cursor = FakeCursor()
    conn = FakeConnection(cursor)
    monkeypatch.setattr('main.get_db', lambda: conn)

    client = TestClient(app)
    response = client.post('/api/update-preference', json={
        'user_id': 'user-123', 'email_reports_enabled': True
    })
    assert response.status_code == 200
    assert response.json() == {'success': True}
    assert conn.committed


def test_update_preference_db_error_returns_500(monkeypatch):
    def broken_get_db():
        raise Exception("db down")
    monkeypatch.setattr('main.get_db', broken_get_db)

    client = TestClient(app)
    response = client.post('/api/update-preference', json={
        'user_id': 'user-123', 'email_reports_enabled': True
    })
    assert response.status_code == 500


# ---------------------------------------------------------------------------
# /api/search-friend
# ---------------------------------------------------------------------------

def test_search_friend_found(monkeypatch):
    row = ('Alice', 'user-123', 'alice@example.com')
    cursor = FakeCursor(responses=[row])
    conn = FakeConnection(cursor)
    monkeypatch.setattr('main.get_db', lambda: conn)

    client = TestClient(app)
    response = client.get('/api/search-friend', params={'email': 'ALICE@Example.com  '})

    assert response.status_code == 200
    data = response.json()
    assert data == {
        'success': True,
        'display_name': 'Alice',
        'clerk_id': 'user-123',
        'email': 'alice@example.com'
    }
    # verify email was normalized before hitting the query
    assert cursor.params[0][0] == 'alice@example.com'


def test_search_friend_not_found(monkeypatch):
    cursor = FakeCursor(responses=[None])
    conn = FakeConnection(cursor)
    monkeypatch.setattr('main.get_db', lambda: conn)

    client = TestClient(app)
    response = client.get('/api/search-friend', params={'email': 'nobody@example.com'})

    assert response.status_code == 404
    assert response.json()['detail'] == 'Friend not found in system directory.'


def test_search_friend_db_error_returns_500(monkeypatch):
    def broken_get_db():
        raise Exception("db down")
    monkeypatch.setattr('main.get_db', broken_get_db)

    client = TestClient(app)
    response = client.get('/api/search-friend', params={'email': 'alice@example.com'})
    assert response.status_code == 500


# ---------------------------------------------------------------------------
# /api/sync-user
# ---------------------------------------------------------------------------

def test_sync_user_success(monkeypatch):
    cursor = FakeCursor()
    conn = FakeConnection(cursor)
    monkeypatch.setattr('main.get_db', lambda: conn)

    client = TestClient(app)
    response = client.post('/api/sync-user', json={
        'clerk_id': 'user-123',
        'email': 'Alice@Example.com',
        'display_name': 'Alice'
    })

    assert response.status_code == 200
    assert response.json() == {'success': True}
    assert conn.committed
    # verify email got normalized before insert
    params = cursor.params[0]
    assert params[1] == 'alice@example.com'


def test_sync_user_defaults_display_name_from_email(monkeypatch):
    cursor = FakeCursor()
    conn = FakeConnection(cursor)
    monkeypatch.setattr('main.get_db', lambda: conn)

    client = TestClient(app)
    response = client.post('/api/sync-user', json={
        'clerk_id': 'user-123',
        'email': 'bob@example.com'
    })

    assert response.status_code == 200
    params = cursor.params[0]
    assert params[2] == 'bob'  # display_name derived from email prefix


def test_sync_user_missing_clerk_id_returns_400():
    client = TestClient(app)
    response = client.post('/api/sync-user', json={'email': 'alice@example.com'})
    assert response.status_code == 400
    assert response.json()['detail'] == 'Missing sync parameters.'


def test_sync_user_missing_email_returns_400():
    client = TestClient(app)
    response = client.post('/api/sync-user', json={'clerk_id': 'user-123'})
    assert response.status_code == 400
    assert response.json()['detail'] == 'Missing sync parameters.'


def test_sync_user_db_error_returns_500(monkeypatch):
    def broken_get_db():
        raise Exception("db down")
    monkeypatch.setattr('main.get_db', broken_get_db)

    client = TestClient(app)
    response = client.post('/api/sync-user', json={
        'clerk_id': 'user-123', 'email': 'alice@example.com'
    })
    assert response.status_code == 500


# ---------------------------------------------------------------------------
# /api/split-receipt
# ---------------------------------------------------------------------------

def test_split_receipt_even_split_no_assignment():
    client = TestClient(app)
    payload = {
        'items': [{'name': 'Pizza', 'price': 20.0, 'assignedToIds': []}],
        'participants': [
            {'clerk_id': 'u1', 'display_name': 'Alice'},
            {'clerk_id': 'u2', 'display_name': 'Bob'}
        ],
        'adjustment': 0.0
    }
    response = client.post('/api/split-receipt', json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data['grand_total'] == 20.0
    assert data['breakdown']['u1']['total'] == 10.0
    assert data['breakdown']['u2']['total'] == 10.0


def test_split_receipt_specific_assignment():
    client = TestClient(app)
    payload = {
        'items': [
            {'name': 'Pizza', 'price': 20.0, 'assignedToIds': ['u1']},
            {'name': 'Salad', 'price': 10.0, 'assignedToIds': ['u2']}
        ],
        'participants': [
            {'clerk_id': 'u1', 'display_name': 'Alice'},
            {'clerk_id': 'u2', 'display_name': 'Bob'}
        ],
        'adjustment': 0.0
    }
    response = client.post('/api/split-receipt', json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data['breakdown']['u1']['total'] == 20.0
    assert data['breakdown']['u2']['total'] == 10.0


def test_split_receipt_adjustment_proportional_to_subtotal():
    # u1 has 3x the subtotal of u2, so should absorb 3x the tax/tip
    client = TestClient(app)
    payload = {
        'items': [
            {'name': 'Steak', 'price': 30.0, 'assignedToIds': ['u1']},
            {'name': 'Soup', 'price': 10.0, 'assignedToIds': ['u2']}
        ],
        'participants': [
            {'clerk_id': 'u1', 'display_name': 'Alice'},
            {'clerk_id': 'u2', 'display_name': 'Bob'}
        ],
        'adjustment': 8.0  # e.g. tax + tip
    }
    response = client.post('/api/split-receipt', json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data['grand_total'] == 48.0
    # u1: 30/40 * 8 = 6.0, u2: 10/40 * 8 = 2.0
    assert data['breakdown']['u1']['adjustment_share'] == 6.0
    assert data['breakdown']['u2']['adjustment_share'] == 2.0
    assert data['breakdown']['u1']['total'] == 36.0
    assert data['breakdown']['u2']['total'] == 12.0


def test_split_receipt_no_items_splits_adjustment_equally():
    # total_item_cost == 0 -> falls into the equal-split guard branch
    client = TestClient(app)
    payload = {
        'items': [],
        'participants': [
            {'clerk_id': 'u1', 'display_name': 'Alice'},
            {'clerk_id': 'u2', 'display_name': 'Bob'}
        ],
        'adjustment': 10.0
    }
    response = client.post('/api/split-receipt', json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data['breakdown']['u1']['adjustment_share'] == 5.0
    assert data['breakdown']['u2']['adjustment_share'] == 5.0


def test_split_receipt_ignores_unknown_assigned_ids():
    # assignedToIds references someone not in participants -- should not crash,
    # that share is effectively dropped
    client = TestClient(app)
    payload = {
        'items': [{'name': 'Pizza', 'price': 20.0, 'assignedToIds': ['u1', 'ghost']}],
        'participants': [{'clerk_id': 'u1', 'display_name': 'Alice'}],
        'adjustment': 0.0
    }
    response = client.post('/api/split-receipt', json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data['breakdown']['u1']['subtotal'] == 10.0  # only u1's half is tracked


def test_split_receipt_no_participants_returns_400():
    client = TestClient(app)
    response = client.post('/api/split-receipt', json={
        'items': [{'name': 'Pizza', 'price': 20.0}],
        'participants': [],
        'adjustment': 0.0
    })
    assert response.status_code == 400
    assert response.json()['detail'] == 'Participants array required.'


# ---------------------------------------------------------------------------
# /api/parse and /api/upload
# ---------------------------------------------------------------------------

def test_parse_receipt_success():
    client = TestClient(app)
    response = client.post('/api/parse', json={'raw_text': 'Bread 2.50\nMilk 3.20'})

    assert response.status_code == 200
    data = response.json()
    assert 'items' in data
    assert isinstance(data['items'], list)
    assert data['items'][0]['name'] == 'Bread'
    assert data['items'][0]['price'] == 2.5


def test_parse_receipt_missing_raw_text():
    client = TestClient(app)
    response = client.post('/api/parse', json={})

    assert response.status_code == 400
    assert response.json()['detail'] == 'raw_text required.'


def test_upload_receipt_invalid_file_type():
    client = TestClient(app)
    response = client.post('/api/upload', files={'file': ('text.txt', b'hello', 'text/plain')})

    assert response.status_code == 400
    assert response.json()['detail'] == 'Invalid image file.'


def test_upload_receipt_success(monkeypatch):
    def fake_image_to_string(image, config=None):
        return 'Hello World'

    def fake_preprocess_image(image):
        return 'fake-preprocessed-image'

    def fake_imdecode(array, flags):
        return 'fake-image'

    monkeypatch.setattr('main.cv2.imdecode', fake_imdecode)
    monkeypatch.setattr('main.preprocess_image', fake_preprocess_image)
    monkeypatch.setattr('main.pytesseract.image_to_string', fake_image_to_string)

    client = TestClient(app)
    response = client.post('/api/upload', files={'file': ('receipt.png', b'data', 'image/png')})

    assert response.status_code == 200
    assert response.json() == {'text': 'Hello World'}