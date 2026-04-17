"""
Social OAuth Authentication — Google, Microsoft, GitHub.

Each provider flow:
  1. Frontend obtains an ID token (Google) or authorization code (MS/GitHub).
  2. Frontend POSTs to /api/auth/social/ with { provider, token/code }.
  3. This view validates with the provider, finds/creates a Django user, returns JWT.
"""

import logging
import os
import requests as http_requests

from django.contrib.auth.models import User
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken

logger = logging.getLogger(__name__)


def _get_or_create_social_user(email, full_name, provider, provider_id):
    """
    Find an existing user by email (auto-link) or create a new one.
    Returns the Django User instance.
    """
    email = email.lower().strip()
    if not email:
        return None

    # Try to find existing user by email
    user = User.objects.filter(email=email).first()
    if user:
        return user

    # Create new user — use email prefix as username, ensure uniqueness
    base_username = email.split("@")[0]
    username = base_username
    counter = 1
    while User.objects.filter(username=username).exists():
        username = f"{base_username}{counter}"
        counter += 1

    user = User.objects.create_user(
        username=username,
        email=email,
        first_name=full_name or "",
    )
    # set_unusable_password so they can't sign in with a blank password
    user.set_unusable_password()
    user.save()

    # Ensure UserProfile is created (signal or manual)
    from api.models import UserProfile
    UserProfile.objects.get_or_create(user=user)

    logger.info("Created social auth user: %s via %s", username, provider)
    return user


# ── Google ────────────────────────────────────────────────────────────────────

def _verify_google_token(id_token_str):
    """
    Verify a Google ID token using google.oauth2.id_token.
    Returns { email, name } or raises ValueError.
    """
    from google.oauth2 import id_token
    from google.auth.transport import requests as google_requests

    client_id = os.getenv("GOOGLE_CLIENT_ID", "")
    if not client_id:
        raise ValueError("Google OAuth is not configured (GOOGLE_CLIENT_ID missing).")

    try:
        id_info = id_token.verify_oauth2_token(
            id_token_str,
            google_requests.Request(),
            client_id,
        )
    except Exception as exc:
        raise ValueError(f"Invalid Google token: {exc}")

    email = id_info.get("email")
    if not email or not id_info.get("email_verified"):
        raise ValueError("Google account email is not verified.")

    return {
        "email": email,
        "name": id_info.get("name", ""),
        "provider_id": id_info.get("sub", ""),
    }


# ── Microsoft ─────────────────────────────────────────────────────────────────

def _exchange_microsoft_code(code, redirect_uri):
    """
    Exchange a Microsoft authorization code for user info.
    Returns { email, name } or raises ValueError.
    """
    client_id = os.getenv("MICROSOFT_CLIENT_ID", "")
    client_secret = os.getenv("MICROSOFT_CLIENT_SECRET", "")
    if not client_id or not client_secret:
        raise ValueError("Microsoft OAuth is not configured.")

    # Exchange code for access token
    token_resp = http_requests.post(
        "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        data={
            "client_id": client_id,
            "client_secret": client_secret,
            "code": code,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
            "scope": "openid email profile",
        },
        timeout=15,
    )
    if token_resp.status_code != 200:
        raise ValueError(f"Microsoft token exchange failed: {token_resp.text}")

    access_token = token_resp.json().get("access_token")
    if not access_token:
        raise ValueError("No access token in Microsoft response.")

    # Fetch user profile
    profile_resp = http_requests.get(
        "https://graph.microsoft.com/v1.0/me",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=10,
    )
    if profile_resp.status_code != 200:
        raise ValueError("Failed to fetch Microsoft user profile.")

    profile = profile_resp.json()
    email = profile.get("mail") or profile.get("userPrincipalName", "")
    if not email:
        raise ValueError("Could not retrieve email from Microsoft account.")

    return {
        "email": email,
        "name": profile.get("displayName", ""),
        "provider_id": profile.get("id", ""),
    }


