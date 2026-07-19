from django.urls import path

from . import views

urlpatterns = [
    path("health/", views.health),
    path("conversations/", views.ConversationListView.as_view()),
    path("conversations/<uuid:pk>/", views.ConversationDetailView.as_view()),
    path("conversations/start/", views.start_conversation),
    path("conversations/<uuid:pk>/messages/", views.send_message),
    path("conversations/<uuid:pk>/generate-note/", views.generate_note_view),
]
