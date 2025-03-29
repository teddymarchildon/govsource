# Members API
GET /member

Example Request

https://api.congress.gov/v3/member?api_key=[INSERT_KEY]

Example Response

{
    "members": [
    {
        "bioguideId": "L000174",
        "depiction": {
            "attribution": "<a href="\&quot;http://www.senate.gov/artandhistory/history/common/generic/Photo_Collection_of_the_Senate_Historical_Office.htm\&quot;">Courtesy U.S. Senate Historical Office</a>",
            "imageUrl": "https://www.congress.gov/img/member/l000174_200.jpg"
        },
        "district": null,
        "name": "Leahy, Patrick J.",
        "partyName": "Democratic",
        "state": "Vermont",
        "terms": {
            "item": [
                {
                    "chamber": Senate,
                    "endYear": null,
                    "startYear": 1975
                }
            ]
        },
        "updateDate": "2022-11-07T13:42:19Z",
        "url": "https://api.congress.gov/v3/member/L000174?format=json"
    },
    {
        "bioguideId": "K000377",
        "depiction": {
            "attribution": "<a href="\&quot;http://www.senate.gov/artandhistory/history/common/generic/Photo_Collection_of_the_Senate_Historical_Office.htm\&quot;">Courtesy U.S. Senate Historical Office</a>",
            "imageUrl": "https://www.congress.gov/img/member/k000377_200.jpg"
        },
        "district": null,
        "name": "Kelly, Mark",
        "partyName": "Democratic",
        "state": "Arizona",
        "terms": {
            "item": [
                {
                    "chamber": Senate,
                    "end": null,
                    "start": 2020
                }
            ]
        },
        "updateDate": "2023-04-01T12:42:17Z",
        "url": "https://api.congress.gov/v3/member/K000377?format=json"
    },
  ]
}


GET /member/:bioguideId

Example Request

https://api.congress.gov/v3/member/L000174?api_key=[INSERT_KEY]

Example Response

{
    "member": {
        "bioguideId": "L000174",
        "birthYear": "1940",
        "cosponsoredLegislation": {
            "count": 7520,
            "URL": "url": "https://api.congress.gov/v3/member/L000174/cosponsored-legislation"
        },
        "depiction": {
            "attribution": "<a href="\&quot;http://www.senate.gov/artandhistory/history/common/generic/Photo_Collection_of_the_Senate_Historical_Office.htm\&quot;">Courtesy U.S. Senate Historical Office</a>",
            "imageUrl": "https://www.congress.gov/img/member/l000174_200.jpg"
        },
        "directOrderName": "Patrick J. Leahy",
        "firstName": "Patrick",
        "honorificName": "Mr.",
        "invertedOrderName": "Leahy, Patrick J.",
        "lastName": "Leahy",
        "leadership": [
            {
                "congress": 113,
                "type": "President Pro Tempore"
            },
            {
                "congress": 112,
                "type": "President Pro Tempore"
            },
            {
                "congress": 117,
                "type": "President Pro Tempore"
            }
        ],
        "partyHistory": [
            {
                "partyAbbreviation": "D",
                "partyName": "Democrat",
                "startYear": 1975
            }
        ],
        "sponsoredLegislation": {
            "count": 1768,
            "url": "https://api.congress.gov/v3/member/L000174/sponsored-legislation"
        },
        "state": "Vermont",
        "terms": [
            {
                "chamber": "Senate",
                "congress": 116,
                "endYear": 2021,
                "memberType": "Senator",
                "startYear": 2019,
                "stateCode": "VT",
                "stateName": "Vermont"
            },
            {
                "chamber": "Senate",
                "congress": 117,
                "endYear": 2023,
                "memberType": "Senator",
                "startYear": 2021,
                "stateCode": "VT",
                "stateName": "Vermont"
            }
            ...
        ],
        "updateDate": "2022-11-07T13:42:19Z"
    },
    "request": {
        "bioguideId": "l000174",
        "contentType": "application/json",
        "format": "json"
     }
}


GET /member/:bioguideId/sponsored-legislation

Example Request

https://api.congress.gov/v3/member/L000174/sponsored-legislation?api_key=[INSERT_KEY]

Example Response

{
     "sponsoredLegislation": [
        {
            "congress": 117,
            "introducedDate": "2022-06-16",
            "latestAction": {
                "actionDate": "2022-06-16",
                "text": "Read twice and referred to the Committee on the Judiciary."
            },
            "number": "4417",
            "policyArea": {
                "name": "Commerce"
            },
            "title": "Patent Trial and Appeal Board Reform Act of 2022",
            "type": "S",
            "url": "https://api.congress.gov/v3/bill/117/s/4417?format=json"
        },
        {
            "congress": 117,
            "introducedDate": "2022-06-09",
            "latestAction": {
                "actionDate": "2022-06-09",
                "text": "Read twice and referred to the Committee on the Judiciary."
            },
            "number": "4373",
            "policyArea": {
                "name": "Crime and Law Enforcement"
            },
            "title": "NDO Fairness Act",
            "type": "S",
            "url": "https://api.congress.gov/v3/bill/117/s/4373?format=json"
        },
    ]
}

GET /member/:bioguideId/cosponsored-legislation

Example Request

https://api.congress.gov/v3/member/L000174/cosponsored-legislation?api_key=[INSERT_KEY]

Example Response

{
     "cosponsoredLegislation": [
        {
            "congress": 117,
            "introducedDate": "2021-05-11",
            "latestAction": {
                "actionDate": "2021-04-22",
                "text": "Read twice and referred to the Committee on Finance."
            },
            "number": "1315",
            "policyArea": {
                "name": "Health"
            },
            "title": "Lymphedema Treatment Act",
            "type": "S",
            "url": "https://api.congress.gov/v3/bill/117/s/1315?format=json"
        },
        {
            "congress": 117,
            "introducedDate": "2021-02-22",
            "latestAction": {
                "actionDate": "2021-03-17",
                "text": "Referred to the Committee on Armed Services."
            },
            "number": "344",
            "policyArea": {
                "name": "Armed Forces and National Security"
            },
            "title": "Major Richard Star Act",
            "type": "S",
            "url": "https://api.congress.gov/v3/bill/117/s/344?format=json"
        },
    ]
}
