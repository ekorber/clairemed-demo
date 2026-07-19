import json
from unittest.mock import patch

import pytest
from django.test import Client

from intake.models import Conversation, Message, Note

pytestmark = pytest.mark.django_db

FAKE_NOTE = {
    "chief_complaint": "Chest tightness on exertion",
    "summary_one_liner": "Chest tightness on exertion, 2 weeks",
    "hpi_narrative": "Ana reports two weeks of chest tightness when climbing stairs.",
    "red_flags": ["Chest pain with exertion"],
    "allergies": [{"substance": "Penicillin", "reaction": "rash", "severity": "mild"}],
    "medications": [{"name": "Lisinopril", "dose": "10 mg", "frequency": "daily"}],
    "medical_history": ["Hypertension"],
    "family_history": ["Father: heart disease"],
    "social_history": {"smoking": "Never", "alcohol": "Socially", "drugs": "None",
                       "occupation": "Teacher", "exercise": "Walks", "sleep": "6h", "stress": "Moderate"},
    "review_of_systems": {"positives": ["fatigue"], "negatives": ["no fever"]},
    "soap": {"subjective": "Two weeks of exertional chest tightness.",
             "objective": "To be completed at visit. No examination performed during pre-visit intake.",
             "assessment": ["Consider exploring cardiac risk factors"],
             "plan": ["Ask about palpitations", "Baseline ECG if indicated"]},
    "patient_quotes": ["like a band around my chest"],
}


@pytest.fixture
def conversation():
    c = Conversation.objects.create(patient_first_name="Ana", patient_age=34, patient_sex="female")
    Message.objects.create(conversation=c, role="patient", content="My chest feels tight")
    return c


def test_generate_note_persists_and_updates_conversation(conversation):
    with patch("intake.views.generate_note", return_value=FAKE_NOTE):
        resp = Client().post(f"/api/conversations/{conversation.id}/generate-note/")
    assert resp.status_code == 200
    assert resp.json()["data"]["chief_complaint"] == "Chest tightness on exertion"
    conversation.refresh_from_db()
    assert conversation.status == "complete"
    assert conversation.chief_complaint_summary == "Chest tightness on exertion, 2 weeks"
    assert conversation.has_red_flags is True
    assert conversation.note.red_flags == ["Chest pain with exertion"]


def test_generate_note_is_idempotent(conversation):
    with patch("intake.views.generate_note", return_value=FAKE_NOTE):
        Client().post(f"/api/conversations/{conversation.id}/generate-note/")
        resp = Client().post(f"/api/conversations/{conversation.id}/generate-note/")
    assert resp.status_code == 200
    assert Note.objects.filter(conversation=conversation).count() == 1


def test_generate_note_failure_recovers(conversation):
    with patch("intake.views.generate_note", side_effect=RuntimeError("api down")):
        resp = Client().post(f"/api/conversations/{conversation.id}/generate-note/")
    assert resp.status_code == 502
    conversation.refresh_from_db()
    assert conversation.status == "active"
