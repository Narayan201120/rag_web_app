import requests as http_requests
import os
import socket
import ipaddress
from urllib.parse import urlparse
from pathlib import Path
from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from api.retriever import build_index, search, rerank
from api.generator import generate_answer
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth.models import User
from django.contrib.auth import authenticate
from api.serializers import SignUpSerializer
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth.tokens import default_token_generator
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.encoding import force_bytes, force_str
from django.utils import timezone
from bs4 import BeautifulSoup
from api.models import ChatMessage, ChatFeedback, Collection, Document, APIUsageLog, UserProfile, Conversation, Task
from api.tasks import submit_task, TaskCancelled

DOC_DIR = os.path.join(settings.BASE_DIR, "documents")
SUPPORTED_EXTENSIONS = (".txt", ".md", ".pdf", ".docx")


def extract_text_from_file(filepath, filename):
    """Extract plain text from a file based on its extension. Returns a single string."""
    ext = os.path.splitext(filename)[1].lower()
    if ext in (".txt", ".md"):
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            return f.read()
    if ext == ".pdf":
        from pypdf import PdfReader
        reader = PdfReader(filepath)
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    if ext == ".docx":
        from docx import Document
        doc = Document(filepath)
        return "\n".join(p.text for p in doc.paragraphs)
    return ""


docs = []
chunk_sources = []
index = None
embeddings = None
_documents_loaded = False


def _is_private_or_local_host(hostname):
    try:
        address_info = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        return True

    for info in address_info:
        ip = ipaddress.ip_address(info[4][0])
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
        ):
            return True
    return False


def _is_safe_user_url(url):
    parsed = urlparse(url.strip())
    if parsed.scheme not in ("http", "https"):
        return False
    if not parsed.hostname:
        return False
    return not _is_private_or_local_host(parsed.hostname)


def _safe_filename(name, fallback):
    cleaned = Path(name).name.strip()
    return cleaned or fallback


def load_documents(progress_callback=None, is_cancelled=None):
    global docs, chunk_sources, index, embeddings, _documents_loaded
    docs.clear()
    chunk_sources.clear()

    os.makedirs(DOC_DIR, exist_ok=True)
    files = [
        filename for filename in sorted(os.listdir(DOC_DIR))
        if filename.lower().endswith(SUPPORTED_EXTENSIONS)
    ]
    total_files = max(1, len(files))

    for idx, filename in enumerate(files, start=1):
        if is_cancelled and is_cancelled():
            raise TaskCancelled("Task was cancelled.")
        filepath = os.path.join(DOC_DIR, filename)
        try:
            content = extract_text_from_file(filepath, filename)
        except Exception:
            continue
        if not content or not content.strip():
            continue
        paragraphs = [p.strip() for p in content.split("\n\n") if p.strip()]
        if not paragraphs:
            paragraphs = [content.strip()]
        for para in paragraphs:
            docs.append(para)
            chunk_sources.append(filename)
        if progress_callback:
            progress = 55 + int((idx / total_files) * 35)
            progress_callback(min(progress, 90), f"Processed {idx}/{len(files)} files.")

    if is_cancelled and is_cancelled():
        raise TaskCancelled("Task was cancelled.")
    if progress_callback:
        progress_callback(95, "Building vector index...")
    try:
        index, embeddings = build_index(docs)
    except Exception:
        index, embeddings = None, None
    _documents_loaded = True


def ensure_documents_loaded(force=False):
    if force or not _documents_loaded:
        load_documents()


