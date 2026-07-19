import json

from django.conf import settings

from .interviewer import get_client

OBJECTIVE_PLACEHOLDER = "To be completed at visit — no examination performed during pre-visit intake."


def _arr(items="string"):
    return {"type": "array", "items": {"type": items} if isinstance(items, str) else items}


def _obj(props):
    return {"type": "object", "properties": props, "required": list(props), "additionalProperties": False}


NOTE_SCHEMA = _obj({
    "chief_complaint": {"type": "string"},
    "summary_one_liner": {"type": "string", "description": "Sidebar one-liner, max ~60 chars"},
    "hpi_narrative": {"type": "string"},
    "red_flags": _arr(),
    "allergies": _arr(_obj({"substance": {"type": "string"}, "reaction": {"type": "string"}, "severity": {"type": "string"}})),
    "medications": _arr(_obj({"name": {"type": "string"}, "dose": {"type": "string"}, "frequency": {"type": "string"}})),
    "medical_history": _arr(),
    "family_history": _arr(),
    "social_history": _obj({k: {"type": "string"} for k in
                            ["smoking", "alcohol", "drugs", "occupation", "exercise", "sleep", "stress"]}),
    "review_of_systems": _obj({"positives": _arr(), "negatives": _arr()}),
    "soap": _obj({"subjective": {"type": "string"}, "objective": {"type": "string"},
                  "assessment": _arr(), "plan": _arr()}),
    "patient_quotes": _arr(),
})

SCRIBE_PROMPT = f"""You are a meticulous clinical scribe. From the pre-visit intake conversation \
between Alice (assistant) and a patient, produce a structured pre-visit note for the physician.

Rules:
- Use ONLY information stated in the transcript. Never invent findings. Where a topic was not \
discussed, use an empty array or the string "Not discussed".
- patient_quotes: short verbatim phrases the patient used for key symptoms.
- red_flags: urgent or concerning symptom patterns surfaced in the interview (empty if none).
- soap.objective must be exactly: "{OBJECTIVE_PLACEHOLDER}"
- soap.assessment: themes and areas for the physician to explore — NOT diagnoses. Phrase each \
as "Consider exploring ...".
- soap.plan: concrete suggested follow-up questions and checks for the visit.
- hpi_narrative: one short paragraph, third person, plain prose.
- summary_one_liner: at most 60 characters, e.g. "Chest tightness on exertion, 2 wks"."""


def generate_note(conversation):
    transcript = "\n".join(
        f"{'Alice' if m.role == 'assistant' else 'Patient'}: {m.content}"
        for m in conversation.messages.all()
    )
    patient = (f"Patient: {conversation.patient_first_name}, {conversation.patient_age}, "
               f"{conversation.patient_sex}.")
    response = get_client().chat.completions.create(
        model=settings.CHAT_MODEL,
        messages=[
            {"role": "system", "content": SCRIBE_PROMPT},
            {"role": "user", "content": f"{patient}\n\nTRANSCRIPT:\n{transcript}"},
        ],
        response_format={"type": "json_schema",
                         "json_schema": {"name": "previsit_note", "strict": True, "schema": NOTE_SCHEMA}},
    )
    data = json.loads(response.choices[0].message.content)
    data["soap"]["objective"] = OBJECTIVE_PLACEHOLDER
    return data
