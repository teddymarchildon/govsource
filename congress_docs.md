GET /bill/:congress/:billType/:billNumber

Example Request

https://api.congress.gov/v3/bill/117/hr/3076?api_key=[INSERT_KEY]

Example Response

{
    "bill": {
        "actions": {
            "count": 74,
            "url": "https://api.congress.gov/v3/bill/117/hr/3076/actions?format=json"
        },
        "amendments": {
            "count": 48,
            "url": "https://api.congress.gov/v3/bill/117/hr/3076/amendments?format=json"
        },
        "cboCostEstimates": [
            {
                "description": "As ordered reported by the House Committee on Oversight and Reform on May 13, 2021\n",
                "pubDate": "2021-07-14T17:27:00Z",
                "title": "H.R. 3076, Postal Service Reform Act of 2021",
                "url": "https://www.cbo.gov/publication/57356"
            },
            {
                "description": "As Posted on February 3, 2022,\nand as Amended by Amendment #1, the Manager's Amendment, as Posted on February 4, 2022\n",
                "pubDate": "2022-02-04T18:03:00Z",
                "title": "Estimated Budgetary Effects of Rules Committee Print 117-32 for H.R. 3076, the Postal Service Reform Act of 2022",
                "url": "https://www.cbo.gov/publication/57821"
            }
        ],
        "committeeReports": [
            {
                "citation": "H. Rept. 117-89,Part 1",
                "url": "https://api.congress.gov/v3/committee-report/117/HRPT/89?format=json"
            },
            {
                "citation": "H. Rept. 117-89,Part 2",
                "url": "https://api.congress.gov/v3/committee-report/117/HRPT/89?format=json"
            }
        ],
        "committees": {
            "count": 3,
            "url": "https://api.congress.gov/v3/bill/117/hr/3076/committees?format=json"
        },
        "congress": 117,
        "constitutionalAuthorityStatementText": "<pre>\n[Congressional Record Volume 167, Number 81 (Tuesday, May 11, 2021)]\n[House]\nFrom the Congressional Record Online through the Government Publishing Office [<a href="\&quot;https://www.gpo.gov\&quot;">www.gpo.gov</a>]\nBy Mrs. CAROLYN B. MALONEY of New York:\nH.R. 3076.\nCongress has the power to enact this legislation pursuant\nto the following:\nArticle I, Section I, Clause 18 (Necessary and Proper\nClause)\n[Page H2195]\n</pre>",
        "cosponsors": {
            "count": 102,
            "countIncludingWithdrawnCosponsors": 102,
            "url": "https://api.congress.gov/v3/bill/117/hr/3076/cosponsors?format=json"
        },
        "introducedDate": "2021-05-11",
        "latestAction": {
            "actionDate": "2022-04-06",
            "text": "Became Public Law No: 117-108."
        },
        "laws": [
            {
                "number": "117-108",
                "type": "Public Law"
            }
        ],
        "number": "3076",
        "originChamber": "House",
        "policyArea": {
            "name": "Government Operations and Politics"
        },
        "relatedBills": {
            "count": 4,
            "url": "https://api.congress.gov/v3/bill/117/hr/3076/relatedbills?format=json"
        },
        "sponsors": [
            {
                "bioguideId": "M000087",
                "district": 12,
                "firstName": "CAROLYN",
                "fullName": "Rep. Maloney, Carolyn B. [D-NY-12]",
                "isByRequest": "N",
                "lastName": "MALONEY",
                "middleName": "B.",
                "party": "D",
                "state": "NY",
                "url": "https://api.congress.gov/v3/member/M000087?format=json"
            }
        ],
        "subjects": {
            "count": 17,
            "url": "https://api.congress.gov/v3/bill/117/hr/3076/subjects?format=json"
        },
        "summaries": {
            "count": 5,
            "url": "https://api.congress.gov/v3/bill/117/hr/3076/summaries?format=json"
        },
        "textVersions": {
            "count": 8,
            "url": "https://api.congress.gov/v3/bill/117/hr/3076/text?format=json"
        },
        "title": "Postal Service Reform Act of 2022",
        "titles": {
            "count": 14,
            "url": "https://api.congress.gov/v3/bill/117/hr/3076/titles?format=json"
        },
        "type": "HR",
        "updateDate": "2022-09-29T03:27:05Z",
        "updateDateIncludingText": "2022-09-29T03:27:05Z"
    },
}



GET /bill/:congress/:billType/:billNumber/summaries

