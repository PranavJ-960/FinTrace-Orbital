import json

import pytest
from fastapi.testclient import TestClient

from main import app


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
