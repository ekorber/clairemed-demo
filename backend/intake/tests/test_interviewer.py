from unittest.mock import MagicMock, patch

import pytest

from intake.llm import interviewer
from intake.models import Conversation, Message

pytestmark = pytest.mark.django_db


@pytest.fixture
def conversation():
    return Conversation.objects.create(patient_first_name="Ana", patient_age=34, patient_sex="female")


def test_build_messages_includes_patient_context_and_history(conversation):
    history = [
        Message(conversation=conversation, role="assistant", content="Hi Ana!"),
        Message(conversation=conversation, role="patient", content="My chest feels tight"),
    ]
    msgs = interviewer.build_messages(conversation, history)
    assert msgs[0]["role"] == "system"
    assert "Ana" in msgs[0]["content"] and "34" in msgs[0]["content"]
    assert msgs[1] == {"role": "assistant", "content": "Hi Ana!"}
    assert msgs[2] == {"role": "user", "content": "My chest feels tight"}


def test_system_prompt_covers_core_domains():
    for term in ["OLDCARTS", "red flag", "allerg", "family", "<<STAGE:", "<<COMPLETE>>", "diagnos"]:
        assert term.lower() in interviewer.SYSTEM_PROMPT.lower()


def _chunk(text):
    chunk = MagicMock()
    chunk.choices = [MagicMock()]
    chunk.choices[0].delta.content = text
    return chunk


def test_stream_reply_yields_deltas(conversation):
    with patch.object(interviewer, "get_client") as get_client:
        get_client.return_value.chat.completions.create.return_value = iter(
            [_chunk("Hel"), _chunk(None), _chunk("lo")]
        )
        out = list(interviewer.stream_reply(conversation, []))
    assert out == ["Hel", "lo"]
    kwargs = get_client.return_value.chat.completions.create.call_args.kwargs
    assert kwargs["stream"] is True
    assert kwargs["model"]  # from settings, never hardcoded at call site
