import json
import logging

from django.conf import settings
from django.http import HttpResponseBadRequest, JsonResponse, StreamingHttpResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from rest_framework.generics import ListAPIView, RetrieveAPIView

from .llm.interviewer import get_client, stream_reply
from .llm.markers import MarkerFilter
from .models import Conversation, Message
from .serializers import ConversationDetailSerializer, ConversationSummarySerializer

logger = logging.getLogger(__name__)

MAX_MESSAGE_CHARS = 2000


def health(request):
    return JsonResponse({"status": "ok"})


class ConversationListView(ListAPIView):
    queryset = Conversation.objects.all()
    serializer_class = ConversationSummarySerializer


class ConversationDetailView(RetrieveAPIView):
    queryset = Conversation.objects.prefetch_related("messages")
    serializer_class = ConversationDetailSerializer


def _sse(payload):
    return f"data: {json.dumps(payload)}\n\n"


def _reply_stream(conversation, first_event=None):
    """Stream Alice's next reply for `conversation`, persisting it when done."""
    # Resolve stream_reply now, synchronously, while this call is still on the
    # request dispatch stack. StreamingHttpResponse content is lazy: the generator
    # below only runs once something iterates `streaming_content`, which for a
    # WSGI server happens as bytes are sent — well after this function returns.
    # Looking up the bare module-global `stream_reply` name from inside the
    # generator would defer resolution to that later point, which breaks
    # test mocking (patches applied only around the request call have already
    # been undone by the time the generator body executes). Binding it to a
    # local here captures the currently-active object immediately.
    reply_fn = stream_reply

    def gen():
        if first_event is not None:
            yield _sse(first_event)
        try:
            history = list(conversation.messages.all())
            marker_filter = MarkerFilter()
            parts = []
            for delta in reply_fn(conversation, history):
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
            logger.exception("chat stream failed for conversation %s", conversation.id)
            yield _sse({"error": "Alice had trouble replying. Please try again."})

    response = StreamingHttpResponse(gen(), content_type="text/event-stream")
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response


@csrf_exempt
@require_POST
def start_conversation(request):
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return HttpResponseBadRequest("request body must be valid JSON")
    if not isinstance(body, dict):
        return HttpResponseBadRequest("request body must be a JSON object")
    try:
        first_name = str(body["first_name"])[:50]
        age = int(body["age"])
        sex = str(body["sex"])[:20]
    except (KeyError, ValueError):
        return HttpResponseBadRequest("first_name, age and sex are required")
    if not (0 < age < 130):
        return HttpResponseBadRequest("age must be between 1 and 129")
    conversation = Conversation.objects.create(
        patient_first_name=first_name, patient_age=age, patient_sex=sex,
    )
    return _reply_stream(conversation, first_event={"conversation_id": str(conversation.id)})


@csrf_exempt
@require_POST
def send_message(request, pk):
    conversation = get_object_or_404(Conversation, pk=pk, status=Conversation.Status.ACTIVE)
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return HttpResponseBadRequest("request body must be valid JSON")
    if not isinstance(body, dict):
        return HttpResponseBadRequest("request body must be a JSON object")
    content = str(body.get("content", "")).strip()
    if not content or len(content) > MAX_MESSAGE_CHARS:
        return HttpResponseBadRequest(f"content must be 1-{MAX_MESSAGE_CHARS} characters")
    last = conversation.messages.last()
    if not (last and last.role == Message.Role.PATIENT and last.content == content):
        Message.objects.create(conversation=conversation, role=Message.Role.PATIENT, content=content)
    return _reply_stream(conversation)


from .llm.note_generator import generate_note
from .models import Note


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
        logger.exception("note generation failed for conversation %s", conversation.id)
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
        logger.exception("transcription failed")
        return JsonResponse({"error": "Transcription failed. Please type instead."}, status=502)
    return JsonResponse({"text": result.text})
