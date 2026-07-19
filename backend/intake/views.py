from django.http import JsonResponse
from rest_framework.generics import ListAPIView, RetrieveAPIView

from .models import Conversation
from .serializers import ConversationDetailSerializer, ConversationSummarySerializer


def health(request):
    return JsonResponse({"status": "ok"})


class ConversationListView(ListAPIView):
    queryset = Conversation.objects.all()
    serializer_class = ConversationSummarySerializer


class ConversationDetailView(RetrieveAPIView):
    queryset = Conversation.objects.prefetch_related("messages")
    serializer_class = ConversationDetailSerializer
