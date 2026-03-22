from django.db import models
from django.contrib.auth.models import User
import uuid

""" CONVERSATION MODEL( groups chat messages into sessions ) """
class Conversation(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='conversations')
    title = models.CharField(max_length=255, default='New Conversation')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.user.username}: {self.title}'

""" CHAT MESSAGE MODEL """
class ChatMessage(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='chats')
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name='messages', null=True, blank=True)
    question = models.TextField()
    answer = models.TextField()
    sources = models.JSONField(default=list)
    chunks = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user.username}: {self.question[:50]}"

""" CHAT FEEDBACK MODEL """
class ChatFeedback(models.Model):
    RATING_CHOICES = [
        ('up', 'Thumbs Up'),
        ('down', 'Thumbs Down'),
    ]
    FAILURE_TAG_CHOICES = [
        ('bad_retrieval', 'Bad Retrieval'),
        ('hallucination', 'Hallucination'),
        ('incomplete', 'Incomplete'),
        ('other', 'Other'),
    ]
    chat = models.OneToOneField(ChatMessage, on_delete=models.CASCADE, related_name='feedback')
    rating = models.CharField(max_length=4, choices=RATING_CHOICES)
    comment = models.TextField(blank=True, default='')
    failure_tag = models.CharField(max_length=20, choices=FAILURE_TAG_CHOICES, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.chat.user.username}: {self.rating}"

""" COLLECTION MODEL """
class Collection(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='collections')
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        unique_together = ('user', 'name')

    def __str__(self):
        return f"{self.user.username}/{self.name}"

""" DOCUMENT MODEL """
class Document(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='documents')
    collection = models.ForeignKey(Collection, on_delete=models.SET_NULL, null=True, blank=True, related_name='documents')
    filename = models.CharField(max_length=255)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['user', 'filename']

    def __str__(self):
        return self.filename

""" API USAGE LOG MODEL """
class APIUsageLog(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='usage_logs')
    endpoint = models.CharField(max_length=255)
    method = models.CharField(max_length=10)
    status_code = models.IntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user.username} - {self.method} {self.endpoint}"

""" USER PROFILE MODEL """
class UserProfile(models.Model):
    PROVIDER_CHOICES = [
        ("google-gemini", "Google Gemini"),
        ("openai", "OpenAI"),
        ("anthropic", "Anthropic"),
        ("mistral", "Mistral"),
        ("xai", "xAI"),
        ("qwen", "Qwen"),
        ("minimax", "MiniMax"),
        ("meta-llama", "Meta Llama"),
        ("other", "Other"),
    ]

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    llm_provider = models.CharField(max_length=32, choices=PROVIDER_CHOICES, default="google-gemini")
    llm_model = models.CharField(max_length=128, default="gemini-2.5-flash")
    llm_api_key = models.TextField(blank=True, default='')

    def __str__(self):
        return f"{self.user.username}'s profile"

""" TASK MODEL """
class Task(models.Model):
    TASK_TYPES = [
        ('upload', 'Upload'),
        ('ingest', 'Ingest'),
        ('url_ingest', 'URL Ingest'),
    ]

    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
        ('cancelled', 'Cancelled'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='tasks')
    task_type = models.CharField(max_length=20, choices=TASK_TYPES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    progress = models.PositiveSmallIntegerField(default=0)
    message = models.TextField(blank=True, default='')
    result = models.JSONField(default=dict)
    error = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user.username} - {self.task_type} - {self.status}"

""" EVALUATION DATASET MODEL """
class EvaluationDataset(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='evaluation_datasets')
    question = models.TextField()
    expected_answer = models.TextField(blank=True, default='')
    reference_context = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user.username}: {self.question[:50]}"

""" EVALUATION RESULT MODEL """
class EvaluationResult(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='evaluation_results')
    dataset_item = models.ForeignKey(EvaluationDataset, on_delete=models.SET_NULL, null=True, blank=True)
    question = models.TextField()
    actual_answer = models.TextField()
    retrieved_context = models.JSONField(default=list)
    faithfulness_score = models.FloatField(null=True, blank=True)
    answer_relevance_score = models.FloatField(null=True, blank=True)
    context_relevancy_score = models.FloatField(null=True, blank=True)
    error = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user.username}: {self.question[:50]} - Faithfulness: {self.faithfulness_score}"
