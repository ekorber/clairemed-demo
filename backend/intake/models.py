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
    # Set the moment Alice escalates during the interview, independently of has_red_flags,
    # which is only derived later from a generated note. An emergency conversation is often
    # abandoned mid-way precisely because the patient left to get help, so it never reaches
    # note generation and would otherwise surface as an ordinary unfinished interview.
    emergency_flagged = models.BooleanField(default=False)
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
