import uuid
from django.conf import settings
from django.db import models


class DictionaryEntry(models.Model):
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        PENDING = 'pending', 'Pending'
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'
        ARCHIVED = 'archived', 'Archived'

    class Variant(models.TextChoices):
        ISAMURONG = 'isamurong', 'Isamurong'
        IVASAY = 'ivasay', 'Ivasay'
        ITBAYATEN = 'itbayaten', 'Itbayaten'
        ISABTANG = 'isabtang', 'Isabtang'
        GENERAL = 'general', 'General Ivatan'

    class PartOfSpeech(models.TextChoices):
        NOUN = 'noun', 'Noun'
        VERB = 'verb', 'Verb'
        ADJECTIVE = 'adjective', 'Adjective'
        ADVERB = 'adverb', 'Adverb'
        OTHER = 'other', 'Other'


    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    ivatan_term = models.CharField(max_length=255)
    syllabication = models.CharField(max_length=255, blank=True)
    phonetic = models.CharField(max_length=255, blank=True)

    part_of_speech = models.CharField(
        max_length=20,
        choices=PartOfSpeech.choices,
        blank=True
    )

    english_meaning = models.TextField()
    example_sentence = models.TextField(blank=True)
    inflected_forms = models.TextField(blank=True)
    etymology = models.TextField(blank=True)

    variant = models.CharField(
        max_length=20,
        choices=Variant.choices,
        default=Variant.GENERAL
    )

    source = models.TextField()
    self_knowledge = models.BooleanField(default=False)

    contributor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='dictionary_entries'
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT
    )

    last_revised_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='revised_dictionary_entries'
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.ivatan_term


class AudioPronunciation(models.Model):
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        PENDING = 'pending', 'Pending'
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'
        ARCHIVED = 'archived', 'Archived'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    dictionary_entry = models.ForeignKey(
        DictionaryEntry,
        on_delete=models.CASCADE,
        related_name='audio_pronunciations'
    )

    audio_file = models.FileField(upload_to='audio_pronunciations/')

    contributor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='audio_contributions'
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT
    )

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Audio for {self.dictionary_entry.ivatan_term}"