def _download_url_to_document(url, update=None, is_cancelled=None):
    if is_cancelled and is_cancelled():
        raise TaskCancelled("Task was cancelled.")

    if update:
        update(15, "Downloading URL content...")

    response = http_requests.get(url, timeout=10, allow_redirects=False)
    if 300 <= response.status_code < 400:
        raise ValueError("Redirecting URLs are not allowed.")
    response.raise_for_status()

    if is_cancelled and is_cancelled():
        raise TaskCancelled("Task was cancelled.")

    content_type = response.headers.get("Content-Type", "")
    parsed = urlparse(url)
    filename = _safe_filename(Path(parsed.path).name, "downloaded_doc.txt")

    if "text/html" in content_type:
        if update:
            update(35, "Parsing HTML content...")
        soup = BeautifulSoup(response.text, "html.parser")
        for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
            tag.decompose()
        text = soup.get_text(separator="\n", strip=True)
        if not filename.lower().endswith(".txt"):
            filename = f"{Path(filename).stem}.txt"
        filepath = os.path.join(DOC_DIR, filename)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(text)
    else:
        if not filename.lower().endswith(SUPPORTED_EXTENSIONS):
            filename = f"{filename}.txt"
        filepath = os.path.join(DOC_DIR, filename)
        with open(filepath, "wb") as f:
            f.write(response.content)

    return filename


def _run_reindex_task(update=None, is_cancelled=None):
    if update:
        update(50, "Indexing documents...")

    load_documents(progress_callback=update, is_cancelled=is_cancelled)

    return {
        "message": "Documents ingested successfully.",
        "total_chunks": len(docs),
        "total_documents": len(set(chunk_sources)),
        "documents": list(dict.fromkeys(chunk_sources)),
    }


def _run_upload_task(filename, update=None, is_cancelled=None):
    if update:
        update(30, f'Uploaded "{filename}". Starting ingestion...')
    result = _run_reindex_task(update=update, is_cancelled=is_cancelled)
    result["message"] = f'"{filename}" uploaded and indexed successfully.'
    result["filename"] = filename
    return result


def _run_url_ingest_task(url, update=None, is_cancelled=None):
    filename = _download_url_to_document(url, update=update, is_cancelled=is_cancelled)
    if update:
        update(55, f'Fetched "{filename}". Starting ingestion...')
    result = _run_reindex_task(update=update, is_cancelled=is_cancelled)
    result["message"] = f'"{filename}" downloaded and indexed successfully.'
    result["filename"] = filename
    result["source_url"] = url
    return result

class HealthView(APIView):
    def get(self, request):
        return Response({"status":"ok", "message":"RAG API is running"}, status=status.HTTP_200_OK)

