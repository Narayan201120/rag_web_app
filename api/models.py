from django.db import models
from django.contrib.auth.models import User

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
    chat = models.OneToOneField(ChatMessage, on_delete=models.CASCADE, related_name='feedback')
    rating = models.CharField(max_length=4, choices=RATING_CHOICES)
    comment = models.TextField(blank=True, default='')
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
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    gemini_api_key = models.TextField(blank=True, default='')

    def __str__(self):
        return f"{self.user.username}'s profile"