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
