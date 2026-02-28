from django.urls import path
from . import views
from rest_framework_simplejwt.views import TokenRefreshView

app_name = "api"

urlpatterns = [
    path("health/", views.HealthView.as_view(), name="health"),
    path("ask/", views.AskView.as_view(), name="ask"),
    path('sign-up/', views.SignUpView.as_view(), name='sign-up'),
    path('sign-in/', views.SignInView.as_view(), name='sign-in'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token-refresh'),
    path('logout/', views.LogOutView.as_view(), name='logout'),
    path('upload/', views.DocumentUploadView.as_view(), name='upload'),
    path('documents/', views.ListDocumentsView.as_view(), name='documents'),
    path('documents/<str:filename>/', views.DeleteDocumentView.as_view(), name='delete-document'),
    path('account/delete/', views.DeleteAccountView.as_view(), name='delete-account'),
    path('account/', views.AccountView.as_view(), name='account'),
    path('forgot-password/', views.ForgotPasswordView.as_view(), name='forgot-password'),
    path('reset-password/', views.ResetPasswordView.as_view(), name='reset-password'),
    path('search/', views.SearchView.as_view(), name='search'),
    path('upload-url/', views.UploadURLView.as_view(), name='upload-url'),
    path('chat/', views.ChatView.as_view(), name='chat'),
    path('chat/history/', views.ChatHistoryView.as_view(), name='chat-history'),
    path('ingest/', views.IngestView.as_view(), name='ingest'),
    path('status/', views.StatusView.as_view(), name='status'),
    path('chat/<int:chat_id>/feedback/', views.ChatFeedbackView.as_view(), name='chat-feedback'),
    path('chat/<int:chat_id>/citations/', views.ChatCitationsView.as_view(), name='chat-citations'),
    path('collections/', views.CollectionsView.as_view(), name='collections'),
    path('documents/<str:filename>/move/', views.MoveDocumentView.as_view(), name='move-document'),
    path('search/suggest/', views.SearchSuggestView.as_view(), name='search-suggest'),
    path('search/rerank/', views.SearchRerankView.as_view(), name='search-rerank'),
    path('admin/usage/', views.AdminUsageView.as_view(), name='admin-usage'),
    path('admin/vectors/', views.AdminVectorsView.as_view(), name='admin-vectors'),
    path('chat/<int:chat_id>/export/', views.ChatExportView.as_view(), name='chat-export'),
    path('settings/api-key/', views.APIKeyView.as_view()),
    path('settings/api-key/test/', views.APIKeyConnectionTestView.as_view(), name='settings-api-key-test'),
    path('chat/conversations/<int:conversation_id>/', views.ConversationDetailView.as_view(), name='conversation-detail'),
    path('tasks/<uuid:task_id>/', views.TaskStatusView.as_view(), name='task-status'),
    path('tasks/<uuid:task_id>/cancel/', views.TaskCancelView.as_view(), name='task-cancel'),
]
