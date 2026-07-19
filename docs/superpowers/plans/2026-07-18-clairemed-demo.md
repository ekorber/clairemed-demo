# ClaireMed Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the clairemed.ai demo — an AI patient-intake chat (streaming, with speech input) that produces a structured clinical note, served as a 3-page React SPA on a Django/MySQL backend, deployed with Docker Compose on a GCP VM.

**Architecture:** React SPA (Vite + TS + Tailwind) talks to a Django REST API. Chat replies stream over SSE-style `text/event-stream` responses (consumed with `fetch` + `ReadableStream`). Two OpenAI roles: an interviewer (`gpt-5-mini`, streaming, protocol markers for stage/completion) and a note generator (Structured Outputs against a JSON schema). Speech input uploads MediaRecorder audio to a transcription endpoint (`gpt-4o-mini-transcribe`).

**Tech Stack:** TypeScript, React 18+, Vite, Tailwind CSS v4, react-router-dom, vitest, Django 5.x, Django REST Framework, MySQL 8, `openai` Python SDK, pytest + pytest-django, gunicorn (gthread), nginx, Docker Compose, GCP Compute Engine.

**Spec:** `docs/superpowers/specs/2026-07-18-clairemed-demo-design.md` — read it before starting.

## Global Constraints

- No authentication anywhere — public demo.
- Model names come from env/settings only: `CHAT_MODEL` default `gpt-5-mini`, `TRANSCRIBE_MODEL` default `gpt-4o-mini-transcribe`. Never hardcode a model name at a call site.
- Secrets (OpenAI key, DB passwords, Django secret) live in `.env` (git-ignored). `.env.example` is committed with placeholders.
- Guardrails: patient message max 2,000 chars; interview hard cap 25 patient messages; audio uploads max 2 MB.
- Interviewer protocol markers (exact strings): `<<STAGE:complaint>>`, `<<STAGE:history>>`, `<<STAGE:lifestyle>>`, `<<STAGE:wrap_up>>`, `<<COMPLETE>>`.
- SSE event shapes (exact keys): `{"conversation_id": "<uuid>"}`, `{"delta": "<text>"}`, `{"done": true, "stage": "<stage>|null", "interview_complete": <bool>}`, `{"error": "<message>"}`.
- `soap.objective` in every generated note is exactly: `"To be completed at visit — no examination performed during pre-visit intake."`
- All UI responsive (Tailwind, mobile-first for chat). The agent never diagnoses.
- Backend tests run against SQLite (unset `MYSQL_HOST`); runtime uses MySQL. Run backend tests from `backend/` with `python -m pytest`.
- Commit after every task with the trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## File Structure

```
clairemed-demo/
├── docker-compose.yml            # db (MySQL 8) + web (gunicorn) + nginx
├── .env.example                  # committed placeholder env
├── .gitignore
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── pytest.ini
│   ├── manage.py
│   ├── clairemed/                # Django project: settings, urls, wsgi
│   └── intake/                   # the single app
│       ├── models.py             # Conversation, Message, Note
│       ├── serializers.py
│       ├── views.py              # health, list/detail, SSE streams, note, transcribe
│       ├── urls.py
│       ├── llm/
│       │   ├── markers.py        # MarkerFilter (stream marker protocol)
│       │   ├── interviewer.py    # system prompt + stream_reply()
│       │   └── note_generator.py # NOTE_SCHEMA + generate_note()
│       └── tests/                # test_* per module
├── frontend/
│   ├── package.json / vite.config.ts / tsconfig...
│   └── src/
│       ├── main.tsx / App.tsx    # router + nav shell
│       ├── index.css             # tailwind import
│       ├── api/types.ts          # shared TS types (mirror API/JSON schema)
│       ├── api/client.ts         # fetch helpers
│       ├── api/sse.ts            # readSse() stream parser
│       ├── chat/chatReducer.ts   # pure reducer (tested)
│       ├── chat/useChat.ts       # hook wrapping reducer + API
│       ├── chat/*.tsx            # StartForm, MicButton, StageIndicator, ChatPage
│       ├── notes/noteText.ts     # noteToText() for copy button (tested)
│       └── notes/*.tsx           # NotesPage, NoteView
└── nginx/
    ├── Dockerfile                # multi-stage: build SPA → nginx
    └── nginx.conf
```

---

### Task 1: Backend scaffold, settings, health endpoint, MySQL compose service

**Files:**
- Create: `backend/requirements.txt`, `backend/pytest.ini`, `backend/clairemed/settings.py` (replace generated), `backend/intake/views.py`, `backend/intake/urls.py`, `backend/intake/tests/test_health.py`, `docker-compose.yml` (db service only), `.env.example`, `.gitignore`

**Interfaces:**
- Produces: Django project `clairemed`, app `intake`, `GET /api/health/` → `{"status": "ok"}`; settings values `OPENAI_API_KEY`, `CHAT_MODEL`, `TRANSCRIBE_MODEL`; MySQL-if-env-set/SQLite-otherwise DB config. All later backend tasks build on this.

- [ ] **Step 1: System prerequisite for mysqlclient**

Run: `sudo apt-get install -y default-libmysqlclient-dev build-essential pkg-config` (skip if already installed).

- [ ] **Step 2: Create venv and project skeleton**

```bash
cd backend 2>/dev/null || mkdir backend && cd backend
python3 -m venv .venv && source .venv/bin/activate
printf 'Django>=5.1,<6\ndjangorestframework>=3.15\nmysqlclient>=2.2\ngunicorn>=22\nopenai>=1.50\npytest>=8\npytest-django>=4.8\n' > requirements.txt
pip install -r requirements.txt
django-admin startproject clairemed .
python manage.py startapp intake
mkdir intake/tests && touch intake/tests/__init__.py && rm intake/tests.py
```

- [ ] **Step 3: Replace `backend/clairemed/settings.py`**

```python
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-insecure-key")
DEBUG = os.environ.get("DJANGO_DEBUG", "1") == "1"
ALLOWED_HOSTS = os.environ.get("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.staticfiles",
    "rest_framework",
    "intake",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
]

ROOT_URLCONF = "clairemed.urls"
WSGI_APPLICATION = "clairemed.wsgi.application"
TEMPLATES = []
STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
USE_TZ = True
TIME_ZONE = "UTC"

if os.environ.get("MYSQL_HOST"):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.mysql",
            "NAME": os.environ.get("MYSQL_DATABASE", "clairemed"),
            "USER": os.environ.get("MYSQL_USER", "clairemed"),
            "PASSWORD": os.environ.get("MYSQL_PASSWORD", ""),
            "HOST": os.environ["MYSQL_HOST"],
            "PORT": os.environ.get("MYSQL_PORT", "3306"),
            "OPTIONS": {"charset": "utf8mb4"},
        }
    }
else:
    DATABASES = {
        "default": {"ENGINE": "django.db.backends.sqlite3", "NAME": BASE_DIR / "db.sqlite3"}
    }

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
CHAT_MODEL = os.environ.get("CHAT_MODEL", "gpt-5-mini")
TRANSCRIBE_MODEL = os.environ.get("TRANSCRIBE_MODEL", "gpt-4o-mini-transcribe")

REST_FRAMEWORK = {
    "UNAUTHENTICATED_USER": None,
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": [],
}
```

Note: no `django.contrib.admin`/`auth`/`sessions` — public demo, no auth (YAGNI). `TEMPLATES = []` is fine because we render nothing server-side.

- [ ] **Step 4: Write the failing health test — `backend/intake/tests/test_health.py`**

```python
from django.test import Client


def test_health_endpoint_returns_ok():
    response = Client().get("/api/health/")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

`backend/pytest.ini`:

```ini
[pytest]
DJANGO_SETTINGS_MODULE = clairemed.settings
python_files = test_*.py
```

Run: `python -m pytest` — Expected: FAIL (404, no such route).

- [ ] **Step 5: Implement health view and URLs**

`backend/intake/views.py` (replace file):

```python
from django.http import JsonResponse


def health(request):
    return JsonResponse({"status": "ok"})
```

`backend/intake/urls.py` (new):

```python
from django.urls import path

from . import views

urlpatterns = [
    path("health/", views.health),
]
```

`backend/clairemed/urls.py` (replace):

```python
from django.urls import include, path

urlpatterns = [
    path("api/", include("intake.urls")),
]
```

- [ ] **Step 6: Run tests** — `python -m pytest` — Expected: 1 passed.

- [ ] **Step 7: Compose db service, env example, gitignore (repo root)**

`docker-compose.yml`:

```yaml
services:
  db:
    image: mysql:8
    environment:
      MYSQL_DATABASE: ${MYSQL_DATABASE:-clairemed}
      MYSQL_USER: ${MYSQL_USER:-clairemed}
      MYSQL_PASSWORD: ${MYSQL_PASSWORD:-clairemed-dev}
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:-root-dev}
    ports:
      - "127.0.0.1:3306:3306"
    volumes:
      - dbdata:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-uroot", "-p${MYSQL_ROOT_PASSWORD:-root-dev}"]
      interval: 5s
      timeout: 3s
      retries: 20

volumes:
  dbdata:
```

`.env.example`:

```bash
OPENAI_API_KEY=sk-your-key-here
CHAT_MODEL=gpt-5-mini
TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
DJANGO_SECRET_KEY=change-me
DJANGO_DEBUG=0
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
MYSQL_HOST=db
MYSQL_DATABASE=clairemed
MYSQL_USER=clairemed
MYSQL_PASSWORD=change-me
MYSQL_ROOT_PASSWORD=change-me-too
```

`.gitignore`:

```
.env
backend/.venv/
backend/db.sqlite3
__pycache__/
*.pyc
frontend/node_modules/
frontend/dist/
```

- [ ] **Step 8: Verify MySQL connectivity once** — `docker compose up -d db`, wait for healthy (`docker compose ps`), then `MYSQL_HOST=127.0.0.1 MYSQL_PASSWORD=clairemed-dev python manage.py migrate` from `backend/` — Expected: migrations apply without error. (Day-to-day tests still use SQLite.)

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat: scaffold Django backend, health endpoint, MySQL compose service"
```

