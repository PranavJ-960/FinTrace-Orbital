import pytest

from main import detect_spending_anomalies


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
