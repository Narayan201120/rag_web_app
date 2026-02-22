from django.db import models
from django.contrib.auth.models import User

class ChatMessage(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='chats')
    question = models.TextField()
    answer = models.TextField()
    sources = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user.username}: {self.question[:50]}"