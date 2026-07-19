import io
from unittest.mock import MagicMock, patch

from django.test import Client


def _audio(size=1000, name="clip.webm"):
    f = io.BytesIO(b"\0" * size)
    f.name = name
    return f


def test_transcribe_returns_text():
    with patch("intake.views.get_client") as get_client:
        get_client.return_value.audio.transcriptions.create.return_value = MagicMock(text="I have a headache")
        resp = Client().post("/api/transcribe/", {"audio": _audio()})
    assert resp.status_code == 200
    assert resp.json() == {"text": "I have a headache"}


def test_transcribe_rejects_missing_audio():
    assert Client().post("/api/transcribe/").status_code == 400


def test_transcribe_rejects_oversized_audio():
    resp = Client().post("/api/transcribe/", {"audio": _audio(size=2_000_001)})
    assert resp.status_code == 400


def test_transcribe_api_failure_returns_502():
    with patch("intake.views.get_client") as get_client:
        get_client.return_value.audio.transcriptions.create.side_effect = RuntimeError("down")
        resp = Client().post("/api/transcribe/", {"audio": _audio()})
    assert resp.status_code == 502
