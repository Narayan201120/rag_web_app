import requests as http_requests
import os
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
from bs4 import BeautifulSoup
from api.models import ChatMessage, ChatFeedback, Collection, Document, APIUsageLog

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

def load_documents():
    global docs, chunk_sources, index, embeddings
    docs.clear()
    chunk_sources.clear()

    for filename in sorted(os.listdir(DOC_DIR)):
        if not filename.lower().endswith(SUPPORTED_EXTENSIONS):
            continue
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

    index, embeddings = build_index(docs)

load_documents()

class HealthView(APIView):
    def get(self, request):
        return Response({"status":"ok", "message":"RAG API is running"}, status=status.HTTP_200_OK)

class AskView(APIView):
    permission_classes = [IsAuthenticated]
    def post(self, request):
        question = request.data.get("question")
        if not question or not question.strip():
            return Response(
                {"error": "Please provide a non-empty 'question' in the request body."},
                status=status.HTTP_400_BAD_REQUEST
            )
        top_chunks, top_indices = search(question, docs, index, embeddings, top_k=3)
        sources = [chunk_sources[i] for i in top_indices]
        try:
            answer = generate_answer(question, top_chunks)
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
        uploaded_file = request.FILES.get('document')
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
        load_documents()
        return Response(
            {'message': f'"{uploaded_file.name}" uploaded and indexed successfully.'},
            status=status.HTTP_201_CREATED
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
        load_documents()
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
        token = default_token_generator.make_token(user)
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        return Response({
            'message': 'If an account with this email exits, a reset link has been sent.',
            'reset_token': token,
            'uid': uid
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
        query = request.data.get('query')
        if not query:
            return Response(
                {'error': 'Please provide a non-empty query.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        top_k = request.data.get('top_k', 3)
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
        try:
            response = http_requests.get(url, timeout=10)
            response.raise_for_status()
        except http_requests.RequestException as e:
            return Response(
                {'error': 'Failed to download from the provided URL.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        content_type = response.headers.get('Content-Type', '')
        filename = url.split('/')[-1] or 'downloaded_doc'

        if 'text/html' in content_type:
            soup = BeautifulSoup(response.text, 'html.parser')
            for tag in soup(['script', 'style', 'nav', 'footer', 'header', 'aside']):
                tag.decompose()
            text = soup.get_text(separator='\n', strip=True)
            if not filename.endswith('.txt'):
                filename = filename.split('.')[0] + '.txt'
            filepath = os.path.join(DOC_DIR, filename)
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(text)
        else:
            if not filename.lower().endswith(SUPPORTED_EXTENSIONS):
                filename += '.txt'
            filepath = os.path.join(DOC_DIR, filename)
            with open(filepath, 'wb') as f:
                f.write(response.content)
        load_documents()
        return Response({
            'message': f'"{filename}" downloaded and indexed successfully.',
            'source_url': url,
        }, status=status.HTTP_201_CREATED)
        
""" CHAT VIEW """
class ChatView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        question = request.data.get('question')
        if not question or not question.strip():
            return Response(
                {'error': 'Please provide a non-empty question.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        top_chunks, top_indices = search(question, docs, index, embeddings, top_k=3)
        sources = list(dict.fromkeys([chunk_sources[i] for i in top_indices]))
        try:
            answer = generate_answer(question, top_chunks)
        except Exception:
            return Response(
                {'error': 'The answer service is temporarily unavailable.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )
        chat = ChatMessage.objects.create(
            user = request.user,
            question = question,
            answer = answer,
            sources = sources,
            chunks = top_chunks,
        )
        return Response({
            'id': chat.id,
            'question': chat.question,
            'answer': chat.answer,
            'sources': chat.sources,
            'created_at': chat.created_at,
        }, status=status.HTTP_200_OK)

""" CHAT HISTORY VIEW """
class ChatHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        chats = ChatMessage.objects.filter(user=request.user)
        history = []
        for chat in chats:
            history.append({
                'id': chat.id,
                'question': chat.question,
                'answer': chat.answer,
                'sources': chat.sources,
                'created_at': chat.created_at,
            })
        return Response({
            'count': len(history),
            'chats': history,
        }, status=status.HTTP_200_OK)

""" INGEST VIEW """
class IngestView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            load_documents()
            return Response({
                'message': 'Documents ingested successfully.',
                'total_chunks': len(docs),
                'total_documents': len(set(chunk_sources)),
                'documents': list(dict.fromkeys(chunk_sources)),
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response(
                {'error': f'Ingestion failed: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

""" STATUS VIEW """
class StatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
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
        doc, created = Document.objects.get_or_create(
            user = request.user,
            filename = filename,
            defaults = {'collection_id': collection_id},
        )
        if not created:
            if collection_id:
                try:
                    collection = Collection.objects.get(id=collection_id, user=request.user)
                except Collection.DoesNotExist:
                    return Response(
                        {'error': 'Collection not found.'},
                        status=status.HTTP_404_NOT_FOUND
                    )
                doc.collection = collection
            else:
                doc.collection = None
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
        query = request.data.get('query')
        if not query or not query.strip():
            return Response(
                {'error': 'Please provide a non-empty query.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        initial_k = request.data.get('initial_k', 10)
        final_k = request.data.get('final_k', 3)
        top_chunks, top_indices = search(query, docs, index, embeddings, top_k=initial_k)
        reranked = rerank(query, top_chunks, top_k=final_k)
        results = []
        for chunk, score in reranked:
            source_idx = top_chunks.index(chunk)
            results.append({
                'chunk': chunk,
                'source': chunk_sources[top_indices[source_idx]],
                'relevance_score': round(score, 4)
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
        from django.utils import timezone
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
        }, status=status.HTTP_200_OK)