---

### Task 2: Data models

**Files:**
- Create: `backend/intake/tests/test_models.py`, migrations
- Modify: `backend/intake/models.py`

**Interfaces:**
- Produces: `Conversation(id: UUID pk, patient_first_name: str, patient_age: int, patient_sex: str, status: "active"|"generating"|"complete"|"abandoned", chief_complaint_summary: str, has_red_flags: bool, created_at, updated_at)`; `Message(conversation FK related_name="messages", role: "assistant"|"patient", content: str, created_at)` ordered by `created_at`; `Note(conversation OneToOne related_name="note", data: dict, red_flags: list, created_at)`.

- [ ] **Step 1: Write failing tests — `backend/intake/tests/test_models.py`**

```python
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
```

Run: `python -m pytest intake/tests/test_models.py -v` — Expected: FAIL (ImportError).

- [ ] **Step 2: Implement `backend/intake/models.py`**

```python
import uuid

from django.db import models


class Conversation(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active"
        GENERATING = "generating"
        COMPLETE = "complete"
        ABANDONED = "abandoned"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient_first_name = models.CharField(max_length=50)
    patient_age = models.PositiveSmallIntegerField()
    patient_sex = models.CharField(max_length=20)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.ACTIVE)
    chief_complaint_summary = models.CharField(max_length=200, blank=True, default="")
    has_red_flags = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]


class Message(models.Model):
    class Role(models.TextChoices):
        ASSISTANT = "assistant"
        PATIENT = "patient"

    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="messages")
    role = models.CharField(max_length=10, choices=Role.choices)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]


class Note(models.Model):
    conversation = models.OneToOneField(Conversation, on_delete=models.CASCADE, related_name="note")
    data = models.JSONField()
    red_flags = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)
```

- [ ] **Step 3: Make migrations and run tests**

Run: `python manage.py makemigrations intake && python -m pytest intake/tests/test_models.py -v` — Expected: 3 passed.

- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: Conversation, Message, Note models"`

---

### Task 3: Read API (conversation list + detail)

**Files:**
- Create: `backend/intake/serializers.py`, `backend/intake/tests/test_read_api.py`
- Modify: `backend/intake/views.py`, `backend/intake/urls.py`

**Interfaces:**
- Produces: `GET /api/conversations/` → list of `{id, patient_first_name, patient_age, patient_sex, status, chief_complaint_summary, has_red_flags, created_at}`; `GET /api/conversations/<uuid>/` → same fields plus `messages: [{role, content, created_at}]` and `note: {data, red_flags} | null`.

- [ ] **Step 1: Write failing tests — `backend/intake/tests/test_read_api.py`**

```python
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
```

Run: `python -m pytest intake/tests/test_read_api.py -v` — Expected: FAIL (404).

- [ ] **Step 2: Implement `backend/intake/serializers.py`**

```python
from rest_framework import serializers

from .models import Conversation, Message, Note

SUMMARY_FIELDS = [
    "id", "patient_first_name", "patient_age", "patient_sex",
    "status", "chief_complaint_summary", "has_red_flags", "created_at",
]


class MessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Message
        fields = ["role", "content", "created_at"]


class NoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Note
        fields = ["data", "red_flags"]


class ConversationSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Conversation
        fields = SUMMARY_FIELDS


class ConversationDetailSerializer(serializers.ModelSerializer):
    messages = MessageSerializer(many=True, read_only=True)
    note = NoteSerializer(read_only=True)

    class Meta:
        model = Conversation
        fields = SUMMARY_FIELDS + ["messages", "note"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if not hasattr(instance, "note"):
            data["note"] = None
        return data
```

- [ ] **Step 3: Add views and routes**

Append to `backend/intake/views.py`:

```python
from rest_framework.generics import ListAPIView, RetrieveAPIView

from .models import Conversation
from .serializers import ConversationDetailSerializer, ConversationSummarySerializer


class ConversationListView(ListAPIView):
    queryset = Conversation.objects.all()
    serializer_class = ConversationSummarySerializer


class ConversationDetailView(RetrieveAPIView):
    queryset = Conversation.objects.prefetch_related("messages")
    serializer_class = ConversationDetailSerializer
```

`backend/intake/urls.py` becomes:

```python
from django.urls import path

from . import views

urlpatterns = [
    path("health/", views.health),
    path("conversations/", views.ConversationListView.as_view()),
    path("conversations/<uuid:pk>/", views.ConversationDetailView.as_view()),
]
```

- [ ] **Step 4: Run tests** — `python -m pytest -v` — Expected: all pass.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: conversation list and detail read API"`

---

### Task 4: MarkerFilter — stream marker protocol

**Files:**
- Create: `backend/intake/llm/__init__.py`, `backend/intake/llm/markers.py`, `backend/intake/tests/test_markers.py`

**Interfaces:**
- Produces: `MarkerFilter` with `feed(delta: str) -> str` (returns patient-visible text, holding back potential markers), `finish() -> str` (flushes remainder, strips markers), and attributes `stage: str | None`, `complete: bool`. Markers per Global Constraints.

- [ ] **Step 1: Write failing tests — `backend/intake/tests/test_markers.py`**

```python
from intake.llm.markers import MarkerFilter


def run(chunks):
    f = MarkerFilter()
    out = "".join(f.feed(c) for c in chunks) + f.finish()
    return out.rstrip(), f  # callers rstrip assembled replies (views do the same)


def test_plain_text_passes_through():
    out, f = run(["Hello ", "Ana!"])
    assert out == "Hello Ana!"
    assert f.stage is None and f.complete is False


def test_stage_marker_stripped_and_captured():
    out, f = run(["What brings you in today?\n", "<<STAGE:complaint>>"])
    assert out == "What brings you in today?"
    assert f.stage == "complaint"


def test_complete_marker_sets_flag():
    out, f = run(["Take care!\n<<STAGE:wrap_up>>\n<<COMPLETE>>"])
    assert out == "Take care!"
    assert f.stage == "wrap_up" and f.complete is True


def test_marker_split_across_chunks():
    out, f = run(["Thanks.\n<<STA", "GE:hist", "ory>>"])
    assert out == "Thanks."
    assert f.stage == "history"


def test_literal_angle_brackets_survive():
    out, f = run(["Is your temperature < 38, or 38 <", "< higher readings?"])
    assert out == "Is your temperature < 38, or 38 << higher readings?"
```

Run: `python -m pytest intake/tests/test_markers.py -v` — Expected: FAIL (ImportError).

- [ ] **Step 2: Implement `backend/intake/llm/markers.py`** (and empty `__init__.py`)

```python
import re

MARKER_RE = re.compile(r"<<STAGE:([a-z_]+)>>|<<COMPLETE>>")
MAX_MARKER_LEN = 24  # longest marker is <<STAGE:...>>; beyond this it's not a marker


class MarkerFilter:
    """Strips protocol markers out of a token stream while passing visible text through.

    Text after a '<' is held back until we can tell whether it starts a marker.
    """

    def __init__(self):
        self._pending = ""
        self.stage = None
        self.complete = False

    def _apply(self, match):
        if match.group(0) == "<<COMPLETE>>":
            self.complete = True
        else:
            self.stage = match.group(1)

    def feed(self, delta: str) -> str:
        self._pending += delta
        out = []
        while True:
            i = self._pending.find("<")
            if i == -1:
                out.append(self._pending)
                self._pending = ""
                break
            out.append(self._pending[:i])
            self._pending = self._pending[i:]
            if len(self._pending) == 1:
                break  # lone '<' — need more input
            if not self._pending.startswith("<<"):
                out.append("<")
                self._pending = self._pending[1:]
                continue
            match = MARKER_RE.match(self._pending)
            if match:
                self._apply(match)
                self._pending = self._pending[match.end():]
                continue
            if ">>" in self._pending or len(self._pending) > MAX_MARKER_LEN:
                out.append("<<")  # '<<' that isn't a marker
                self._pending = self._pending[2:]
                continue
            break  # possible marker prefix — wait for more input
        return "".join(out)

    def finish(self) -> str:
        def repl(match):
            self._apply(match)
            return ""

        out = MARKER_RE.sub(repl, self._pending)
        self._pending = ""
        return out.rstrip()
```

Note: callers should `rstrip()` the fully assembled reply; `finish()` only rstrips the tail it returns.

- [ ] **Step 3: Run tests** — Expected: 5 passed. (If `test_literal_angle_brackets_survive` fails on the `38 <<` case, check the `">>" in ...` branch — held-back `<<` with no closing `>>` must flush in `finish()` via the regex-sub path returning the raw text.)
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: MarkerFilter for interview stream protocol"`

---

### Task 5: Interviewer LLM module

**Files:**
- Create: `backend/intake/llm/interviewer.py`, `backend/intake/tests/test_interviewer.py`

**Interfaces:**
- Consumes: `Conversation`, `Message` (Task 2); settings `CHAT_MODEL`, `OPENAI_API_KEY`.
- Produces: `build_messages(conversation, history: list[Message]) -> list[dict]` (OpenAI chat messages incl. system prompt); `stream_reply(conversation, history) -> Iterator[str]` (yields text deltas). Task 6 patches `stream_reply` in tests.

- [ ] **Step 1: Write failing tests — `backend/intake/tests/test_interviewer.py`**

```python
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
```

Run: `python -m pytest intake/tests/test_interviewer.py -v` — Expected: FAIL (ImportError).

- [ ] **Step 2: Implement `backend/intake/llm/interviewer.py`**

