import json
from unittest.mock import MagicMock, patch

import pytest

from intake.llm import note_generator
from intake.models import Conversation, Message

pytestmark = pytest.mark.django_db


def test_generate_note_forces_objective_placeholder_and_labels_transcript():
    c = Conversation.objects.create(patient_first_name="Ana", patient_age=34, patient_sex="female")
    Message.objects.create(conversation=c, role="assistant", content="Hi Ana!")
    Message.objects.create(conversation=c, role="patient", content="My chest feels tight")

    llm_payload = {"soap": {"objective": "Vitals stable, lungs clear"}}
    response = MagicMock()
    response.choices = [MagicMock()]
    response.choices[0].message.content = json.dumps(llm_payload)

    with patch.object(note_generator, "get_client") as get_client:
        get_client.return_value.chat.completions.create.return_value = response
        data = note_generator.generate_note(c)

    assert data["soap"]["objective"] == note_generator.OBJECTIVE_PLACEHOLDER

    kwargs = get_client.return_value.chat.completions.create.call_args.kwargs
    transcript = kwargs["messages"][1]["content"]
    assert "Claire: Hi Ana!" in transcript
    assert "Patient: My chest feels tight" in transcript
    assert kwargs["response_format"]["json_schema"]["strict"] is True
