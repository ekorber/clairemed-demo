import pytest
from django.test import Client

from intake.models import Conversation, Message, Note

pytestmark = pytest.mark.django_db


@pytest.fixture
def conversation():
    c = Conversation.objects.create(
        patient_first_name="Ana", patient_age=34, patient_sex="female",
        chief_complaint_summary="Headache, 3 days", has_red_flags=True,
    )
    Message.objects.create(conversation=c, role="assistant", content="Hi Ana!")
    Message.objects.create(conversation=c, role="patient", content="I have a headache")
    Note.objects.create(conversation=c, data={"chief_complaint": "headache"}, red_flags=["thunderclap onset"])
    return c


def test_list_conversations(conversation):
    data = Client().get("/api/conversations/").json()
    assert len(data) == 1
    item = data[0]
    assert item["id"] == str(conversation.id)
    assert item["chief_complaint_summary"] == "Headache, 3 days"
    assert item["has_red_flags"] is True
    assert "messages" not in item


def test_conversation_detail(conversation):
    data = Client().get(f"/api/conversations/{conversation.id}/").json()
    assert [m["role"] for m in data["messages"]] == ["assistant", "patient"]
    assert data["note"]["data"]["chief_complaint"] == "headache"
    assert data["note"]["red_flags"] == ["thunderclap onset"]


def test_detail_without_note_returns_null_note(conversation):
    c2 = Conversation.objects.create(patient_first_name="Bo", patient_age=50, patient_sex="male")
    data = Client().get(f"/api/conversations/{c2.id}/").json()
    assert data["note"] is None
