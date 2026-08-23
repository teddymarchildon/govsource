import json

import pytest

import classify_topics


TOPICS = [
    {
        "slug": "health",
        "name": "Health",
        "description": "Federal health policy.",
    },
    {
        "slug": "taxes",
        "name": "Taxes",
        "description": "Federal tax policy.",
    },
]


def completed_response():
    return {
        "id": "resp_test",
        "status": "completed",
        "usage": {"input_tokens": 100, "output_tokens": 20, "total_tokens": 120},
        "output": [
            {
                "type": "message",
                "content": [
                    {
                        "type": "output_text",
                        "text": json.dumps(
                            {
                                "primary_topic": "health",
                                "topics": [
                                    {
                                        "slug": "health",
                                        "confidence": 0.94,
                                        "rationale": "The rule governs health coverage.",
                                    }
                                ],
                            }
                        ),
                    }
                ],
            }
        ],
    }


def test_response_payload_uses_strict_canonical_topic_schema():
    payload = classify_topics.response_payload(
        model="gpt-5-nano",
        system_prompt="Classify records",
        record={"title": "Health coverage rule"},
        topic_slugs=["health", "taxes"],
    )

    assert payload["model"] == "gpt-5-nano"
    assert payload["reasoning"] == {"effort": "minimal"}
    assert payload["store"] is False
    output_format = payload["text"]["format"]
    assert output_format["strict"] is True
    assert output_format["schema"]["properties"]["primary_topic"]["enum"] == [
        "health",
        "taxes",
    ]
    assert output_format["schema"]["properties"]["topics"]["items"]["properties"][
        "slug"
    ]["enum"] == ["health", "taxes"]


def test_validate_classification_marks_exactly_one_primary():
    assignments = classify_topics.validate_classification(
        {
            "primary_topic": "health",
            "topics": [
                {
                    "slug": "health",
                    "confidence": 0.9349,
                    "rationale": "Primary",
                },
                {
                    "slug": "taxes",
                    "confidence": 0.71,
                    "rationale": "Secondary",
                },
            ],
        },
        ["health", "taxes"],
    )

    assert assignments == [
        {
            "slug": "health",
            "confidence": 0.935,
            "rationale": "Primary",
            "is_primary": True,
        },
        {
            "slug": "taxes",
            "confidence": 0.71,
            "rationale": "Secondary",
            "is_primary": False,
        },
    ]


@pytest.mark.parametrize(
    "value",
    [
        {
            "primary_topic": "health",
            "topics": [{"slug": "taxes", "confidence": 0.8, "rationale": "Tax"}],
        },
        {
            "primary_topic": "health",
            "topics": [{"slug": "health", "confidence": 1.2, "rationale": "Health"}],
        },
        {
            "primary_topic": "health",
            "topics": [
                {"slug": "health", "confidence": 0.8, "rationale": "Health"},
                {"slug": "health", "confidence": 0.7, "rationale": "Duplicate"},
            ],
        },
    ],
)
def test_validate_classification_rejects_invalid_results(value):
    with pytest.raises(classify_topics.ClassificationError):
        classify_topics.validate_classification(value, ["health", "taxes"])


def test_openai_client_parses_structured_response_without_sdk_dependency():
    class Response:
        ok = True
        status_code = 200
        headers = {}

        @staticmethod
        def json():
            return completed_response()

    class Session:
        def post(self, url, **kwargs):
            assert url == classify_topics.OPENAI_RESPONSES_URL
            assert kwargs["headers"]["Authorization"] == "Bearer secret"
            assert kwargs["json"]["text"]["format"]["type"] == "json_schema"
            return Response()

    result = classify_topics.OpenAIResponsesClient(
        "secret", "gpt-5-nano", session=Session()
    ).classify(
        system_prompt="Classify",
        record={"title": "Health coverage rule"},
        topic_slugs=["health", "taxes"],
    )

    assert result.response_id == "resp_test"
    assert result.assignments[0]["slug"] == "health"
    assert result.assignments[0]["is_primary"] is True
    assert result.usage["total_tokens"] == 120


def test_agency_source_excerpt_combines_abstract_and_stored_html():
    class Bucket:
        def download(self, path):
            assert path == "html/example.html"
            return b"<h1>Rule body</h1><p>Coverage requirements.</p>"

    class Storage:
        def from_(self, bucket):
            assert bucket == "agency-docs"
            return Bucket()

    class Supabase:
        storage = Storage()

    candidate = classify_topics.Candidate(
        record_type="agency_document",
        record_id=10,
        source_updated_at="2026-08-23T12:00:00+00:00",
        record_data={
            "abstract": "Agency abstract.",
            "html_file_path": "html/example.html",
        },
    )

    excerpt = classify_topics.source_excerpt(
        Supabase(), candidate, max_source_chars=200
    )
    assert "Agency abstract." in excerpt
    assert "Rule body" in excerpt
    assert "Coverage requirements." in excerpt


def test_fetch_candidates_calls_bounded_rpc():
    class Query:
        data = [
            {
                "record_type": "cluster",
                "record_id": 42,
                "source_updated_at": "2026-08-23T12:00:00+00:00",
                "record_data": {"case_name": "Example v. United States"},
            }
        ]

        def execute(self):
            return self

    class Supabase:
        def rpc(self, name, params):
            assert name == "get_topic_classification_candidates"
            assert params == {
                "p_limit": 100,
                "p_lookback_days": 90,
                "p_record_type": "all",
            }
            return Query()

    candidates = classify_topics.fetch_candidates(
        Supabase(), limit=100, lookback_days=90, record_type="all"
    )
    assert candidates[0].record_type == "cluster"
    assert candidates[0].record_id == 42


def test_persist_classification_uses_atomic_rpc():
    captured = {}

    class Query:
        data = 1

        def execute(self):
            return self

    class Supabase:
        def rpc(self, name, params):
            captured["name"] = name
            captured["params"] = params
            return Query()

    candidate = classify_topics.Candidate(
        record_type="cluster",
        record_id=42,
        source_updated_at="2026-08-23T12:00:00+00:00",
        record_data={},
    )
    classification = classify_topics.Classification(
        assignments=[
            {
                "slug": "health",
                "confidence": 0.9,
                "rationale": "Health dispute",
                "is_primary": True,
            }
        ],
        response_id="resp_test",
        usage={"total_tokens": 120},
    )

    assert (
        classify_topics.persist_classification(
            Supabase(),
            candidate,
            classification,
            model="gpt-5-nano",
            fingerprint="abc123",
        )
        == 1
    )
    assert captured["name"] == "replace_ai_topic_assignments"
    assert captured["params"]["p_metadata"]["content_sha256"] == "abc123"
    assert captured["params"]["p_assignments"][0]["is_primary"] is True