```python
from django.conf import settings
from openai import OpenAI

SYSTEM_PROMPT = """You are Claire, a warm, professional medical intake assistant conducting a \
pre-visit interview. You are NOT a doctor. You NEVER diagnose, interpret findings, or recommend \
treatment. If asked, gently explain you only gather information for the doctor. Your job is to \
take a thorough history so the physician enters the visit fully prepared.

STYLE
- Ask exactly ONE question per message; 1-3 short sentences total.
- Plain, warm language — no medical jargon ("make it worse", not "exacerbating").
- Briefly acknowledge the previous answer before the next question.

INTERVIEW STRUCTURE (adapt freely: skip the irrelevant, dig into the concerning)
1. Greet the patient by name and ask what brings them in (chief complaint).
2. Explore the complaint using OLDCARTS: Onset, Location, Duration, Character, \
Aggravating/alleviating factors, Radiation and related symptoms, Timing, Severity 0-10.
3. Screen for red flags relevant to the complaint. Examples — chest pain: shortness of \
breath, sweating, pain spreading to arm or jaw; headache: sudden worst-ever onset, vision \
changes, stiff neck; abdominal pain: blood in stool or vomit, fever, rigid belly. If a red \
flag is present, stay calm, note it, and say: "That's something the doctor will want to look \
at promptly — if it gets severe, please seek urgent care right away."
4. Past medical history: ongoing conditions, surgeries, hospitalizations.
5. Current medications, including over-the-counter and supplements — names, doses, and \
whether they take them regularly.
6. Allergies (medicines, foods, environment) and what reaction each causes.
7. Family history in parents and siblings: heart disease, diabetes, cancer, stroke, \
mental health conditions, anything that "runs in the family".
8. Social history: smoking or vaping, alcohol, recreational drugs, occupation, exercise, \
sleep, stress.
9. Brief relevant review of systems: fever, chills, weight change, fatigue, appetite.
10. Wrap up: summarize what you heard in 2-3 sentences, say the doctor will review it \
before the visit, and wish them well.

PACE: aim to finish within 10-15 patient replies. If the patient has sent 25 or more \
messages, wrap up immediately with what you have.

PROTOCOL MARKERS (mandatory; invisible to the patient — never mention or explain them)
End EVERY message with exactly one stage marker on its own final line:
<<STAGE:complaint>> during steps 1-3, <<STAGE:history>> during steps 4-7, \
<<STAGE:lifestyle>> during steps 8-9, <<STAGE:wrap_up>> during step 10.
After your final wrap-up message only, add <<COMPLETE>> on its own line after the stage marker."""


def get_client():
    return OpenAI(api_key=settings.OPENAI_API_KEY)


def build_messages(conversation, history):
    context = (
        f"\n\nPATIENT: {conversation.patient_first_name}, "
        f"{conversation.patient_age} years old, {conversation.patient_sex}. "
        f"Patient messages so far: {sum(1 for m in history if m.role == 'patient')}."
    )
    messages = [{"role": "system", "content": SYSTEM_PROMPT + context}]
    for m in history:
        role = "assistant" if m.role == "assistant" else "user"
        messages.append({"role": role, "content": m.content})
    return messages


def stream_reply(conversation, history):
    stream = get_client().chat.completions.create(
        model=settings.CHAT_MODEL,
        messages=build_messages(conversation, history),
        stream=True,
        reasoning_effort="minimal",
    )
    for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta
```

