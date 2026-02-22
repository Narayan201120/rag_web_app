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
]
