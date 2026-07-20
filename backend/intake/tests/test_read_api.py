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


def test_delete_conversation_removes_it_from_the_list(conversation):
    assert Client().delete(f"/api/conversations/{conversation.id}/").status_code == 204
    assert Client().get("/api/conversations/").json() == []
    assert Client().get(f"/api/conversations/{conversation.id}/").status_code == 404


def test_delete_conversation_cascades_to_messages_and_note(conversation):
    # The cascade comes from the model definitions rather than the view, so assert it
    # rather than trusting it: orphaned messages would leak patient data.
    assert Message.objects.filter(conversation=conversation).exists()
    assert Note.objects.filter(conversation=conversation).exists()

    Client().delete(f"/api/conversations/{conversation.id}/")

    assert not Message.objects.filter(conversation=conversation).exists()
    assert not Note.objects.filter(conversation=conversation).exists()
    assert not Conversation.objects.filter(pk=conversation.id).exists()


def test_delete_leaves_other_conversations_alone(conversation):
    other = Conversation.objects.create(patient_first_name="Bo", patient_age=50, patient_sex="male")
    Message.objects.create(conversation=other, role="assistant", content="Hi Bo!")

    Client().delete(f"/api/conversations/{conversation.id}/")

    assert Conversation.objects.filter(pk=other.id).exists()
    assert Message.objects.filter(conversation=other).count() == 1


def test_delete_unknown_conversation_is_404():
    missing = "00000000-0000-0000-0000-000000000000"
    assert Client().delete(f"/api/conversations/{missing}/").status_code == 404
