def test_export_empty_db(client):
    r = client.get("/api/export")
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    assert "attachment" in r.headers["content-disposition"]
    assert ".xlsx" in r.headers["content-disposition"]
