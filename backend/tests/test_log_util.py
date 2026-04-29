import re

from app.log_util import make_request_id


def test_make_request_id_returns_prefixed_four_hex_chars():
    request_id = make_request_id("inv")

    assert re.fullmatch(r"inv:[0-9a-f]{4}", request_id)
