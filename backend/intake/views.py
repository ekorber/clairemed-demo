import json

from django.http import HttpResponseBadRequest, JsonResponse, StreamingHttpResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from rest_framework.generics import ListAPIView, RetrieveAPIView

from .llm.interviewer import stream_reply
from .llm.markers import MarkerFilter
from .models import Conversation, Message
from .serializers import ConversationDetailSerializer, ConversationSummarySerializer

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
    """Stream Claire's next reply for `conversation`, persisting it when done."""
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
            yield _sse({"error": "Claire had trouble replying. Please try again."})

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
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return HttpResponseBadRequest("request body must be valid JSON")
    if not isinstance(body, dict):
        return HttpResponseBadRequest("request body must be a JSON object")
    content = str(body.get("content", "")).strip()
    if not content or len(content) > MAX_MESSAGE_CHARS:
        return HttpResponseBadRequest(f"content must be 1-{MAX_MESSAGE_CHARS} characters")
    Message.objects.create(conversation=conversation, role=Message.Role.PATIENT, content=content)
    return _reply_stream(conversation)