Example Request

https://api.congress.gov/v3/bill/117/hr/3076/summaries?api_key=[INSERT_KEY]

Example Response

{
  "summaries": [
        {
            "actionDate": "2022-03-08",
            "actionDesc": "Passed Senate",
            "text": " <p><strong>Postal Service Reform Act of 202</strong><strong>2</strong></p> <p>This bill addresses the finances and operations of the U.S. Postal Service (USPS).</p> <p>The bill requires the Office of Personnel Management (OPM) to establish the Postal Service Health Benefits Program within the Federal Employees Health Benefits Program under which OPM may contract with carriers to offer health benefits plans for USPS employees and retirees.</p> <p>The bill provides for coordinated enrollment of retirees under this program and Medicare.</p> <p>The bill repeals the requirement that the USPS annually prepay future retirement health benefits.</p> <p>Additionally, the USPS may establish a program to enter into agreements with an agency of any state government, local government, or tribal government, and with other government agencies, to provide certain nonpostal products and services that reasonably contribute to the costs of the USPS and meet other specified criteria.</p> <p>The USPS must develop and maintain a publicly available dashboard to track service performance and must report regularly on its operations and financial condition.</p> <p>The Postal Regulatory Commission must annually submit to the USPS a budget of its expenses. It must also conduct a study to identify the causes and effects of postal inefficiencies relating to flats (e.g., large envelopes).</p> <p>The USPS Office of Inspector General shall perform oversight of the Postal Regulatory Commission. </p>",
            "updateDate": "2022-03-14T18:17:02Z",
            "versionCode": "55"
        },
        {
            "actionDate": "2022-04-06",
            "actionDesc": "Public Law",
            "text": " <p><strong>Postal Service Reform Act of 202</strong><strong>2</strong></p> <p>This bill addresses the finances and operations of the U.S. Postal Service (USPS).</p> <p>The bill requires the Office of Personnel Management (OPM) to establish the Postal Service Health Benefits Program within the Federal Employees Health Benefits Program under which OPM may contract with carriers to offer health benefits plans for USPS employees and retirees.</p> <p>The bill provides for coordinated enrollment of retirees under this program and Medicare.</p> <p>The bill repeals the requirement that the USPS annually prepay future retirement health benefits.</p> <p>Additionally, the USPS may establish a program to enter into agreements with an agency of any state government, local government, or tribal government, and with other government agencies, to provide certain nonpostal products and services that reasonably contribute to the costs of the USPS and meet other specified criteria.</p> <p>The USPS must develop and maintain a publicly available dashboard to track service performance and must report regularly on its operations and financial condition.</p> <p>The Postal Regulatory Commission must annually submit to the USPS a budget of its expenses. It must also conduct a study to identify the causes and effects of postal inefficiencies relating to flats (e.g., large envelopes).</p> <p>The USPS Office of Inspector General shall perform oversight of the Postal Regulatory Commission. </p>",
            "updateDate": "2022-04-11T14:35:39Z",
            "versionCode": "49"
        }
    ]
}


GET /bill/:congress/:billType/:billNumber/text

Example Request

https://api.congress.gov/v3/bill/117/hr/3076/text?api_key=[INSERT_KEY]

Example Response

 {
    "textVersions": [
        {
            "date": null,
            "formats": [
                {
                    "type": "Formatted Text",
                    "url": "https://www.congress.gov/117/bills/hr3076/BILLS-117hr3076enr.htm"
                },
                {
                    "type": "PDF",
                    "url": "https://www.congress.gov/117/bills/hr3076/BILLS-117hr3076enr.pdf"
                },
                {
                    "type": "Formatted XML",
                    "url": "https://www.congress.gov/117/bills/hr3076/BILLS-117hr3076enr.xml"
                }
            ],
            "type": "Enrolled Bill"
        },
        {
            "date": "2022-02-15T05:00:00Z",
            "formats": [
                {
                    "type": "Formatted Text",
                    "url": "https://www.congress.gov/117/bills/hr3076/BILLS-117hr3076pcs2.htm"
                },
                {
                    "type": "PDF",
                    "url": "https://www.congress.gov/117/bills/hr3076/BILLS-117hr3076pcs2.pdf"
                },
                {
                    "type": "Formatted XML",
                    "url": "https://www.congress.gov/117/bills/hr3076/BILLS-117hr3076pcs2.xml"
                }
            ],
            "type": "Placed on Calendar Senate"
        },
    ]
 }