class AskView(APIView):
    permission_classes = [IsAuthenticated]
    def post(self, request):
        ensure_documents_loaded()
        question = request.data.get("question")
        if not question or not question.strip():
            return Response(
                {"error": "Please provide a non-empty 'question' in the request body."},
                status=status.HTTP_400_BAD_REQUEST
            )
        if index is None or index.ntotal == 0:
            return Response(
                {"error": "No indexed documents found. Upload documents and run ingestion first."},
                status=status.HTTP_400_BAD_REQUEST
            )
        top_chunks, top_indices = search(question, docs, index, embeddings, top_k=3)
        sources = [chunk_sources[i] for i in top_indices]
        try:
            profile, _ = UserProfile.objects.get_or_create(user=request.user)
            user_key = profile.gemini_api_key or None
            answer = generate_answer(question, top_chunks, api_key=user_key)
        except Exception as e:
            return Response(
                {"error": "The answer service is temporarily unavailable. Please try again later."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )
        return Response({"answer":answer, "sources":list(dict.fromkeys(sources))}, status=status.HTTP_200_OK)

""" SIGN-UP VIEW """
class SignUpView(APIView):
    def post(self, request):
        serializer = SignUpSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            refresh = RefreshToken.for_user(user)
            return Response({
                'message': 'Signed Up Successfully.',
                'tokens': {
                    'refresh': str(refresh),
                    'access': str(refresh.access_token)
                }
            }, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

""" SIGN-IN VIEW """
class SignInView(APIView):
    def post(self, request):
        username = request.data.get('username')
        password = request.data.get('password')
        if not username or not password:
            return Response(
                {'error':'Please provide both username and password.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        user = authenticate(username=username, password=password)
        if user is None:
            return Response(
                {'error':'Invalid credentials.'},
                status=status.HTTP_401_UNAUTHORIZED
            )
        refresh = RefreshToken.for_user(user)
        return Response(
            {'message':'Signed In Successfully.',
                'tokens': {
                    'refresh':str(refresh),
                    'access': str(refresh.access_token)
                }
            },
            status=status.HTTP_200_OK
        )

""" LOG-OUT VIEW """
class LogOutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        refresh_token = request.data.get('refresh')
        if not refresh_token:
            return Response(
                {'error':'Please provide the refresh token'},
                status=status.HTTP_400_BAD_REQUEST
            )
        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response(
                {'message': 'Logged out successfully.'},
                status=status.HTTP_200_OK
            )
        except Exception:
            return Response(
                {'error': 'Invalid or expired token.'},
                status=status.HTTP_400_BAD_REQUEST
            )

""" DOCUMENT UPLOAD VIEW """
class DocumentUploadView(APIView):
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        uploaded_file = request.FILES.get('document') or request.FILES.get('file')
        if not uploaded_file:
            return Response(
                {'error': 'Please upload a file.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if not uploaded_file.name.lower().endswith(SUPPORTED_EXTENSIONS):
            return Response(
                {'error': f'Unsupported file format. Allowed: { ",".join(SUPPORTED_EXTENSIONS)}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        filepath = os.path.join(DOC_DIR, uploaded_file.name)
        with open(filepath, 'wb') as f:
            for chunk in uploaded_file.chunks():
                f.write(chunk)

        task = Task.objects.create(
            user=request.user,
            task_type="upload",
            status="pending",
            progress=5,
            message=f'Queued upload task for "{uploaded_file.name}".',
        )
        submit_task(task.id, _run_upload_task, uploaded_file.name)

        return Response(
            {
                "task_id": str(task.id),
                "status": task.status,
                "message": task.message,
            },
            status=status.HTTP_202_ACCEPTED,
        )

""" LIST DOCUMENTS VIEW """
class ListDocumentsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        files = []
        for filename in os.listdir(DOC_DIR):
            if filename.lower().endswith(SUPPORTED_EXTENSIONS):
                filepath = os.path.join(DOC_DIR, filename)
                size_bytes = os.path.getsize(filepath)
                files.append({
                    'name': filename,
                    'size_bytes': size_bytes,
                })
        return Response({
            'count': len(files),
            'documents': files,
        }, status=status.HTTP_200_OK)


""" DELETE DOCUMENT VIEW """
class DeleteDocumentView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, filename):
        filepath = os.path.join(DOC_DIR, filename)
        if not os.path.exists(filepath):
            return Response(
                {'error': f'Document {filename} not found!'},
                status=status.HTTP_404_NOT_FOUND
            )
        os.remove(filepath)
        ensure_documents_loaded(force=True)
        return Response(
            {'message': f'"{filename}" deleted and index rebuilt.'},
            status=status.HTTP_200_OK
        )

""" DELETE ACCOUNT VIEW"""
class DeleteAccountView(APIView):
    permission_classes = [IsAuthenticated]
    
    def delete(self, request):
        password = request.data.get('password')
        if not password:
            return Response(
                {'error': 'Please provide your password to confirm account deletion.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        user = authenticate(username=request.user.username, password=password)
        if user is None:
            return Response(
                {'error': 'Incorrect Password!'},
                status=status.HTTP_403_FORBIDDEN
            )
        user.delete()
        return Response(
            {'message': 'Account deleted successfully.'},
            status=status.HTTP_200_OK
        )

""" ACCOUNT VIEW """
class AccountView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({
            'username': request.user.username,
            'email': request.user.email,
        }, status=status.HTTP_200_OK)

""" FORGOT PASSWORD VIEW """
class ForgotPasswordView(APIView):
    def post(self, request):
        email = request.data.get('email')
        if not email:
            return Response(
                {'error': 'Please provide your email.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return Response(
                {'message': 'If an account with this email exits, a reset link has been sent.'},
                status=status.HTTP_200_OK
            )
        # Reset token artifacts should be delivered out-of-band (e.g., email),
        # not returned in API responses.
        default_token_generator.make_token(user)
        urlsafe_base64_encode(force_bytes(user.pk))
        return Response({
            'message': 'If an account with this email exits, a reset link has been sent.',
            }, status=status.HTTP_200_OK
        )

""" RESET PASSWORD VIEW """
class ResetPasswordView(APIView):
    def post(self, request):
        uid = request.data.get('uid')
        token = request.data.get('token')
        new_password = request.data.get('new_password')
        if not uid or not token or not new_password:
            return Response(
                {'error': 'uid, token, and new_password are required.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if len(new_password) < 8:
            return Response(
                {'error': 'Password must be at least 8 characters.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        try:
            user_id = force_str(urlsafe_base64_decode(uid))
            user = User.objects.get(pk=user_id)
        except (User.DoesNotExist, ValueError):
            return Response(
                {'error': 'Invalid reset link.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if not default_token_generator.check_token(user, token):
            return Response(
                {'error': 'Invalid or expired token.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        user.set_password(new_password)
        user.save()
        return Response(
            {'message': 'Password reset successfully'},
            status=status.HTTP_200_OK
        )

""" SEARCH VIEW """
class SearchView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ensure_documents_loaded()
        query = request.data.get('query')
        if not query:
            return Response(
                {'error': 'Please provide a non-empty query.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        top_k = request.data.get('top_k', 3)
        try:
            top_k = int(top_k)
        except (TypeError, ValueError):
            return Response(
                {'error': 'top_k must be an integer.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        top_chunks, top_indices = search(query, docs, index, embeddings, top_k=top_k)
        sources = [chunk_sources[i] for i in top_indices]
        results = []
        for i, chunk in enumerate(top_chunks):
            results.append({
                'chunk': chunk,
                'source': sources[i]
            })
        return Response({
            'query': query,
            'count': len(results),
            'results': results,
        }, status=status.HTTP_200_OK)

""" UPLOAD URL VIEW """
class UploadURLView(APIView):
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        url = request.data.get('url')
        if not url: 
            return Response(
                {'error': 'Please provide a URL.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if not _is_safe_user_url(url):
            return Response(
                {'error': 'URL is not allowed.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        task = Task.objects.create(
            user=request.user,
            task_type="url_ingest",
            status="pending",
            progress=5,
            message="Queued URL ingestion task.",
        )
        submit_task(task.id, _run_url_ingest_task, url)

        return Response({
            "task_id": str(task.id),
            "status": task.status,
            "message": task.message,
        }, status=status.HTTP_202_ACCEPTED)
        
""" CHAT VIEW """
class ChatView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ensure_documents_loaded()
        question = request.data.get('question')
        conversation_id = request.data.get('conversation_id')

        if not question or not question.strip():
            return Response(
                {'error': 'Please provide a non-empty question.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if index is None or index.ntotal == 0:
            return Response(
                {'error': 'No indexed documents found. Upload documents and run ingestion first.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if conversation_id:
            try:
                conversation = Conversation.objects.get(id=conversation_id, user=request.user)
            except Conversation.DoesNotExist:
                return Response(
                    {'error': 'Conversation not found.'},
                    status=status.HTTP_404_NOT_FOUND
                )
        else:
            conversation = Conversation.objects.create(
                user=request.user,
                title=question[:50],
            )

        past_messages = ChatMessage.objects.filter(
            conversation=conversation
        ).order_by('created_at')
        chat_history = [
            {'question': m.question, 'answer': m.answer} 
            for m in past_messages
        ]

        top_chunks, top_indices = search(question, docs, index, embeddings, top_k=3)
        sources = list(dict.fromkeys([chunk_sources[i] for i in top_indices]))
        try:
            profile, _ = UserProfile.objects.get_or_create(user=request.user)
            user_key = profile.gemini_api_key or None
            answer = generate_answer(question, top_chunks, api_key=user_key, chat_history=chat_history)
        except Exception:
            return Response(
                {'error': 'The answer service is temporarily unavailable'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )
        chat = ChatMessage.objects.create(
            user=request.user,
            conversation=conversation,
            question=question,
            answer=answer,
            sources=sources,
            chunks=top_chunks,
        )
        return Response({
            'id': chat.id,
            'conversation_id': conversation.id,
            'question': chat.question,
            'answer': chat.answer,
            'sources': chat.sources,
            'created_at': chat.created_at,
        }, status=status.HTTP_200_OK)

""" LIST CONVERSATIONS """
class ChatHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        conversations = Conversation.objects.filter(user=request.user)
        result = []
        for conv in conversations:
            last_msg = conv.messages.order_by('-created_at').first()
            result.append({
                'id': conv.id,
                'title': conv.title,
                'created_at': conv.created_at,
                'updated_at': conv.updated_at,
                'message_count': conv.messages.count(),
                'last_message': last_msg.question[:80] if last_msg else '',
            })
        return Response({
            'count': len(result),
            'conversations': result,
        }, status=status.HTTP_200_OK)

""" LOAD A SPECIFIC CONVERSATION'S MESSAGES """
class ConversationDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, conversation_id):
        try:
            conv = Conversation.objects.get(id=conversation_id, user=request.user)
        except Conversation.DoesNotExist:
            return Response({'error': 'Conversation not found.'}, status=status.HTTP_404_NOT_FOUND)
        messages = conv.messages.order_by('created_at')
        return Response({
            'id': conv.id,
            'title': conv.title,
            'messages': [{
                'id': m.id,
                'question': m.question,
                'answer': m.answer,
                'sources': m.sources,
                'created_at': m.created_at,
            } for m in messages],
        }, status=status.HTTP_200_OK)

""" INGEST VIEW """
class IngestView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        task = Task.objects.create(
            user=request.user,
            task_type="ingest",
            status="pending",
            progress=5,
            message="Queued ingestion task.",
        )
        submit_task(task.id, _run_reindex_task)
        return Response(
            {
                "task_id": str(task.id),
                "status": task.status,
                "message": task.message,
            },
            status=status.HTTP_202_ACCEPTED,
        )

""" STATUS VIEW """
class StatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        ensure_documents_loaded()
        vector_db_ok = index is not None and index.ntotal > 0
        return Response({
            'status': 'ok' if vector_db_ok else 'degraded',
            'server': 'running',
            'vector_database': {
                'connected': index is not None,
                'total_chunks': index.ntotal if index is not None else 0,
                'total_documents': len(set(chunk_sources)),
                'embedding_dimension': index.d if index is not None else 0,
            },
            'supported_formats': list(SUPPORTED_EXTENSIONS),
        }, status=status.HTTP_200_OK)

""" CHAT FEEDBACK VIEW """
class ChatFeedbackView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, chat_id):
        try:
            chat = ChatMessage.objects.get(id=chat_id, user=request.user)
        except ChatMessage.DoesNotExist:
            return Response(
                {'error': 'Chat not found.'},
                status=status.HTTP_404_NOT_FOUND
            )
        rating = request.data.get('rating')
        if rating not in ['up', 'down']:
            return Response(
                {'error': 'Rating must be "up" or "down".'},
                status=status.HTTP_400_BAD_REQUEST
            )
        comment = request.data.get('comment', '')
        feedback, created = ChatFeedback.objects.update_or_create(
            chat=chat,
            defaults={'rating':  rating, 'comment': comment},
        )
        return Response({
            'message': 'Feedback submitted.' if created else 'Feedback updated.',
            'chat_id': chat.id,
            'rating': feedback.rating,
            'comment': feedback.comment,
            'created_at': feedback.created_at,
        }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

""" CHAT CITATIONS VIEW """
class ChatCitationsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, chat_id):
        try:
            chat = ChatMessage.objects.get(id=chat_id, user=request.user)
        except ChatMessage.DoesNotExist:
            return Response(
                {'error': 'Chat not found.'},
                status=status.HTTP_404_NOT_FOUND
            )
        citations = []
        for i, chunk in enumerate(chat.chunks):
            citations.append({
                'index': i+1,
                'text': chunk,
                'source': chat.sources[i] if i < len(chat.sources) else 'unknown',
            })
        return Response({
            'chat_id': chat.id,
            'question': chat.question,
            'total_citations': len(citations),
            'citations': citations,
        }, status=status.HTTP_200_OK)

""" LIST & CREATE COLLECTIONS VIEW """
class CollectionsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        collections = Collection.objects.filter(user=request.user)
        data = []
        for col in collections:
            data.append({
                'id': col.id,
                'name': col.name,
                'description': col.description,
                'document_count': col.documents.count(),
                'created_at': col.created_at,
            })
        return Response({
            'count': len(data),
            'collections': data,
        }, status=status.HTTP_200_OK)
    
    def post(self, request):
        name = request.data.get('name')
        if not name or not name.strip():
            return Response(
                {'error': 'Collection name is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        description = request.data.get('description', '')
        if Collection.objects.filter(user=request.user, name=name).exists():
            return Response(
                {'error': 'A collection with this name already exists.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        collection = Collection.objects.create(
            user = request.user,
            name=name,
            description=description,
        )
        return Response({
            'message': f'Collection "{name}" created.',
            'id': collection.id,
            'name': collection.name,
            'description': collection.description,
        }, status=status.HTTP_201_CREATED)


""" MOVE DOCUMENT TO COLLECTION VIEW """
class MoveDocumentView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, filename):
        collection_id = request.data.get('collection_id')
        collection = None
        if collection_id:
            try:
                collection = Collection.objects.get(id=collection_id, user=request.user)
            except Collection.DoesNotExist:
                return Response(
                    {'error': 'Collection not found.'},
                    status=status.HTTP_404_NOT_FOUND
                )
        doc, created = Document.objects.get_or_create(
            user = request.user,
            filename = filename,
            defaults = {'collection': collection},
        )
        if not created:
            doc.collection = collection
            doc.save()
        return Response({
            'message': f'"{filename}" moved successfully.',
            'filename': doc.filename,
            'collection': doc.collection.name if doc.collection else None,
        }, status=status.HTTP_200_OK)

""" SEARCH RERANK VIEW """
class SearchRerankView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ensure_documents_loaded()
        query = request.data.get('query')
        if not query or not query.strip():
            return Response(
                {'error': 'Please provide a non-empty query.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        initial_k = request.data.get('initial_k', 10)
        final_k = request.data.get('final_k', 3)
        try:
            initial_k = int(initial_k)
            final_k = int(final_k)
        except (TypeError, ValueError):
            return Response(
                {'error': 'initial_k and final_k must be integers.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        top_chunks, top_indices = search(query, docs, index, embeddings, top_k=initial_k)
        reranked = rerank(query, top_chunks, top_k=final_k)
        results = []
        for item in reranked:
            source_idx = item['index']
            results.append({
                'chunk': item['chunk'],
                'source': chunk_sources[top_indices[source_idx]],
                'relevance_score': round(item['score'], 4)
            })
        return Response({
            'query': query,
            'count': len(results),
            'results': results,
        }, status=status.HTTP_200_OK)

""" SEARCH SUGGEST VIEW """
class SearchSuggestView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        ensure_documents_loaded()
        query = request.query_params.get('q', '').lower().strip()
        if not query:
            return Response(
                {'error': 'Please provide a query parameter "q".'},
                status=status.HTTP_400_BAD_REQUEST
            )
        suggestions = set()
        for source in chunk_sources:
            name = os.path.splitext(source)[0].replace('-', ' ').replace('_', ' ')
            if query in name.lower():
                suggestions.add(name)
        for chunk in docs:
            words = chunk.split()[:10]
            line = ' '.join(words)
            if query in line.lower():
                suggestions.add(line)
        return Response({
            'query': query,
            'count': len(suggestions),
            'suggestions': sorted(suggestions)[:10],
        }, status=status.HTTP_200_OK) 

""" ADMIN USAGE VIEW """
class AdminUsageView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.is_staff:
            return Response(
                {'error': 'Admin access required.'},
                status=status.HTTP_403_FORBIDDEN
            )
        from django.db.models import Count
        from datetime import timedelta

        since = timezone.now() - timedelta(days=7)
        total_calls = APIUsageLog.objects.filter(created_at__gte=since).count()
        per_user = (
            APIUsageLog.objects.filter(created_at__gte=since)
            .values('user__username')
            .annotate(call_count=Count('id'))
            .order_by('-call_count')[:10]
        )
        per_endpoint = (
            APIUsageLog.objects.filter(created_at__gte=since)
            .values('endpoint')
            .annotate(call_count=Count('id'))
            .order_by('-call_count')[:10]
        )
        return Response({
            'period': 'last_7_days',
            'total_calls': total_calls,
            'per_user': list(per_user),
            'top_endpoints': list(per_endpoint),
        }, status=status.HTTP_200_OK)

""" ADMIN VECTORS VIEW """
class AdminVectorsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        ensure_documents_loaded()
        if not request.user.is_staff:
            return Response(
                {'error': 'Admin access required.'},
                status=status.HTTP_403_FORBIDDEN
            )
        doc_stats = {}
        for i, source in enumerate(chunk_sources):
            if source not in doc_stats:
                doc_stats[source] = {'chunks': 0, 'sample': docs[i][:100]}
            doc_stats[source]['chunks'] += 1
        return Response({
            'total_vectors': index.ntotal if index else 0,
            'embedding_dim': index.d if index else 0,
            'total_documents': len(doc_stats),
            'documents': doc_stats,
        }, status=status.HTTP_200_OK
        )

""" CHAT EXPORT VIEW """
class ChatExportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, chat_id):
        try:
            chat = ChatMessage.objects.get(id=chat_id, user=request.user)
        except ChatMessage.DoesNotExist:
            return Response(
                {'error': 'Chat not found.'},
                status=status.HTTP_404_NOT_FOUND
            )
        format_type = request.query_params.get('export_format', 'json')
        if format_type == 'markdown':
            content = f"# Chat Export\n\n"
            content += f"**Question:** {chat.question}\n\n"
            content += f"**Answer:** {chat.answer}\n\n"
            content += f"**Sources:** {','.join(chat.sources)}\n\n"
            content += f"**Date:** {chat.created_at}\n\n"
            from django.http import HttpResponse
            response = HttpResponse(content, content_type='text/markdown')
            response['Content-Disposition'] = f'attachment; filename="chat_{chat_id}.md"'
            return response
        else:
            return Response({
                'id': chat.id,
                'question': chat.question,
                'answer': chat.answer,
                'sources': chat.sources,
                'chunks': chat.chunks,
                'created_at': str(chat.created_at),
                'feedback': {
                    'rating': chat.feedback.rating,
                    'comment': chat.feedback.comment,
                } if hasattr(chat, 'feedback') and chat.feedback else None,
            }, status=status.HTTP_200_OK)

""" SAVE/RETRIEVE API KEY VIEW """
class APIKeyView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        key = profile.gemini_api_key
        if key:
            masked = key[:4] + "." * (len(key) - 8) + key[-4:]
        else:
            masked = ''
        return Response(
            {'api_key': masked},
            status=status.HTTP_200_OK
        )
    
    def post(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        profile.gemini_api_key = request.data.get('api_key', '')
        profile.save()
        return Response(
            {'message': 'API key saved successfully.'},
            status=status.HTTP_200_OK
        )


""" TASK STATUS VIEW """
class TaskStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, task_id):
        try:
            task = Task.objects.get(id=task_id, user=request.user)
        except Task.DoesNotExist:
            return Response(
                {'error': 'Task not found.'},
                status=status.HTTP_404_NOT_FOUND
            )
        return Response({
            'task_id': str(task.id),
            'task_type': task.task_type,
            'status': task.status,
            'progress': task.progress,
            'message': task.message,
            'result': task.result,
            'error': task.error,
            'created_at': str(task.created_at),
            'started_at': str(task.started_at) if task.started_at else None,
            'finished_at': str(task.finished_at) if task.finished_at else None,
        }, status=status.HTTP_200_OK
        )

""" TASK CANCEL VIEW """
class TaskCancelView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, task_id):
        try:
            task = Task.objects.get(id=task_id, user=request.user)
        except Task.DoesNotExist:
            return Response(
                {'error': 'Task not found.'},
                status=status.HTTP_404_NOT_FOUND
            )
        if task.status not in ['pending', 'processing']:
            return Response(
                {'error': f'Task cannot be cancelled from status "{task.status}"'},
                status=status.HTTP_400_BAD_REQUEST
            )
        task.status = 'cancelled'
        task.finished_at = timezone.now()
        task.save(update_fields=['status', 'finished_at', 'updated_at'])
        return Response(
            {'message': 'Task cancelled successfully.'},
            status=status.HTTP_200_OK
        )