# ── GitHub ────────────────────────────────────────────────────────────────────

def _exchange_github_code(code, redirect_uri):
    """
    Exchange a GitHub authorization code for user info.
    Returns { email, name } or raises ValueError.
    """
    client_id = os.getenv("GITHUB_CLIENT_ID", "")
    client_secret = os.getenv("GITHUB_CLIENT_SECRET", "")
    if not client_id or not client_secret:
        raise ValueError("GitHub OAuth is not configured.")

    # Exchange code for access token
    token_resp = http_requests.post(
        "https://github.com/login/oauth/access_token",
        json={
            "client_id": client_id,
            "client_secret": client_secret,
            "code": code,
            "redirect_uri": redirect_uri,
        },
        headers={"Accept": "application/json"},
        timeout=15,
    )
    if token_resp.status_code != 200:
        raise ValueError(f"GitHub token exchange failed: {token_resp.text}")

    access_token = token_resp.json().get("access_token")
    if not access_token:
        raise ValueError("No access token in GitHub response.")

    gh_headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json",
    }

    # Fetch user profile
    user_resp = http_requests.get("https://api.github.com/user", headers=gh_headers, timeout=10)
    if user_resp.status_code != 200:
        raise ValueError("Failed to fetch GitHub user profile.")
    user_data = user_resp.json()

    # Fetch primary email (might be private)
    email = user_data.get("email")
    if not email:
        emails_resp = http_requests.get("https://api.github.com/user/emails", headers=gh_headers, timeout=10)
        if emails_resp.status_code == 200:
            for e in emails_resp.json():
                if e.get("primary") and e.get("verified"):
                    email = e["email"]
                    break

    if not email:
        raise ValueError("Could not retrieve a verified email from GitHub.")

    return {
        "email": email,
        "name": user_data.get("name") or user_data.get("login", ""),
        "provider_id": str(user_data.get("id", "")),
    }


# ── View ──────────────────────────────────────────────────────────────────────

class SocialAuthView(APIView):
    """
    POST /api/auth/social/
    Body: { "provider": "google"|"microsoft"|"github", "token": "...", "code": "...", "redirect_uri": "..." }
    Returns: { "tokens": { "access": "...", "refresh": "..." } }
    """

    def post(self, request):
        provider = (request.data.get("provider") or "").lower().strip()
        token = request.data.get("token", "")
        code = request.data.get("code", "")
        redirect_uri = request.data.get("redirect_uri", "")

        try:
            if provider == "google":
                if not token:
                    return Response({"error": "Google ID token is required."}, status=status.HTTP_400_BAD_REQUEST)
                user_info = _verify_google_token(token)

            elif provider == "microsoft":
                if not code:
                    return Response({"error": "Microsoft authorization code is required."}, status=status.HTTP_400_BAD_REQUEST)
                user_info = _exchange_microsoft_code(code, redirect_uri)

            elif provider == "github":
                if not code:
                    return Response({"error": "GitHub authorization code is required."}, status=status.HTTP_400_BAD_REQUEST)
                user_info = _exchange_github_code(code, redirect_uri)

            else:
                return Response({"error": f"Unsupported provider: {provider}"}, status=status.HTTP_400_BAD_REQUEST)

        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        user = _get_or_create_social_user(
            email=user_info["email"],
            full_name=user_info.get("name", ""),
            provider=provider,
            provider_id=user_info.get("provider_id", ""),
        )

        if not user:
            return Response({"error": "Could not create or find user account."}, status=status.HTTP_400_BAD_REQUEST)

        refresh = RefreshToken.for_user(user)
        response = Response({
            "message": f"Signed in with {provider.title()}.",
            "tokens": {
                "access": str(refresh.access_token),
            },
        }, status=status.HTTP_200_OK)
        # Set refresh token in HttpOnly secure cookie.
        from api.views import _set_refresh_cookie
        _set_refresh_cookie(response, str(refresh))
        return response
