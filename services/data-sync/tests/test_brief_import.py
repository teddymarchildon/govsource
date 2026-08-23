import import_briefs_supabase
import pytest


def valid_brief():
    return {
        "title": "A valid Brief",
        "slug": "a-valid-brief",
        "dek": "A concise description.",
        "primary_record": {"type": "bill", "external_id": "hr1-119"},
        "points": [
            {"id": f"point_{index}", "text": f"Point {index}", "source_refs": ["source_1"]}
            for index in range(1, 4)
        ],
        "sources": [
            {"id": "source_1", "label": "Official source", "url": "https://example.gov/source"}
        ],
    }


def test_valid_manifest_passes():
    import_briefs_supabase.validate_manifest([valid_brief()])


def test_manifest_rejects_unknown_source_ref():
    brief = valid_brief()
    brief["points"][0]["source_refs"] = ["missing"]
    with pytest.raises(ValueError, match="source_refs"):
        import_briefs_supabase.validate_manifest([brief])


def test_manifest_rejects_duplicate_slug():
    brief = valid_brief()
    with pytest.raises(ValueError, match="Duplicate slug"):
        import_briefs_supabase.validate_manifest([brief, dict(brief)])


def test_manifest_rejects_publication_ready_but_undersourced_points():
    brief = valid_brief()
    brief["points"] = brief["points"][:2]
    with pytest.raises(ValueError, match="3 to 5 points"):
        import_briefs_supabase.validate_manifest([brief])
