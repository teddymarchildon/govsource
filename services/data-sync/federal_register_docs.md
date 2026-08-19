# 📘 Federal Register API Guide

The Federal Register API allows you to access U.S. government documents and metadata, including agencies and their related rules, notices, and more. This guide focuses on:

1. [Agencies API](#agencies-api)
2. [Documents API](#documents-api)

> Base URL: `https://www.federalregister.gov/api/v1/`
> All responses are in JSON format. No API key is required.

---

## 🏢 Agencies API

The Agencies API helps you retrieve information about all federal agencies that publish documents in the Federal Register.

### 📥 Get All Agencies

**Endpoint:**

```
GET /agencies.json
```

**Full URL:**

```
https://www.federalregister.gov/api/v1/agencies.json
```

**Response Example:**

```json
[
  {
    "id": 540,
    "name": "Environmental Protection Agency",
    "slug": "environmental-protection-agency",
    "url": "https://www.federalregister.gov/agencies/environmental-protection-agency",
    "parent_id": null,
    "short_name": "EPA"
  },
  ...
]
```

---

### 🔍 Get a Single Agency by ID or Slug

**Endpoint:**

```
GET /agencies/{id_or_slug}.json
```

**Examples:**

```http
GET https://www.federalregister.gov/api/v1/agencies/540.json
GET https://www.federalregister.gov/api/v1/agencies/environmental-protection-agency.json
```

**Response Example:**

```json
{
  "id": 540,
  "name": "Environmental Protection Agency",
  "description": "The EPA protects human health and the environment.",
  "slug": "environmental-protection-agency",
  "url": "https://www.federalregister.gov/agencies/environmental-protection-agency",
  "parent_id": null,
  "short_name": "EPA"
}
```

---

## 📄 Documents API

The Documents API allows you to search and retrieve notices, rules, presidential documents, and proposed rules.

### 📥 Get All Documents

**Endpoint:**

```
GET /documents.json
```

**Example:**

```http
GET https://www.federalregister.gov/api/v1/documents.json?per_page=5
```

**Common Query Parameters:**

| Parameter | Description |
|----------|-------------|
| `per_page` | Number of results per page (default: 20, max: 1000) |
| `order` | `asc` or `desc` |
| `conditions[term]` | Full-text search |
| `conditions[type]` | Document type (`notice`, `rule`, `proposed_rule`, `presidential_document`) |
| `conditions[publication_date][gte]` | Published after or on this date |
| `conditions[publication_date][lte]` | Published before or on this date |
| `conditions[agency_ids][]` | Filter by one or more agency IDs |

**Example: Get all EPA rules published in March 2025**

```http
GET https://www.federalregister.gov/api/v1/documents.json?
  conditions[type]=rule&
  conditions[agency_ids][]=540&
  conditions[publication_date][gte]=2025-03-01&
  conditions[publication_date][lte]=2025-03-31
```

---

### 🔍 Get a Single Document

**Endpoint:**

```
GET /documents/{document_number}.json
```

**Example:**

```http
GET https://www.federalregister.gov/api/v1/documents/2025-06842.json
```

**Response Example:**

```json
{
    "abstract": "The U.S. Department of Commerce (Commerce) determines that countervailable subsidies are being provided to producers and exporters of 2,4-dichlorophenoxyacetic acid (2,4-D) from the People's Republic of China (China). The period of investigation (POI) is January 1, 2023, through December 31, 2023.",
    "action": null,
    "agencies": [
        {
            "raw_name": "DEPARTMENT OF COMMERCE",
            "name": "Commerce Department",
            "id": 54,
            "url": "https://www.federalregister.gov/agencies/commerce-department",
            "json_url": "https://www.federalregister.gov/api/v1/agencies/54",
            "parent_id": null,
            "slug": "commerce-department"
        },
        {
            "raw_name": "International Trade Administration",
            "name": "International Trade Administration",
            "id": 261,
            "url": "https://www.federalregister.gov/agencies/international-trade-administration",
            "json_url": "https://www.federalregister.gov/api/v1/agencies/261",
            "parent_id": 54,
            "slug": "international-trade-administration"
        }
    ],
    "body_html_url": "https://www.federalregister.gov/documents/full_text/html/2025/04/07/2025-05887.html",
    "cfr_references": [],
    "citation": "90 FR 14957",
    "comment_url": null,
    "comments_close_on": null,
    "correction_of": null,
    "corrections": [],
    "dates": "Applicable April 7, 2025.",
    "disposition_notes": null,
    "docket_ids": [
        "C-570-161"
    ],
    "dockets": [],
    "document_number": "2025-05887",
    "effective_on": null,
    "end_page": 14959,
    "executive_order_notes": null,
    "executive_order_number": null,
    "explanation": null,
    "full_text_xml_url": "https://www.federalregister.gov/documents/full_text/xml/2025/04/07/2025-05887.xml",
    "html_url": "https://www.federalregister.gov/documents/2025/04/07/2025-05887/24-dichlorophenoxyacetic-acid-from-the-peoples-republic-of-china-final-affirmative-countervailing",
    "images": {},
    "images_metadata": {},
    "json_url": "https://www.federalregister.gov/api/v1/documents/2025-05887?publication_date=2025-04-07",
    "mods_url": "https://www.govinfo.gov/metadata/granule/FR-2025-04-07/2025-05887/mods.xml",
    "not_received_for_publication": null,
    "page_length": 3,
    "page_views": {
        "count": 15,
        "last_updated": "2025-04-06 20:15:04 -0400"
    },
    "pdf_url": "https://www.govinfo.gov/content/pkg/FR-2025-04-07/pdf/2025-05887.pdf",
    "presidential_document_number": null,
    "proclamation_number": null,
    "public_inspection_pdf_url": "https://public-inspection.federalregister.gov/2025-05887.pdf?1743770708",
    "publication_date": "2025-04-07",
    "raw_text_url": "https://www.federalregister.gov/documents/full_text/text/2025/04/07/2025-05887.txt",
    "regulation_id_number_info": {},
    "regulation_id_numbers": [],
    "regulations_dot_gov_info": {
        "checked_regulationsdotgov_at": "2025-04-05T08:03:42Z"
    },
    "regulations_dot_gov_url": null,
    "significant": null,
    "signing_date": null,
    "start_page": 14957,
    "subtype": null,
    "title": "2,4-Dichlorophenoxyacetic Acid From the People's Republic of China: Final Affirmative Countervailing Duty Determination",
    "toc_doc": "2,4-Dichlorophenoxyacetic Acid from the People's Republic of China",
    "toc_subject": "Antidumping or Countervailing Duty Investigations, Orders, or Reviews",
    "topics": [],
    "type": "Notice",
    "volume": 90
}
```

---

## 🛠 Sample Workflow

1. **List all agencies:** Use `/agencies.json`
2. **Find agency ID or slug**
3. **Filter documents by agency:** Use `/documents.json?conditions[agency_ids][]=YOUR_AGENCY_ID`
4. **Inspect specific documents using their `document_number`**

---

## 📚 Official Documentation

For more advanced filtering and endpoints:
🔗 [https://www.federalregister.gov/developers/documentation](https://www.federalregister.gov/developers/documentation)


### Filtering

https://www.federalregister.gov/api/v1//documents.<string>?fields[]=<string>&fields[]=<string>&per_page=20&page=<integer>&order=<string>&order=<string>&conditions[term]=<string>&conditions[publication_date][is]=<date>&conditions[publication_date][year]=<string>&conditions[publication_date][gte]=<date>&conditions[publication_date][lte]=<date>&conditions[effective_date][is]=<date>&conditions[effective_date][year]=<date>&conditions[effective_date][gte]=<date>&conditions[effective_date][lte]=<date>&conditions[agencies][]=<string>&conditions[agencies][]=<string>&conditions[type][]=<string>&conditions[type][]=<string>&conditions[presidential_document_type][]=<string>&conditions[presidential_document_type][]=<string>&conditions[president][]=<string>&conditions[president][]=<string>&conditions[docket_id]=<string>&conditions[regulation_id_number]=<string>&conditions[sections][]=<string>&conditions[sections][]=<string>&conditions[topics][]=<string>&conditions[topics][]=<string>&conditions[significant]=<string>&conditions[cfr][title]=<integer>&conditions[cfr][part]=<integer>&conditions[near][location]=<string>&conditions[near][within]=<integer>
