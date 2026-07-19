import pytest

from intake.models import Conversation, Message, Note

pytestmark = pytest.mark.django_db


def make_conversation(**kwargs):
    defaults = dict(patient_first_name="Ana", patient_age=34, patient_sex="female")
    defaults.update(kwargs)
    return Conversation.objects.create(**defaults)


def test_conversation_defaults():
    c = make_conversation()
    assert c.status == Conversation.Status.ACTIVE
    assert c.chief_complaint_summary == ""
    assert c.has_red_flags is False
    assert c.created_at is not None


def test_messages_ordered_by_created_at():
    c = make_conversation()
    Message.objects.create(conversation=c, role=Message.Role.ASSISTANT, content="Hi Ana!")
    Message.objects.create(conversation=c, role=Message.Role.PATIENT, content="I have a headache")
    contents = [m.content for m in c.messages.all()]
    assert contents == ["Hi Ana!", "I have a headache"]


def test_note_one_to_one():
    c = make_conversation()
    Note.objects.create(conversation=c, data={"chief_complaint": "headache"}, red_flags=["thunderclap onset"])
    assert c.note.data["chief_complaint"] == "headache"
    assert c.note.red_flags == ["thunderclap onset"]
