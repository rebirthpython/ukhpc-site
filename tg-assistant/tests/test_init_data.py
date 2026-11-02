import hashlib
import hmac
import json
import time
from urllib.parse import urlencode

import pytest

from app.webapp_server import InitDataError, validate_init_data

TOKEN = "123456:TEST-token"


def make_init_data(user_id=42, auth_date=None, token=TOKEN):
    data = {
        "query_id": "AAE",
        "user": json.dumps({"id": user_id, "first_name": "Аня"}, ensure_ascii=False),
        "auth_date": str(auth_date or int(time.time())),
        "signature": "sig",
    }
    check = "\n".join(f"{k}={v}" for k, v in sorted(data.items()))
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    data["hash"] = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    return urlencode(data)


def test_valid():
    assert validate_init_data(make_init_data(), TOKEN)["id"] == 42


def test_wrong_token():
    with pytest.raises(InitDataError):
        validate_init_data(make_init_data(token="999:other"), TOKEN)


def test_tampered_user():
    raw = make_init_data().replace("42", "43")
    with pytest.raises(InitDataError):
        validate_init_data(raw, TOKEN)


def test_expired():
    with pytest.raises(InitDataError):
        validate_init_data(make_init_data(auth_date=int(time.time()) - 3 * 86400), TOKEN)