(If the OpenAI API rejects `reasoning_effort` for the configured model, delete that argument — it's a latency optimization only.)

- [ ] **Step 3: Run tests** — `python -m pytest intake/tests/test_interviewer.py -v` — Expected: 3 passed.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: interviewer LLM module with clinical system prompt"`

---

### Task 6: Streaming chat endpoints (start conversation + send message)

**Files:**
- Create: `backend/intake/tests/test_chat_api.py`
- Modify: `backend/intake/views.py`, `backend/intake/urls.py`

**Interfaces:**
- Consumes: `stream_reply` (Task 5), `MarkerFilter` (Task 4).
- Produces: `POST /api/conversations/start/` body `{"first_name", "age", "sex"}` → `text/event-stream`: first event `{"conversation_id": "<uuid>"}`, then `{"delta": ...}`*, then `{"done": true, "stage", "interview_complete"}`. `POST /api/conversations/<uuid>/messages/` body `{"content": str}` → same stream minus the id event. Both persist Messages; errors emit `{"error": ...}` as the final event. Frontend (Task 10) consumes these exact shapes.

- [ ] **Step 1: Write failing tests — `backend/intake/tests/test_chat_api.py`**

```python
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
```

Run: `python -m pytest intake/tests/test_chat_api.py -v` — Expected: FAIL (404).

- [ ] **Step 2: Implement streaming views — append to `backend/intake/views.py`**

```python
import json

from django.http import HttpResponseBadRequest, StreamingHttpResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from .llm.interviewer import stream_reply
from .llm.markers import MarkerFilter
from .models import Message

MAX_MESSAGE_CHARS = 2000


def _sse(payload):
    return f"data: {json.dumps(payload)}\n\n"


def _reply_stream(conversation, first_event=None):
    """Stream Claire's next reply for `conversation`, persisting it when done."""
    def gen():
        if first_event is not None:
            yield _sse(first_event)
        try:
            history = list(conversation.messages.all())
            marker_filter = MarkerFilter()
            parts = []
            for delta in stream_reply(conversation, history):
                visible = marker_filter.feed(delta)
                if visible:
                    parts.append(visible)
                    yield _sse({"delta": visible})
            tail = marker_filter.finish()
            if tail:
                parts.append(tail)
                yield _sse({"delta": tail})
            full = "".join(parts).rstrip()
            Message.objects.create(conversation=conversation, role=Message.Role.ASSISTANT, content=full)
            yield _sse({
                "done": True,
                "stage": marker_filter.stage,
                "interview_complete": marker_filter.complete,
            })
        except Exception:
            yield _sse({"error": "Claire had trouble replying. Please try again."})

    response = StreamingHttpResponse(gen(), content_type="text/event-stream")
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response


@csrf_exempt
@require_POST
def start_conversation(request):
    body = json.loads(request.body)
    try:
        conversation = Conversation.objects.create(
            patient_first_name=str(body["first_name"])[:50],
            patient_age=int(body["age"]),
            patient_sex=str(body["sex"])[:20],
        )
    except (KeyError, ValueError):
        return HttpResponseBadRequest("first_name, age and sex are required")
    return _reply_stream(conversation, first_event={"conversation_id": str(conversation.id)})


@csrf_exempt
@require_POST
def send_message(request, pk):
    conversation = get_object_or_404(Conversation, pk=pk, status=Conversation.Status.ACTIVE)
    body = json.loads(request.body)
    content = str(body.get("content", "")).strip()
    if not content or len(content) > MAX_MESSAGE_CHARS:
        return HttpResponseBadRequest(f"content must be 1-{MAX_MESSAGE_CHARS} characters")
    Message.objects.create(conversation=conversation, role=Message.Role.PATIENT, content=content)
    return _reply_stream(conversation)
```

Add routes to `backend/intake/urls.py` `urlpatterns`:

```python
    path("conversations/start/", views.start_conversation),
    path("conversations/<uuid:pk>/messages/", views.send_message),
```

- [ ] **Step 3: Run tests** — `python -m pytest -v` — Expected: all pass.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: SSE streaming chat endpoints"`

---

### Task 7: Note generator + generate-note endpoint

**Files:**
- Create: `backend/intake/llm/note_generator.py`, `backend/intake/tests/test_note_api.py`
- Modify: `backend/intake/views.py`, `backend/intake/urls.py`

**Interfaces:**
- Consumes: models, `get_client` pattern from Task 5.
- Produces: `generate_note(conversation) -> dict` (validated against `NOTE_SCHEMA`); `POST /api/conversations/<uuid>/generate-note/` → 200 `{data, red_flags}`; sets `conversation.status="complete"`, `chief_complaint_summary`, `has_red_flags`; idempotent (regenerates, overwrites Note); on LLM failure → 502 and status back to `active`. Note JSON keys (frontend Task 10/14 mirror these exactly): `chief_complaint, summary_one_liner, hpi_narrative, red_flags[], allergies[{substance,reaction,severity}], medications[{name,dose,frequency}], medical_history[], family_history[], social_history{smoking,alcohol,drugs,occupation,exercise,sleep,stress}, review_of_systems{positives[],negatives[]}, soap{subjective,objective,assessment[],plan[]}, patient_quotes[]`.

- [ ] **Step 1: Write failing tests — `backend/intake/tests/test_note_api.py`**

```python
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
             "objective": "To be completed at visit — no examination performed during pre-visit intake.",
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
```

Run: `python -m pytest intake/tests/test_note_api.py -v` — Expected: FAIL.

- [ ] **Step 2: Implement `backend/intake/llm/note_generator.py`**

```python
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
between Claire (assistant) and a patient, produce a structured pre-visit note for the physician.

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
        f"{'Claire' if m.role == 'assistant' else 'Patient'}: {m.content}"
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
    return json.loads(response.choices[0].message.content)
```

- [ ] **Step 3: Implement the endpoint — append to `backend/intake/views.py`**

```python
from .llm.note_generator import generate_note
from .models import Conversation, Note


@csrf_exempt
@require_POST
def generate_note_view(request, pk):
    conversation = get_object_or_404(Conversation, pk=pk)
    previous_status = conversation.status
    conversation.status = Conversation.Status.GENERATING
    conversation.save(update_fields=["status", "updated_at"])
    try:
        data = generate_note(conversation)
    except Exception:
        conversation.status = (previous_status if previous_status != Conversation.Status.GENERATING
                               else Conversation.Status.ACTIVE)
        conversation.save(update_fields=["status", "updated_at"])
        return JsonResponse({"error": "Note generation failed. Please retry."}, status=502)
    red_flags = data.get("red_flags", [])
    Note.objects.update_or_create(conversation=conversation,
                                  defaults={"data": data, "red_flags": red_flags})
    conversation.status = Conversation.Status.COMPLETE
    conversation.chief_complaint_summary = data.get("summary_one_liner", "")[:200]
    conversation.has_red_flags = bool(red_flags)
    conversation.save(update_fields=["status", "chief_complaint_summary", "has_red_flags", "updated_at"])
    return JsonResponse({"data": data, "red_flags": red_flags})
```

Route: `path("conversations/<uuid:pk>/generate-note/", views.generate_note_view),`

- [ ] **Step 4: Run tests** — `python -m pytest -v` — Expected: all pass.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: structured note generation endpoint"`

---

### Task 8: Transcription endpoint

**Files:**
- Create: `backend/intake/tests/test_transcribe.py`
- Modify: `backend/intake/views.py`, `backend/intake/urls.py`

**Interfaces:**
- Produces: `POST /api/transcribe/` multipart field `audio` → 200 `{"text": "<transcript>"}`; 400 if missing/oversized (>2 MB); 502 on API failure.

- [ ] **Step 1: Write failing tests — `backend/intake/tests/test_transcribe.py`**

```python
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
```

Run: `python -m pytest intake/tests/test_transcribe.py -v` — Expected: FAIL.

- [ ] **Step 2: Implement — append to `backend/intake/views.py`**

```python
from django.conf import settings

from .llm.interviewer import get_client

MAX_AUDIO_BYTES = 2_000_000


@csrf_exempt
@require_POST
def transcribe(request):
    audio = request.FILES.get("audio")
    if audio is None or audio.size > MAX_AUDIO_BYTES:
        return JsonResponse({"error": "audio file required, max 2 MB"}, status=400)
    try:
        result = get_client().audio.transcriptions.create(
            model=settings.TRANSCRIBE_MODEL,
            file=(audio.name or "audio.webm", audio.read(), audio.content_type or "audio/webm"),
        )
    except Exception:
        return JsonResponse({"error": "Transcription failed. Please type instead."}, status=502)
    return JsonResponse({"text": result.text})
```

Route: `path("transcribe/", views.transcribe),`

- [ ] **Step 3: Run tests** — `python -m pytest -v` — Expected: all pass. Backend is feature-complete.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: audio transcription endpoint"`

---

### Task 9: Frontend scaffold + Home page

**Files:**
- Create: `frontend/` (Vite react-ts template), `frontend/vite.config.ts`, `frontend/src/index.css`, `frontend/src/App.tsx`, `frontend/src/home/HomePage.tsx`, placeholder `frontend/src/chat/ChatPage.tsx` and `frontend/src/notes/NotesPage.tsx`

**Interfaces:**
- Produces: routed SPA shell — `/` Home, `/chat`, `/notes`, `/notes/:id`; nav header; `/api` proxied to `localhost:8000` in dev; `npm test` (vitest) wired. Later tasks replace the placeholder pages.

- [ ] **Step 1: Scaffold (repo root)**

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install react-router-dom
npm install -D tailwindcss @tailwindcss/vite vitest jsdom @testing-library/react @testing-library/jest-dom
```

Remove template noise: `rm src/App.css src/assets/react.svg public/vite.svg`.

- [ ] **Step 2: Config**

`frontend/vite.config.ts` (replace):

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { "/api": "http://localhost:8000" } },
  test: { environment: "jsdom", setupFiles: "./src/test-setup.ts" },
});
```

`frontend/src/test-setup.ts`: `import "@testing-library/jest-dom/vitest";`

`frontend/src/index.css` (replace): `@import "tailwindcss";`

Add to `package.json` scripts: `"test": "vitest run"`.

- [ ] **Step 3: App shell — `frontend/src/App.tsx` (replace)**

```tsx
import { BrowserRouter, Link, NavLink, Route, Routes } from "react-router-dom";
import HomePage from "./home/HomePage";
import ChatPage from "./chat/ChatPage";
import NotesPage from "./notes/NotesPage";

const navLink = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-1.5 text-sm font-medium ${isActive ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-100"}`;

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link to="/" className="text-lg font-bold text-teal-700">Claire<span className="text-slate-400">Med demo</span></Link>
            <nav className="flex gap-1">
              <NavLink to="/" end className={navLink}>Home</NavLink>
              <NavLink to="/chat" className={navLink}>Intake chat</NavLink>
              <NavLink to="/notes" className={navLink}>Notes</NavLink>
            </nav>
          </div>
        </header>
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/notes" element={<NotesPage />} />
            <Route path="/notes/:id" element={<NotesPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
```

Update `frontend/src/main.tsx` if needed so it renders `<App />` and imports `./index.css` only.

- [ ] **Step 4: Home page — `frontend/src/home/HomePage.tsx`**

```tsx
import { Link } from "react-router-dom";

const stages = [
  { title: "1 · Intake", body: "Claire interviews the patient before the visit — one question at a time, adapting follow-ups to each answer, with speech or text input." },
  { title: "2 · History capture", body: "Answers are structured into chief complaint, HPI (OLDCARTS), medications, allergies, family and social history — red flags surfaced early." },
  { title: "3 · Note drafting", body: "A draft SOAP note is generated for the physician to review — subjective filled in, assessment framed as areas to explore, never a diagnosis." },
];

const tech = [
  "React + TypeScript + Tailwind (Vite)", "Django + DRF, SSE token streaming",
  "MySQL 8", "OpenAI gpt-5-mini (interview + structured note)",
  "OpenAI gpt-4o-mini-transcribe (speech input)", "Docker Compose on a GCP Compute Engine VM",
];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <section className="text-center">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">An AI clinical partner, <span className="text-teal-600">demoed end-to-end</span></h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
          A working recreation of clairemed.ai's core loop: a pre-visit AI intake interview that
          becomes a structured, physician-ready clinical note.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/chat" className="rounded-lg bg-teal-600 px-5 py-2.5 font-semibold text-white hover:bg-teal-700">Start a patient intake</Link>
          <Link to="/notes" className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 font-semibold hover:bg-slate-100">View notes</Link>
          <a href="https://github.com/ekorber/clairemed-demo" className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 font-semibold hover:bg-slate-100">GitHub ↗</a>
        </div>
      </section>
      <section className="mt-16 grid gap-6 sm:grid-cols-3">
        {stages.map((s) => (
          <div key={s.title} className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="font-semibold text-teal-700">{s.title}</h2>
            <p className="mt-2 text-sm text-slate-600">{s.body}</p>
          </div>
        ))}
      </section>
      <section className="mt-16">
        <h2 className="text-xl font-bold">Under the hood</h2>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {tech.map((t) => (
            <li key={t} className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700">{t}</li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-slate-500">
          Demo only — not a medical device. Claire gathers information and never diagnoses.
        </p>
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Placeholder pages** — `frontend/src/chat/ChatPage.tsx` and `frontend/src/notes/NotesPage.tsx`, each:

```tsx
export default function ChatPage() {
  return <div className="p-8 text-slate-500">Coming soon.</div>;
}
```

(Name the second one `NotesPage`.)

- [ ] **Step 6: Verify** — `npm run build` (Expected: builds clean) and `npm run dev`, open http://localhost:5173 — home page renders, nav works, mobile viewport looks right (dev-tools device toolbar).
- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat: frontend scaffold with home page and routing"`

---

### Task 10: API types, client, and SSE parser

**Files:**
- Create: `frontend/src/api/types.ts`, `frontend/src/api/sse.ts`, `frontend/src/api/client.ts`, `frontend/src/api/sse.test.ts`

**Interfaces:**
- Consumes: backend endpoints (Tasks 3, 6, 7, 8) — exact event/JSON shapes from Global Constraints and Task 7.
- Produces: `readSse(res: Response): AsyncGenerator<ChatEvent>`; `api.startConversation({firstName, age, sex}): Promise<Response>`; `api.sendMessage(id, content): Promise<Response>`; `api.generateNote(id): Promise<NoteResult>`; `api.fetchConversations(): Promise<ConversationSummary[]>`; `api.fetchConversation(id): Promise<ConversationDetail>`; `api.transcribe(blob): Promise<string>`. Types `NoteData`, `ConversationSummary`, `ConversationDetail`, `ChatEvent`.

- [ ] **Step 1: Types — `frontend/src/api/types.ts`**

```ts
export type ChatEvent =
  | { conversation_id: string }
  | { delta: string }
  | { done: true; stage: string | null; interview_complete: boolean }
  | { error: string };

export interface NoteData {
  chief_complaint: string;
  summary_one_liner: string;
  hpi_narrative: string;
  red_flags: string[];
  allergies: { substance: string; reaction: string; severity: string }[];
  medications: { name: string; dose: string; frequency: string }[];
  medical_history: string[];
  family_history: string[];
  social_history: { smoking: string; alcohol: string; drugs: string; occupation: string; exercise: string; sleep: string; stress: string };
  review_of_systems: { positives: string[]; negatives: string[] };
  soap: { subjective: string; objective: string; assessment: string[]; plan: string[] };
  patient_quotes: string[];
}

export interface NoteResult { data: NoteData; red_flags: string[] }

export interface ConversationSummary {
  id: string;
  patient_first_name: string;
  patient_age: number;
  patient_sex: string;
  status: "active" | "generating" | "complete" | "abandoned";
  chief_complaint_summary: string;
  has_red_flags: boolean;
  created_at: string;
}

export interface ConversationDetail extends ConversationSummary {
  messages: { role: "assistant" | "patient"; content: string; created_at: string }[];
  note: { data: NoteData; red_flags: string[] } | null;
}
```

- [ ] **Step 2: Failing parser test — `frontend/src/api/sse.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { readSse } from "./sse";

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      chunks.forEach((c) => controller.enqueue(encoder.encode(c)));
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
}

describe("readSse", () => {
  it("yields parsed events, tolerating chunk boundaries mid-event", async () => {
    const res = sseResponse([
      'data: {"conversation_id": "abc"}\n\ndata: {"del',
      'ta": "Hi"}\n\ndata: {"done": true, "stage": "complaint", "interview_complete": false}\n\n',
    ]);
    const events = [];
    for await (const e of readSse(res)) events.push(e);
    expect(events).toEqual([
      { conversation_id: "abc" },
      { delta: "Hi" },
      { done: true, stage: "complaint", interview_complete: false },
    ]);
  });
});
```

Run: `npm test` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement `frontend/src/api/sse.ts`**

```ts
import type { ChatEvent } from "./types";

export async function* readSse(res: Response): AsyncGenerator<ChatEvent> {
  if (!res.ok || !res.body) throw new Error(`stream failed (${res.status})`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const line = raw.split("\n").find((l) => l.startsWith("data: "));
      if (line) yield JSON.parse(line.slice(6)) as ChatEvent;
    }
  }
}
```

- [ ] **Step 4: Implement `frontend/src/api/client.ts`**

```ts
import type { ConversationDetail, ConversationSummary, NoteResult } from "./types";

const JSON_HEADERS = { "Content-Type": "application/json" };

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`request failed (${res.status})`);
  return res.json() as Promise<T>;
}

export const api = {
  startConversation(p: { firstName: string; age: number; sex: string }): Promise<Response> {
    return fetch("/api/conversations/start/", {
      method: "POST", headers: JSON_HEADERS,
      body: JSON.stringify({ first_name: p.firstName, age: p.age, sex: p.sex }),
    });
  },
  sendMessage(id: string, content: string): Promise<Response> {
    return fetch(`/api/conversations/${id}/messages/`, {
      method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ content }),
    });
  },
  async generateNote(id: string): Promise<NoteResult> {
    return asJson(await fetch(`/api/conversations/${id}/generate-note/`, { method: "POST" }));
  },
  async fetchConversations(): Promise<ConversationSummary[]> {
    return asJson(await fetch("/api/conversations/"));
  },
  async fetchConversation(id: string): Promise<ConversationDetail> {
    return asJson(await fetch(`/api/conversations/${id}/`));
  },
  async transcribe(blob: Blob): Promise<string> {
    const form = new FormData();
    form.append("audio", blob, "clip.webm");
    const { text } = await asJson<{ text: string }>(await fetch("/api/transcribe/", { method: "POST", body: form }));
    return text;
  },
};
```

- [ ] **Step 5: Run** — `npm test` (Expected: PASS) and `npx tsc --noEmit` (Expected: clean).
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: typed API client and SSE stream parser"`

---

### Task 11: Chat reducer + useChat hook

**Files:**
- Create: `frontend/src/chat/chatReducer.ts`, `frontend/src/chat/chatReducer.test.ts`, `frontend/src/chat/useChat.ts`

**Interfaces:**
- Consumes: `api`, `readSse`, `ChatEvent` (Task 10).
- Produces: `chatReducer(state, action)`, `initialChatState`; types `ChatState { conversationId, messages: {role, content}[], streaming: string, stage: string | null, phase: "form"|"starting"|"idle"|"streaming"|"generating"|"done"|"error", errorKind: "chat"|"note"|null, error: string|null, interviewComplete: boolean }`; hook `useChat(): { state, start(p), send(content, opts?), retryLastSend(), generate() }`. Task 12 renders from this.

- [ ] **Step 1: Failing reducer tests — `frontend/src/chat/chatReducer.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { chatReducer, initialChatState, type ChatState } from "./chatReducer";

const reduce = (state: ChatState, ...actions: Parameters<typeof chatReducer>[1][]) =>
  actions.reduce(chatReducer, state);

describe("chatReducer", () => {
  it("full happy path: start → stream greeting → send → complete", () => {
    let s = reduce(initialChatState, { type: "START" });
    expect(s.phase).toBe("starting");
    s = reduce(s, { type: "CONVERSATION_ID", id: "abc" }, { type: "DELTA", text: "Hi Ana!" });
    expect(s.phase).toBe("streaming");
    expect(s.streaming).toBe("Hi Ana!");
    s = reduce(s, { type: "STREAM_DONE", stage: "complaint", interviewComplete: false });
    expect(s.phase).toBe("idle");
    expect(s.messages).toEqual([{ role: "assistant", content: "Hi Ana!" }]);
    expect(s.streaming).toBe("");
    s = reduce(s, { type: "PATIENT_MESSAGE", content: "Headache" },
      { type: "DELTA", text: "Bye!" },
      { type: "STREAM_DONE", stage: "wrap_up", interviewComplete: true });
    expect(s.messages.map((m) => m.role)).toEqual(["assistant", "patient", "assistant"]);
    expect(s.interviewComplete).toBe(true);
  });

  it("error during chat keeps history and drops partial stream", () => {
    let s = reduce(initialChatState, { type: "START" }, { type: "CONVERSATION_ID", id: "abc" },
      { type: "STREAM_DONE", stage: "complaint", interviewComplete: false },
      { type: "PATIENT_MESSAGE", content: "Hi" }, { type: "DELTA", text: "par" },
      { type: "ERROR", kind: "chat", message: "oops" });
    expect(s.phase).toBe("error");
    expect(s.errorKind).toBe("chat");
    expect(s.streaming).toBe("");
    expect(s.messages.at(-1)).toEqual({ role: "patient", content: "Hi" });
    s = reduce(s, { type: "RETRY" });
    expect(s.phase).toBe("idle");
  });

  it("note generation transitions", () => {
    let s = reduce(initialChatState, { type: "GENERATING" });
    expect(s.phase).toBe("generating");
    s = reduce(s, { type: "NOTE_READY" });
    expect(s.phase).toBe("done");
  });
});
```

Run: `npm test` — Expected: FAIL.

- [ ] **Step 2: Implement `frontend/src/chat/chatReducer.ts`**

```ts
export interface ChatMessage { role: "assistant" | "patient"; content: string }

export interface ChatState {
  conversationId: string | null;
  messages: ChatMessage[];
  streaming: string;
  stage: string | null;
  phase: "form" | "starting" | "idle" | "streaming" | "generating" | "done" | "error";
  errorKind: "chat" | "note" | null;
  error: string | null;
  interviewComplete: boolean;
}

export type ChatAction =
  | { type: "START" }
  | { type: "CONVERSATION_ID"; id: string }
  | { type: "PATIENT_MESSAGE"; content: string }
  | { type: "DELTA"; text: string }
  | { type: "STREAM_DONE"; stage: string | null; interviewComplete: boolean }
  | { type: "GENERATING" }
  | { type: "NOTE_READY" }
  | { type: "ERROR"; kind: "chat" | "note"; message: string }
  | { type: "RETRY" };

export const initialChatState: ChatState = {
  conversationId: null, messages: [], streaming: "", stage: null,
  phase: "form", errorKind: null, error: null, interviewComplete: false,
};

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "START":
      return { ...state, phase: "starting" };
    case "CONVERSATION_ID":
      return { ...state, conversationId: action.id };
    case "PATIENT_MESSAGE":
      return { ...state, phase: "streaming",
        messages: [...state.messages, { role: "patient", content: action.content }] };
    case "DELTA":
      return { ...state, phase: "streaming", streaming: state.streaming + action.text };
    case "STREAM_DONE":
      return { ...state, phase: "idle", streaming: "",
        stage: action.stage ?? state.stage,
        interviewComplete: action.interviewComplete || state.interviewComplete,
        // trimEnd: the stream may end with the newline that preceded a stripped marker
        messages: state.streaming.trim()
          ? [...state.messages, { role: "assistant", content: state.streaming.trimEnd() }]
          : state.messages };
    case "GENERATING":
      return { ...state, phase: "generating" };
    case "NOTE_READY":
      return { ...state, phase: "done" };
    case "ERROR":
      return { ...state, phase: "error", errorKind: action.kind, error: action.message, streaming: "" };
    case "RETRY":
      return { ...state, phase: "idle", errorKind: null, error: null };
  }
}
```

- [ ] **Step 3: Run reducer tests** — `npm test` — Expected: PASS.

- [ ] **Step 4: Implement `frontend/src/chat/useChat.ts`** (thin async shell; covered by manual verification, not unit tests)

```ts
import { useCallback, useReducer, useRef } from "react";
import { api } from "../api/client";
import { readSse } from "../api/sse";
import { chatReducer, initialChatState } from "./chatReducer";

export function useChat() {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const idRef = useRef<string | null>(null);
  const lastSentRef = useRef<string>("");

  const consume = useCallback(async (res: Response) => {
    for await (const event of readSse(res)) {
      if ("conversation_id" in event) {
        idRef.current = event.conversation_id;
        dispatch({ type: "CONVERSATION_ID", id: event.conversation_id });
      } else if ("delta" in event) dispatch({ type: "DELTA", text: event.delta });
      else if ("error" in event) throw new Error(event.error);
      else if ("done" in event)
        dispatch({ type: "STREAM_DONE", stage: event.stage, interviewComplete: event.interview_complete });
    }
  }, []);

  const start = useCallback(async (p: { firstName: string; age: number; sex: string }) => {
    dispatch({ type: "START" });
    try {
      await consume(await api.startConversation(p));
    } catch {
      dispatch({ type: "ERROR", kind: "chat", message: "Couldn't start the interview. Please try again." });
    }
  }, [consume]);

  const send = useCallback(async (content: string, opts?: { isRetry?: boolean }) => {
    if (!idRef.current) return;
    lastSentRef.current = content;
    if (!opts?.isRetry) dispatch({ type: "PATIENT_MESSAGE", content });
    try {
      await consume(await api.sendMessage(idRef.current, content));
    } catch (e) {
      dispatch({ type: "ERROR", kind: "chat", message: e instanceof Error ? e.message : "Something went wrong." });
    }
  }, [consume]);

  const retryLastSend = useCallback(() => {
    dispatch({ type: "RETRY" });
    void send(lastSentRef.current, { isRetry: true });
  }, [send]);

  const generate = useCallback(async () => {
    if (!idRef.current) return;
    dispatch({ type: "GENERATING" });
    try {
      await api.generateNote(idRef.current);
      dispatch({ type: "NOTE_READY" });
    } catch {
      dispatch({ type: "ERROR", kind: "note", message: "Note generation failed." });
    }
  }, []);

  return { state, start, send, retryLastSend, generate };
}
```

- [ ] **Step 5: Typecheck** — `npx tsc --noEmit` — Expected: clean.
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: chat state reducer and useChat hook"`

---

### Task 12: Chat page UI

**Files:**
- Create: `frontend/src/chat/StartForm.tsx`, `frontend/src/chat/StageIndicator.tsx`
- Modify: `frontend/src/chat/ChatPage.tsx` (replace placeholder)

**Interfaces:**
- Consumes: `useChat` (Task 11). `MicButton` is added in Task 13 — leave the marked slot for it.
- Produces: complete chat experience: start form → streaming interview → auto note generation → link to `/notes/:id`.

- [ ] **Step 1: `frontend/src/chat/StartForm.tsx`**

```tsx
import { useState } from "react";

export default function StartForm({ onStart }: { onStart: (p: { firstName: string; age: number; sex: string }) => void }) {
  const [firstName, setFirstName] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState("");
  const valid = firstName.trim() && Number(age) > 0 && Number(age) < 130 && sex;
  const field = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 focus:border-teal-500 focus:outline-none";
  return (
    <form
      className="mx-auto mt-10 w-full max-w-sm space-y-4 rounded-xl border border-slate-200 bg-white p-6"
      onSubmit={(e) => { e.preventDefault(); if (valid) onStart({ firstName: firstName.trim(), age: Number(age), sex }); }}
    >
      <div>
        <h1 className="text-xl font-bold">Pre-visit intake</h1>
        <p className="mt-1 text-sm text-slate-500">Claire will ask a few questions so your doctor is prepared. This is a demo — please don't enter real personal health information.</p>
      </div>
      <label className="block text-sm font-medium">First name
        <input className={field} value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={50} autoFocus />
      </label>
      <label className="block text-sm font-medium">Age
        <input className={field} value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={3} />
      </label>
      <label className="block text-sm font-medium">Sex
        <select className={field} value={sex} onChange={(e) => setSex(e.target.value)}>
          <option value="">Select…</option>
          <option value="female">Female</option>
          <option value="male">Male</option>
          <option value="other">Other / prefer not to say</option>
        </select>
      </label>
      <button disabled={!valid} className="w-full rounded-lg bg-teal-600 py-2.5 font-semibold text-white disabled:opacity-40">
        Start interview
      </button>
    </form>
  );
}
```

- [ ] **Step 2: `frontend/src/chat/StageIndicator.tsx`**

```tsx
const STAGES = [
  { key: "complaint", label: "Your concern" },
  { key: "history", label: "History" },
  { key: "lifestyle", label: "Lifestyle" },
  { key: "wrap_up", label: "Wrap-up" },
];

export default function StageIndicator({ stage }: { stage: string | null }) {
  const index = Math.max(0, STAGES.findIndex((s) => s.key === stage));
  return (
    <div className="flex items-center gap-1.5" aria-label={`Interview stage: ${STAGES[index].label}`}>
      {STAGES.map((s, i) => (
        <div key={s.key} className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${i <= index ? "bg-teal-500" : "bg-slate-300"}`} />
          <span className={`hidden text-xs sm:inline ${i === index ? "font-semibold text-teal-700" : "text-slate-400"}`}>{s.label}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Replace `frontend/src/chat/ChatPage.tsx`**

```tsx
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import StartForm from "./StartForm";
import StageIndicator from "./StageIndicator";
import { useChat } from "./useChat";

export default function ChatPage() {
  const { state, start, send, retryLastSend, generate } = useChat();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const busy = state.phase !== "idle" || state.interviewComplete;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [state.messages, state.streaming]);

  useEffect(() => {
    if (state.interviewComplete && state.phase === "idle") void generate();
  }, [state.interviewComplete, state.phase, generate]);

  if (state.phase === "form" || (state.phase === "starting" && state.messages.length === 0 && !state.streaming))
    return state.phase === "form"
      ? <StartForm onStart={(p) => void start(p)} />
      : <p className="mt-16 text-center text-slate-500">Connecting you with Claire…</p>;

  const submit = () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    void send(text);
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-57px)] max-w-2xl flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
        <span className="text-sm font-semibold text-slate-600">Talking with Claire</span>
        <StageIndicator stage={state.stage} />
      </div>
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {state.messages.map((m, i) => (
          <div key={i} className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[15px] ${
            m.role === "assistant" ? "bg-white border border-slate-200" : "ml-auto bg-teal-600 text-white"}`}>
            {m.content}
          </div>
        ))}
        {state.streaming && (
          <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-[15px]">
            {state.streaming}<span className="animate-pulse">▍</span>
          </div>
        )}
        {state.phase === "generating" && <p className="text-center text-sm text-slate-500">Drafting your pre-visit summary…</p>}
        {state.phase === "done" && (
          <div className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-center">
            <p className="font-medium text-teal-800">All done — thank you!</p>
            <Link to={`/notes/${state.conversationId}`} className="mt-2 inline-block rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white">View the note</Link>
          </div>
        )}
        {state.phase === "error" && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-sm">
            <p className="text-red-700">{state.error}</p>
            <button onClick={() => (state.errorKind === "note" ? void generate() : retryLastSend())}
              className="mt-2 rounded-lg bg-red-600 px-4 py-1.5 font-semibold text-white">Try again</button>
          </div>
        )}
      </div>
      {!state.interviewComplete && state.phase !== "done" && (
        <div className="border-t border-slate-200 bg-white p-3">
          <div className="flex items-end gap-2">
            {/* MicButton slot — added in Task 13 */}
            <textarea
              className="max-h-32 flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2 focus:border-teal-500 focus:outline-none"
              rows={1} maxLength={2000} placeholder="Type your answer…"
              value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
            />
            <button onClick={submit} disabled={busy || !input.trim()}
              className="rounded-xl bg-teal-600 px-4 py-2 font-semibold text-white disabled:opacity-40">Send</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Manual verification (needs real OpenAI key)** — from `backend/`: `OPENAI_API_KEY=sk-... python manage.py runserver` (SQLite is fine here); from `frontend/`: `npm run dev`. Complete a short interview at http://localhost:5173/chat. Expected: greeting streams in, stage dots advance, wrap-up triggers "Drafting your pre-visit summary…" then the note link. Check mobile viewport (375px): chat fills screen, input reachable.
- [ ] **Step 5: Run checks** — `npm test && npx tsc --noEmit` — Expected: clean.
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: streaming chat page with stage indicator"`

---

### Task 13: Speech input (MicButton)

**Files:**
- Create: `frontend/src/chat/MicButton.tsx`
- Modify: `frontend/src/chat/ChatPage.tsx` (fill the marked slot)

**Interfaces:**
- Consumes: `api.transcribe` (Task 10).
- Produces: `<MicButton disabled={boolean} onTranscript={(text: string) => void} />` — tap to record, tap to stop; transcript goes into the input box for review (never auto-sends); hides itself when mic unsupported; caps recording at 60 s.

- [ ] **Step 1: Implement `frontend/src/chat/MicButton.tsx`**

```tsx
import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";

type MicState = "idle" | "recording" | "busy" | "error";
const MAX_RECORD_MS = 60_000;

export default function MicButton({ disabled, onTranscript }: { disabled: boolean; onTranscript: (text: string) => void }) {
  const [micState, setMicState] = useState<MicState>("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timeoutRef = useRef<number>(undefined);

  useEffect(() => () => { recorderRef.current?.stream.getTracks().forEach((t) => t.stop()); }, []);

  if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) return null;

  const stop = () => {
    window.clearTimeout(timeoutRef.current);
    recorderRef.current?.stop();
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setMicState("busy");
        try {
          onTranscript(await api.transcribe(new Blob(chunks, { type: "audio/webm" })));
          setMicState("idle");
        } catch {
          setMicState("error");
          window.setTimeout(() => setMicState("idle"), 3000);
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setMicState("recording");
      timeoutRef.current = window.setTimeout(stop, MAX_RECORD_MS);
    } catch {
      setMicState("error"); // permission denied
      window.setTimeout(() => setMicState("idle"), 3000);
    }
  };

  const labels: Record<MicState, string> = {
    idle: "Speak your answer", recording: "Stop recording", busy: "Transcribing…", error: "Mic unavailable — please type",
  };
  return (
    <button
      type="button" disabled={disabled || micState === "busy"} title={labels[micState]} aria-label={labels[micState]}
      onClick={micState === "recording" ? stop : micState === "idle" ? () => void startRecording() : undefined}
      className={`rounded-xl border px-3 py-2 text-lg leading-none ${
        micState === "recording" ? "animate-pulse border-red-300 bg-red-100"
        : micState === "error" ? "border-amber-300 bg-amber-50"
        : "border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40"}`}
    >
      {micState === "busy" ? "…" : micState === "recording" ? "■" : "🎤"}
    </button>
  );
}
```

- [ ] **Step 2: Wire into ChatPage** — replace the `{/* MicButton slot — added in Task 13 */}` comment with:

```tsx
            <MicButton disabled={busy} onTranscript={(text) => setInput((v) => (v ? v + " " : "") + text)} />
```

and add `import MicButton from "./MicButton";` at the top.

- [ ] **Step 3: Manual verification** — with backend + frontend dev servers running (real OpenAI key): record a sentence, confirm the transcript lands in the input box for editing, not auto-sent. Deny mic permission in a fresh tab → error state appears for 3 s, typing still works. Note: `getUserMedia` needs a secure context — `localhost` counts; the deployed site will need HTTPS (Task 16).
- [ ] **Step 4: Run checks** — `npm test && npx tsc --noEmit` — Expected: clean.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: tap-to-talk speech input with transcription review"`

---

### Task 14: Notes page (sidebar + structured note view + copy)

**Files:**
- Create: `frontend/src/notes/fixtures.ts`, `frontend/src/notes/noteText.ts`, `frontend/src/notes/noteText.test.ts`, `frontend/src/notes/NoteView.tsx`, `frontend/src/notes/NoteView.test.tsx`
- Modify: `frontend/src/notes/NotesPage.tsx` (replace placeholder)

**Interfaces:**
- Consumes: `api.fetchConversations`, `api.fetchConversation`, `NoteData` (Task 10); route params from Task 9.
- Produces: `/notes` list + `/notes/:id` detail; `noteToText(note: NoteData, patientLine: string): string` plain-text export; `<NoteView detail={ConversationDetail} />`.

- [ ] **Step 1: Shared fixtures — `frontend/src/notes/fixtures.ts`** (a plain module, NOT a test file — importing one test file from another registers its tests twice)

```ts
import type { ConversationDetail, NoteData } from "../api/types";

export const FAKE_NOTE: NoteData = {
  chief_complaint: "Chest tightness on exertion",
  summary_one_liner: "Chest tightness on exertion, 2 wks",
  hpi_narrative: "Ana reports two weeks of chest tightness when climbing stairs.",
  red_flags: ["Chest pain with exertion"],
  allergies: [{ substance: "Penicillin", reaction: "rash", severity: "mild" }],
  medications: [{ name: "Lisinopril", dose: "10 mg", frequency: "daily" }],
  medical_history: ["Hypertension"],
  family_history: ["Father: heart disease"],
  social_history: { smoking: "Never", alcohol: "Socially", drugs: "None", occupation: "Teacher", exercise: "Walks", sleep: "6h", stress: "Moderate" },
  review_of_systems: { positives: ["fatigue"], negatives: ["no fever"] },
  soap: { subjective: "Two weeks of exertional chest tightness.",
    objective: "To be completed at visit — no examination performed during pre-visit intake.",
    assessment: ["Consider exploring cardiac risk factors"], plan: ["Ask about palpitations"] },
  patient_quotes: ["like a band around my chest"],
};

export const FAKE_DETAIL: ConversationDetail = {
  id: "abc", patient_first_name: "Ana", patient_age: 34, patient_sex: "female",
  status: "complete", chief_complaint_summary: "Chest tightness on exertion, 2 wks",
  has_red_flags: true, created_at: "2026-07-18T12:00:00Z",
  messages: [], note: { data: FAKE_NOTE, red_flags: FAKE_NOTE.red_flags },
};
```

- [ ] **Step 2: Failing tests**

`frontend/src/notes/noteText.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { noteToText } from "./noteText";
import { FAKE_NOTE } from "./fixtures";

describe("noteToText", () => {
  it("renders all major sections as labeled plain text", () => {
    const text = noteToText(FAKE_NOTE, "Ana, 34, female");
    for (const heading of ["PRE-VISIT NOTE", "RED FLAGS", "ALLERGIES", "MEDICATIONS",
      "MEDICAL HISTORY", "FAMILY HISTORY", "SOCIAL HISTORY", "REVIEW OF SYSTEMS",
      "SUBJECTIVE", "OBJECTIVE", "ASSESSMENT", "PLAN"]) {
      expect(text).toContain(heading);
    }
    expect(text).toContain("Penicillin");
    expect(text).toContain("Ana, 34, female");
  });
});
```

`frontend/src/notes/NoteView.test.tsx` (note: list items render as combined strings like "Penicillin — rash (mild)", so match with regex, not exact strings):

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FAKE_DETAIL } from "./fixtures";
import NoteView from "./NoteView";

describe("NoteView", () => {
  it("shows red flag banner, cards, and SOAP sections", () => {
    render(<NoteView detail={FAKE_DETAIL} />);
    expect(screen.getByText(/red flags/i)).toBeInTheDocument();
    expect(screen.getByText(/Chest pain with exertion/)).toBeInTheDocument();
    expect(screen.getByText(/Penicillin — rash \(mild\)/)).toBeInTheDocument();
    expect(screen.getByText(/Lisinopril 10 mg, daily/)).toBeInTheDocument();
    expect(screen.getByText(/like a band around my chest/)).toBeInTheDocument();
    expect(screen.getByText(/To be completed at visit/)).toBeInTheDocument();
  });

  it("shows pending state when note is missing", () => {
    render(<NoteView detail={{ ...FAKE_DETAIL, note: null, status: "active" }} />);
    expect(screen.getByText(/isn't ready yet/)).toBeInTheDocument();
  });
});
```

Run: `npm test` — Expected: FAIL.

- [ ] **Step 3: Implement `frontend/src/notes/noteText.ts`**

```ts
import type { NoteData } from "../api/types";

const section = (title: string, body: string) => (body.trim() ? `${title}\n${body.trim()}\n` : "");
const bullets = (items: string[]) => items.map((i) => `- ${i}`).join("\n");

export function noteToText(note: NoteData, patientLine: string): string {
  const social = Object.entries(note.social_history).map(([k, v]) => `- ${k}: ${v}`).join("\n");
  return [
    `PRE-VISIT NOTE — ${patientLine}`,
    `Chief complaint: ${note.chief_complaint}\n`,
    section("RED FLAGS", bullets(note.red_flags) || "- None reported"),
    section("HISTORY OF PRESENT ILLNESS", note.hpi_narrative),
    section("PATIENT QUOTES", bullets(note.patient_quotes.map((q) => `"${q}"`))),
    section("ALLERGIES", bullets(note.allergies.map((a) => `${a.substance} — ${a.reaction} (${a.severity})`)) || "- None reported"),
    section("MEDICATIONS", bullets(note.medications.map((m) => `${m.name} ${m.dose}, ${m.frequency}`)) || "- None reported"),
    section("MEDICAL HISTORY", bullets(note.medical_history) || "- None reported"),
    section("FAMILY HISTORY", bullets(note.family_history) || "- None reported"),
    section("SOCIAL HISTORY", social),
    section("REVIEW OF SYSTEMS", `Positives:\n${bullets(note.review_of_systems.positives) || "- none"}\nNegatives:\n${bullets(note.review_of_systems.negatives) || "- none"}`),
    section("SUBJECTIVE", note.soap.subjective),
    section("OBJECTIVE", note.soap.objective),
    section("ASSESSMENT", bullets(note.soap.assessment)),
    section("PLAN", bullets(note.soap.plan)),
  ].join("\n");
}
```

- [ ] **Step 4: Implement `frontend/src/notes/NoteView.tsx`**

```tsx
import { useState } from "react";
import type { ConversationDetail } from "../api/types";
import { noteToText } from "./noteText";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</h3>
      <div className="mt-2 text-sm text-slate-800">{children}</div>
    </div>
  );
}

const List = ({ items, empty = "None reported" }: { items: string[]; empty?: string }) =>
  items.length
    ? <ul className="list-disc space-y-1 pl-4">{items.map((i) => <li key={i}>{i}</li>)}</ul>
    : <p className="text-slate-400">{empty}</p>;

export default function NoteView({ detail }: { detail: ConversationDetail }) {
  const [copied, setCopied] = useState(false);
  const note = detail.note?.data;
  const patientLine = `${detail.patient_first_name}, ${detail.patient_age}, ${detail.patient_sex}`;

  if (!note)
    return <p className="p-8 text-slate-500">This note isn't ready yet — the interview may still be in progress.</p>;

  const copy = async () => {
    await navigator.clipboard.writeText(noteToText(note, patientLine));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      {note.red_flags.length > 0 && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4">
          <h2 className="font-bold text-red-700">⚠ Red flags</h2>
          <ul className="mt-1 list-disc pl-5 text-sm text-red-800">
            {note.red_flags.map((f) => <li key={f}>{f}</li>)}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{note.chief_complaint}</h1>
          <p className="text-sm text-slate-500">{patientLine} · {new Date(detail.created_at).toLocaleDateString()}</p>
        </div>
        <button onClick={() => void copy()} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-100">
          {copied ? "Copied ✓" : "Copy note"}
        </button>
      </div>
      <Card title="History of present illness">
        <p>{note.hpi_narrative}</p>
        {note.patient_quotes.length > 0 && (
          <p className="mt-2 italic text-slate-500">{note.patient_quotes.map((q) => `“${q}”`).join(" · ")}</p>
        )}
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="Allergies">
          <List items={note.allergies.map((a) => `${a.substance} — ${a.reaction} (${a.severity})`)} />
        </Card>
        <Card title="Current medications">
          <List items={note.medications.map((m) => `${m.name} ${m.dose}, ${m.frequency}`)} />
        </Card>
        <Card title="Medical history"><List items={note.medical_history} /></Card>
        <Card title="Family history"><List items={note.family_history} /></Card>
      </div>
      <Card title="Social history">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
          {Object.entries(note.social_history).map(([k, v]) => (
            <div key={k}><dt className="text-xs capitalize text-slate-400">{k}</dt><dd>{v}</dd></div>
          ))}
        </dl>
      </Card>
      <Card title="Review of systems">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><p className="text-xs font-semibold text-slate-400">Positives</p><List items={note.review_of_systems.positives} empty="None" /></div>
          <div><p className="text-xs font-semibold text-slate-400">Negatives</p><List items={note.review_of_systems.negatives} empty="None" /></div>
        </div>
      </Card>
      <Card title="Draft SOAP note">
        <div className="space-y-3">
          <div><p className="font-semibold">Subjective</p><p>{note.soap.subjective}</p></div>
          <div><p className="font-semibold">Objective</p><p className="text-slate-500">{note.soap.objective}</p></div>
          <div><p className="font-semibold">Assessment <span className="font-normal text-slate-400">(areas to explore — not diagnoses)</span></p><List items={note.soap.assessment} /></div>
          <div><p className="font-semibold">Plan</p><List items={note.soap.plan} /></div>
        </div>
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: Replace `frontend/src/notes/NotesPage.tsx`**

```tsx
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { ConversationDetail, ConversationSummary } from "../api/types";
import NoteView from "./NoteView";

export default function NotesPage() {
  const { id } = useParams();
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.fetchConversations().then(setConversations).catch(() => setError(true));
  }, []);

  useEffect(() => {
    setDetail(null);
    if (id) api.fetchConversation(id).then(setDetail).catch(() => setError(true));
  }, [id]);

  if (error) return <p className="p-8 text-red-600">Couldn't load notes — is the backend running?</p>;

  const sidebar = (
    <nav className="divide-y divide-slate-100">
      {conversations?.length === 0 && (
        <p className="p-4 text-sm text-slate-500">No conversations yet. <Link className="text-teal-700 underline" to="/chat">Start one</Link>.</p>
      )}
      {conversations?.map((c) => (
        <Link key={c.id} to={`/notes/${c.id}`}
          className={`block px-4 py-3 hover:bg-slate-50 ${c.id === id ? "bg-teal-50" : ""}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{c.patient_first_name}</span>
            {c.has_red_flags && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">⚠ red flag</span>}
          </div>
          <p className="truncate text-sm text-slate-600">{c.chief_complaint_summary || "Interview in progress…"}</p>
          <p className="text-xs text-slate-400">{new Date(c.created_at).toLocaleString()}</p>
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="mx-auto flex h-[calc(100vh-57px)] max-w-6xl">
      <aside className={`w-full overflow-y-auto border-r border-slate-200 bg-white md:block md:w-80 ${id ? "hidden" : ""}`}>
        <h2 className="border-b border-slate-200 px-4 py-3 font-bold">Patient conversations</h2>
        {conversations === null ? <p className="p-4 text-sm text-slate-400">Loading…</p> : sidebar}
      </aside>
      <section className={`flex-1 overflow-y-auto ${id ? "" : "hidden md:block"}`}>
        {id ? (
          detail ? (
            <>
              <Link to="/notes" className="m-4 inline-block text-sm text-teal-700 md:hidden">← All conversations</Link>
              <NoteView detail={detail} />
            </>
          ) : <p className="p-8 text-slate-400">Loading…</p>
        ) : <p className="p-8 text-slate-400">Select a conversation to view its note.</p>}
      </section>
    </div>
  );
}
```

- [ ] **Step 6: Run tests** — `npm test && npx tsc --noEmit` — Expected: all pass.
- [ ] **Step 7: Manual verification** — with both dev servers up and at least one completed interview: `/notes` lists it (red-flag badge if applicable); clicking shows the card layout; Copy note puts readable plain text on the clipboard; at 375px the sidebar/detail swap works with the back link.
- [ ] **Step 8: Commit** — `git add -A && git commit -m "feat: notes page with sidebar and structured note view"`

---

### Task 15: Production Docker (backend image, nginx image, full compose)

**Files:**
- Create: `backend/Dockerfile`, `backend/.dockerignore`, `nginx/Dockerfile`, `nginx/nginx.conf`
- Modify: `docker-compose.yml`, `README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: `docker compose up -d --build` serves the whole app on port 80: nginx → SPA + `/api/` proxy (SSE-safe) → gunicorn → MySQL.

- [ ] **Step 1: `backend/Dockerfile`**

```dockerfile
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1
RUN apt-get update && apt-get install -y --no-install-recommends \
    default-libmysqlclient-dev build-essential pkg-config \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["sh", "-c", "python manage.py migrate && gunicorn clairemed.wsgi:application -b 0.0.0.0:8000 --workers 2 --worker-class gthread --threads 8 --timeout 120"]
```

`backend/.dockerignore`:

```
.venv
db.sqlite3
__pycache__
```

- [ ] **Step 2: `nginx/nginx.conf`**

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;
    client_max_body_size 5m;

    location /api/ {
        proxy_pass http://web:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_buffering off;          # required for SSE streaming
        proxy_read_timeout 300s;
    }

    location / {
        try_files $uri /index.html;   # SPA routing
    }
}
```

- [ ] **Step 3: `nginx/Dockerfile`** (multi-stage: build SPA, serve via nginx; context is repo root)

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

FROM nginx:alpine
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
```

- [ ] **Step 4: Extend `docker-compose.yml`** — add under `services:` (keep `db` as is):

```yaml
  web:
    build: ./backend
    env_file: .env
    environment:
      MYSQL_HOST: db
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  nginx:
    build:
      context: .
      dockerfile: nginx/Dockerfile
    ports:
      - "80:80"
    depends_on:
      - web
    restart: unless-stopped
```

- [ ] **Step 5: Local prod smoke test** — `cp .env.example .env`, fill in a real `OPENAI_API_KEY` and non-default passwords, set `DJANGO_DEBUG=0`, then `docker compose up -d --build`. Expected: `curl -s http://localhost/api/health/` → `{"status": "ok"}`; http://localhost renders the SPA; a full chat → note round-trip works. Check streaming actually streams (text appears incrementally, not all at once — that's the `proxy_buffering off` doing its job).
- [ ] **Step 6: Update `README.md`** — replace contents with: project title + one-paragraph description, link to spec/plan docs, "Run locally (dev)" (compose db + runserver + vite), "Run with Docker" (`cp .env.example .env`, edit, `docker compose up -d --build`), and an env var table matching `.env.example`.
- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat: production Docker Compose stack"`

---

### Task 16: GCP deployment + HTTPS + end-to-end verification

**Files:**
- Modify: `README.md` (deployment section), `nginx/nginx.conf` (TLS server block), `docker-compose.yml` (cert mounts, port 443)

**Interfaces:**
- Consumes: the compose stack (Task 15).
- Produces: the demo live on a GCP VM over HTTPS. HTTPS is REQUIRED (not optional): browsers block `getUserMedia` (the mic) on insecure origins other than localhost.

- [ ] **Step 1: Create GCP project + VM** (project IDs are globally unique — suffix as needed)

```bash
gcloud auth login
gcloud projects create clairemed-demo-<suffix> --name="clairemed-demo"
gcloud billing accounts list   # note ACCOUNT_ID, then:
gcloud billing projects link clairemed-demo-<suffix> --billing-account=<ACCOUNT_ID>
gcloud config set project clairemed-demo-<suffix>
gcloud services enable compute.googleapis.com
gcloud compute instances create clairemed-vm \
  --zone=us-central1-a --machine-type=e2-small \
  --image-family=debian-12 --image-project=debian-cloud \
  --tags=http-server,https-server
gcloud compute firewall-rules create allow-http --allow=tcp:80 --target-tags=http-server
gcloud compute firewall-rules create allow-https --allow=tcp:443 --target-tags=https-server
gcloud compute instances describe clairemed-vm --zone=us-central1-a \
  --format='get(networkInterfaces[0].accessConfigs[0].natIP)'   # note EXTERNAL_IP
```

- [ ] **Step 2: Install Docker and the app on the VM**

```bash
gcloud compute ssh clairemed-vm --zone=us-central1-a
# on the VM:
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && exit
gcloud compute ssh clairemed-vm --zone=us-central1-a   # re-login for group
git clone https://github.com/ekorber/clairemed-demo.git && cd clairemed-demo
cp .env.example .env && nano .env
# set: real OPENAI_API_KEY, strong MYSQL_PASSWORD/MYSQL_ROOT_PASSWORD, random DJANGO_SECRET_KEY,
#      DJANGO_DEBUG=0, DJANGO_ALLOWED_HOSTS=localhost,<EXTERNAL_IP>,<EXTERNAL_IP>.sslip.io
docker compose up -d --build
curl -s http://localhost/api/health/    # expect {"status": "ok"}
```

- [ ] **Step 3: HTTPS via certbot + sslip.io** (sslip.io maps `<EXTERNAL_IP>.sslip.io` → the IP, so no domain purchase needed; if the user has a real domain, use it instead everywhere below). On the VM:

```bash
sudo apt-get update && sudo apt-get install -y certbot
docker compose stop nginx
sudo certbot certonly --standalone -d <EXTERNAL_IP>.sslip.io --agree-tos -m erickorber1994@gmail.com --no-eff-email
```

Add a TLS server block to `nginx/nginx.conf` (same locations as the port-80 block; keep the port-80 block but make it `return 301 https://$host$request_uri;` except for `location /.well-known/`):

```nginx
server {
    listen 443 ssl;
    ssl_certificate     /etc/letsencrypt/live/<EXTERNAL_IP>.sslip.io/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/<EXTERNAL_IP>.sslip.io/privkey.pem;
    root /usr/share/nginx/html;
    index index.html;
    client_max_body_size 5m;

    location /api/ {
        proxy_pass http://web:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
    location / { try_files $uri /index.html; }
}
```

And in `docker-compose.yml` under `nginx:` add `- "443:443"` to `ports` and:

```yaml
    volumes:
      - /etc/letsencrypt:/etc/letsencrypt:ro
```

Then `docker compose up -d --build nginx`. Commit these config changes (with the sslip.io hostname parameterized via a comment noting it must match the VM IP) from the local machine, not the VM — the VM just pulls.

- [ ] **Step 4: End-to-end verification checklist (on the live HTTPS URL)**

- [ ] Home page renders; GitHub link works; layout fine at 375px and desktop.
- [ ] Full interview by typing (desktop): streaming visible, stage dots advance, note generates, link opens the note.
- [ ] Full interview on a phone (or emulated mobile): chat usable, mic button records, transcript appears in input for review, editable, sends.
- [ ] One conversation that trips a red flag (e.g., "crushing chest pain and my left arm hurts, I'm sweating") → red-flag banner on the note, badge in the sidebar, Claire's urgent-care advice appeared in chat.
- [ ] Notes page: sidebar lists all conversations; Copy note yields readable plain text; mobile back-navigation works.
- [ ] `docker compose restart` on the VM → data survives (MySQL volume).

- [ ] **Step 5: Update README deployment section** with the exact commands from Steps 1-3 and the live URL.
- [ ] **Step 6: Commit and push** — `git add -A && git commit -m "feat: GCP deployment with HTTPS" && git push`

---

## Self-Review Notes

- Spec coverage: all spec sections map to tasks — pages (9, 12, 13, 14), interview content (5), note structure (7, 14), SSE (6, 10), speech (8, 13), MySQL/compose (1, 15), GCP+HTTPS (16), guardrails (6, 8, 12, 13), error handling (6, 7, 8, 11, 12, 13). The spec's "25-exchange cap" is enforced prompt-side via the patient-message count injected into the system context (Task 5) — acceptable for a demo; no silent server rejection that would strand the UI.
- HTTPS was promoted from "optional" to required because the mic (getUserMedia) demands a secure context — spec's speech-input feature depends on it.
- Deviation from spec: conversation creation is `POST /api/conversations/start/` (not `POST /api/conversations/`) to keep DRF list view and the streaming view on separate routes. Event shapes unchanged.
```
