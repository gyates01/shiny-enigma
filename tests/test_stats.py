def test_stats_empty(client):
    r = client.get("/api/stats")
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 0
    assert data["avg_calories"] is None
    assert data["avg_total_time_min"] is None
    assert data["by_cuisine"] == []
