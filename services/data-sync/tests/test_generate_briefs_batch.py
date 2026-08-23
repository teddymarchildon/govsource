import generate_briefs_batch
import pytest


def records():
    return [{"record_key": "bill:hr1-119"}]


def test_generated_draft_requires_complete_dek():
    drafts = [{"record_key": "bill:hr1-119", "dek": "This sentence was cut off and"}]

    with pytest.raises(ValueError, match="incomplete or overlong deks"):
        generate_briefs_batch.validate_generated_drafts(drafts, records())


def test_generated_draft_accepts_terminal_punctuation_and_closing_quote():
    drafts = [{"record_key": "bill:hr1-119", "dek": 'The court called the rule "valid."'}]

    generate_briefs_batch.validate_generated_drafts(drafts, records())


def test_generated_draft_rejects_dek_over_generation_limit():
    drafts = [
        {
            "record_key": "bill:hr1-119",
            "dek": "A" * generate_briefs_batch.MAX_GENERATED_DEK_LENGTH + ".",
        }
    ]

    with pytest.raises(ValueError, match="incomplete or overlong deks"):
        generate_briefs_batch.validate_generated_drafts(drafts, records())
