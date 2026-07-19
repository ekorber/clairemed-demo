import json
from unittest.mock import patch

import pytest
from django.test import Client

from intake.models import Conversation, Message

pytestmark = pytest.mark.django_db


def events(response):
    body = b"".join(response.streaming_content).decode()
    return [json.loads(line[len("data: "):]) for line in body.split("\n\n") if line.startswith("data: ")]


def fake_stream(chunks):
    def _stream(conversation, history):
        yield from chunks
    return _stream


def test_start_conversation_streams_greeting_and_id():
    with patch("intake.views.stream_reply", fake_stream(["Hi Ana! What brings you in?", "\n<<STAGE:complaint>>"])):
        resp = Client().post(
            "/api/conversations/start/",
            data=json.dumps({"first_name": "Ana", "age": 34, "sex": "female"}),
            content_type="application/json",
        )
    assert resp["Content-Type"] == "text/event-stream"
    evts = events(resp)
    conv = Conversation.objects.get(pk=evts[0]["conversation_id"])
    # deltas may carry the newline that preceded the (stripped) marker — compare rstripped
    assert "".join(e["delta"] for e in evts if "delta" in e).rstrip() == "Hi Ana! What brings you in?"
    assert evts[-1] == {"done": True, "stage": "complaint", "interview_complete": False}
    saved = conv.messages.get()
    assert saved.role == "assistant" and "<<" not in saved.content


def test_send_message_persists_and_flags_completion():
    c = Conversation.objects.create(patient_first_name="Ana", patient_age=34, patient_sex="female")
    with patch("intake.views.stream_reply", fake_stream(["Take care!\n<<STAGE:wrap_up>>\n<<COMPLETE>>"])):
        resp = Client().post(
            f"/api/conversations/{c.id}/messages/",
            data=json.dumps({"content": "That's everything."}),
            content_type="application/json",
        )
    evts = events(resp)
    assert evts[-1] == {"done": True, "stage": "wrap_up", "interview_complete": True}
    roles = [m.role for m in c.messages.all()]
    assert roles == ["patient", "assistant"]


def test_message_too_long_rejected():
    c = Conversation.objects.create(patient_first_name="Ana", patient_age=34, patient_sex="female")
    resp = Client().post(
        f"/api/conversations/{c.id}/messages/",
        data=json.dumps({"content": "x" * 2001}),
        content_type="application/json",
    )
    assert resp.status_code == 400


def test_llm_failure_emits_error_event():
    c = Conversation.objects.create(patient_first_name="Ana", patient_age=34, patient_sex="female")

    def boom(conversation, history):
        raise RuntimeError("api down")
        yield  # pragma: no cover

    with patch("intake.views.stream_reply", boom):
        resp = Client().post(
            f"/api/conversations/{c.id}/messages/",
            data=json.dumps({"content": "hello"}),
            content_type="application/json",
        )
    assert "error" in events(resp)[-1]


def test_malformed_json_rejected():
    c = Conversation.objects.create(patient_first_name="Ana", patient_age=34, patient_sex="female")
    assert Client().post("/api/conversations/start/", data="not json", content_type="application/json").status_code == 400
    assert Client().post(f"/api/conversations/{c.id}/messages/", data="[1, 2]", content_type="application/json").status_code == 400
    assert c.messages.count() == 0


def test_retry_after_failure_does_not_duplicate_patient_message():
    c = Conversation.objects.create(patient_first_name="Ana", patient_age=34, patient_sex="female")

    def boom(conversation, history):
        raise RuntimeError("api down")
        yield  # pragma: no cover

    with patch("intake.views.stream_reply", boom):
        resp = Client().post(f"/api/conversations/{c.id}/messages/",
                             data=json.dumps({"content": "hello"}), content_type="application/json")
        events(resp)  # consume the stream
    with patch("intake.views.stream_reply", fake_stream(["Hi!\n<<STAGE:complaint>>"])):
        resp = Client().post(f"/api/conversations/{c.id}/messages/",
                             data=json.dumps({"content": "hello"}), content_type="application/json")
        events(resp)
    assert [m.content for m in c.messages.all()] == ["hello", "Hi!"]


def test_out_of_range_age_rejected():
    for bad_age in (-1, 0, 99999):
        resp = Client().post("/api/conversations/start/",
                             data=json.dumps({"first_name": "Ana", "age": bad_age, "sex": "female"}),
                             content_type="application/json")
        assert resp.status_code == 400, bad_age
    assert Conversation.objects.count() == 0
