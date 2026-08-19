### Cluster List API

URL: https://www.courtlistener.com/api/rest/v4/clusters/?docket__court=scotus

```
{
    "count": "https://www.courtlistener.com/api/rest/v4/clusters/?count=on&docket__court=scotus",
    "next": "https://www.courtlistener.com/api/rest/v4/clusters/?cursor=cD0xMDMzOTk1OA%3D%3D&docket__court=scotus",
    "previous": null,
    "results": [
        {
            "resource_uri": "https://www.courtlistener.com/api/rest/v4/clusters/10376225/",
            "id": 10376225,
            "absolute_url": "/opinion/10376225/noem-v-abrego-garcia/",
            "panel": [],
            "non_participating_judges": [],
            "docket_id": 69874414,
            "docket": "https://www.courtlistener.com/api/rest/v4/dockets/69874414/",
            "sub_opinions": [
                "https://www.courtlistener.com/api/rest/v4/opinions/10842813/"
            ],
            "citations": [],
            "date_created": "2025-04-10T16:02:25.658431-07:00",
            "date_modified": "2025-04-10T16:03:12.743547-07:00",
            "judges": "Sonia Sotomayor",
            "date_filed": "2025-04-10",
            "date_filed_is_approximate": false,
            "slug": "noem-v-abrego-garcia",
            "case_name_short": "Noem",
            "case_name": "Noem v. Abrego Garcia",
            "case_name_full": "",
            "scdb_id": "",
            "scdb_decision_direction": null,
            "scdb_votes_majority": null,
            "scdb_votes_minority": null,
            "source": "C",
            "procedural_history": "",
            "attorneys": "",
            "nature_of_suit": "",
            "posture": "",
            "syllabus": "",
            "headnotes": "",
            "summary": "",
            "disposition": "",
            "history": "",
            "other_dates": "",
            "cross_reference": "",
            "correction": "",
            "citation_count": 0,
            "precedential_status": "Relating-to",
            "date_blocked": null,
            "blocked": false,
            "filepath_json_harvard": null,
            "filepath_pdf_harvard": null,
            "arguments": "",
            "headmatter": ""
        },
        {
            "resource_uri": "https://www.courtlistener.com/api/rest/v4/clusters/10373795/",
            "id": 10373795,
            "absolute_url": "/opinion/10373795/trump-v-j-g-g/",
            "panel": [],
            "non_participating_judges": [],
            "docket_id": 69856122,
            "docket": "https://www.courtlistener.com/api/rest/v4/dockets/69856122/",
            "sub_opinions": [
                "https://www.courtlistener.com/api/rest/v4/opinions/10840383/"
            ],
            "citations": [],
            "date_created": "2025-04-07T16:01:51.397680-07:00",
            "date_modified": "2025-04-07T16:01:56.190482-07:00",
            "judges": "Per Curiam",
            "date_filed": "2025-04-07",
            "date_filed_is_approximate": false,
            "slug": "trump-v-j-g-g",
            "case_name_short": "Trump",
            "case_name": "Trump v. J. G. G.",
            "case_name_full": "",
            "scdb_id": "",
            "scdb_decision_direction": null,
            "scdb_votes_majority": null,
            "scdb_votes_minority": null,
            "source": "C",
            "procedural_history": "",
            "attorneys": "",
            "nature_of_suit": "",
            "posture": "",
            "syllabus": "",
            "headnotes": "",
            "summary": "",
            "disposition": "",
            "history": "",
            "other_dates": "",
            "cross_reference": "",
            "correction": "",
            "citation_count": 0,
            "precedential_status": "Published",
            "date_blocked": null,
            "blocked": false,
            "filepath_json_harvard": null,
            "filepath_pdf_harvard": null,
            "arguments": "",
            "headmatter": ""
        },
        {
            "resource_uri": "https://www.courtlistener.com/api/rest/v4/clusters/10373019/",
            "id": 10373019,
            "absolute_url": "/opinion/10373019/department-of-education-v-california/",
            "panel": [],
            "non_participating_judges": [],
            "docket_id": 69846237,
            "docket": "https://www.courtlistener.com/api/rest/v4/dockets/69846237/",
            "sub_opinions": [
                "https://www.courtlistener.com/api/rest/v4/opinions/10839607/"
            ],
            "citations": [],
            "date_created": "2025-04-04T14:02:04.473982-07:00",
            "date_modified": "2025-04-04T14:02:05.228257-07:00",
            "judges": "Per Curiam",
            "date_filed": "2025-04-04",
            "date_filed_is_approximate": false,
            "slug": "department-of-education-v-california",
            "case_name_short": "",
            "case_name": "Department of Education v. California",
            "case_name_full": "",
            "scdb_id": "",
            "scdb_decision_direction": null,
            "scdb_votes_majority": null,
            "scdb_votes_minority": null,
            "source": "C",
            "procedural_history": "",
            "attorneys": "",
            "nature_of_suit": "",
            "posture": "",
            "syllabus": "",
            "headnotes": "",
            "summary": "",
            "disposition": "",
            "history": "",
            "other_dates": "",
            "cross_reference": "",
            "correction": "",
            "citation_count": 0,
            "precedential_status": "Published",
            "date_blocked": null,
            "blocked": false,
            "filepath_json_harvard": null,
            "filepath_pdf_harvard": null,
            "arguments": "",
            "headmatter": ""
        },
    ]
}
```
### Cluster detail

URL: https://www.courtlistener.com/api/rest/v4/clusters/<cluster_id>

Response:

```
{
    "resource_uri": "https://www.courtlistener.com/api/rest/v4/clusters/10376225/",
    "id": 10376225,
    "absolute_url": "/opinion/10376225/noem-v-abrego-garcia/",
    "panel": [],
    "non_participating_judges": [],
    "docket_id": 69874414,
    "docket": "https://www.courtlistener.com/api/rest/v4/dockets/69874414/",
    "sub_opinions": [
        "https://www.courtlistener.com/api/rest/v4/opinions/10842813/"
    ],
    "citations": [],
    "date_created": "2025-04-10T16:02:25.658431-07:00",
    "date_modified": "2025-04-10T16:03:12.743547-07:00",
    "judges": "Sonia Sotomayor",
    "date_filed": "2025-04-10",
    "date_filed_is_approximate": false,
    "slug": "noem-v-abrego-garcia",
    "case_name_short": "Noem",
    "case_name": "Noem v. Abrego Garcia",
    "case_name_full": "",
    "scdb_id": "",
    "scdb_decision_direction": null,
    "scdb_votes_majority": null,
    "scdb_votes_minority": null,
    "source": "C",
    "procedural_history": "",
    "attorneys": "",
    "nature_of_suit": "",
    "posture": "",
    "syllabus": "",
    "headnotes": "",
    "summary": "",
    "disposition": "",
    "history": "",
    "other_dates": "",
    "cross_reference": "",
    "correction": "",
    "citation_count": 0,
    "precedential_status": "Relating-to",
    "date_blocked": null,
    "blocked": false,
    "filepath_json_harvard": null,
    "filepath_pdf_harvard": null,
    "arguments": "",
    "headmatter": ""
}
```



### List supreme court opinions

URL: https://www.courtlistener.com/api/rest/v4/opinions/?cluster__docket__court=scotus
```
{
    "count": "https://www.courtlistener.com/api/rest/v4/opinions/?cluster__docket__court=scotus&count=on",
    "next": "https://www.courtlistener.com/api/rest/v4/opinions/?cluster__docket__court=scotus&cursor=cD0xMDgwNjU0Ng%3D%3D",
    "previous": null,
    "results": [
        {
            "resource_uri": "https://www.courtlistener.com/api/rest/v4/opinions/10842813/",
            "id": 10842813,
            "absolute_url": "/opinion/10376225/noem-v-abrego-garcia/",
            "cluster_id": 10376225,
            "cluster": "https://www.courtlistener.com/api/rest/v4/clusters/10376225/",
            "author_id": 3045,
            "author": "https://www.courtlistener.com/api/rest/v4/people/3045/",
            "joined_by": [],
            "date_created": "2025-04-10T16:02:25.707691-07:00",
            "date_modified": "2025-04-10T16:35:17.454399-07:00",
            "author_str": "",
            "per_curiam": false,
            "joined_by_str": "",
            "type": "010combined",
            "sha1": "137b1915e4124e5a48c759cf4313d15e683797e5",
            "page_count": 4,
            "download_url": "https://www.supremecourt.gov/opinions/24pdf/24a949_lkhn.pdf",
            "local_path": "pdf/2025/04/10/noem_v._abrego_garcia.pdf",
            "plain_text": "                 Cite as: 604 U. S. ____ (2025)           1\n\n\n\n\nSUPREME COURT OF THE UNITED STATES\n                         _________________\n\n                          No. 24A949\n                         _________________\n\n\n   KRISTI NOEM, SECRETARY, DEPARTMENT OF\n     HOMELAND SECURITY, ET AL. v. KILMAR\n        ARMANDO ABREGO GARCIA, ET AL.\n ON APPLICATION TO VACATE INJUNCTION ENTERED BY THE\n   UNITED STATES DISTRICT COURT FOR THE DISTRICT OF\n                      MARYLAND\n                        [April 10, 2025]\n\n  On March 15, 2025, the United States removed Kilmar\nArmando Abrego Garcia from the United States to El Sal-\nvador, where he is currently detained in the Center for Ter-\nrorism Confinement (CECOT). The United States acknowl-\nedges that Abrego Garcia was subject to a withholding\norder forbidding his removal to El Salvador, and that the\nremoval to El Salvador was therefore illegal. The United\nStates represents that the removal to El Salvador was the\nresult of an “administrative error.” The United States al-\nleges, however, that Abrego Garcia has been found to be a\nmember of the gang MS–13, a designated foreign terrorist\norganization, and that his return to the United States\nwould pose a threat to the public. Abrego Garcia responds\nthat he is not a member of MS–13, and that he has lived\nsafely in the United States with his family for a decade and\nhas never been charged with a crime.\n  On Friday, April 4, the United States District Court for\nthe District of Maryland entered an order directing the Gov-\nernment to “facilitate and effectuate the return of [Abrego\nGarcia] to the United States by no later than 11:59 PM on\nMonday, April 7.” On the morning of April 7, the United\nStates filed this application to vacate the District Court’s\norder. THE CHIEF JUSTICE entered an administrative stay\n\f2                NOEM v. ABREGO GARCIA\n\n                  Statement of SOTOMAYOR, J.\n\nand subsequently referred the application to the Court.\n   The application is granted in part and denied in part,\nsubject to the direction of this order. Due to the adminis-\ntrative stay issued by THE CHIEF JUSTICE, the deadline im-\nposed by the District Court has now passed. To that extent,\nthe Government’s emergency application is effectively\ngranted in part and the deadline in the challenged order is\nno longer effective. The rest of the District Court’s order\nremains in effect but requires clarification on remand. The\norder properly requires the Government to “facilitate”\nAbrego Garcia’s release from custody in El Salvador and to\nensure that his case is handled as it would have been had\nhe not been improperly sent to El Salvador. The intended\nscope of the term “effectuate” in the District Court’s order\nis, however, unclear, and may exceed the District Court’s\nauthority. The District Court should clarify its directive,\nwith due regard for the deference owed to the Executive\nBranch in the conduct of foreign affairs. For its part, the\nGovernment should be prepared to share what it can con-\ncerning the steps it has taken and the prospect of further\nsteps. The order heretofore entered by THE CHIEF JUSTICE\nis vacated.\n   Statement of JUSTICE SOTOMAYOR, with whom JUSTICE\nKAGAN and JUSTICE JACKSON join, respecting the Court’s\ndisposition of the application.\n   The United States Government arrested Kilmar Ar-\nmando Abrego Garcia in Maryland and flew him to a “ter-\nrorism confinement center” in El Salvador, where he has\nbeen detained for 26 days and counting. To this day, the\nGovernment has cited no basis in law for Abrego Garcia’s\nwarrantless arrest, his removal to El Salvador, or his con-\nfinement in a Salvadoran prison. Nor could it. The Gov-\nernment remains bound by an Immigration Judge’s 2019\norder expressly prohibiting Abrego Garcia’s removal to El\n\f                 Cite as: 604 U. S. ____ (2025)            3\n\n                  Statement of SOTOMAYOR, J.\n\nSalvador because he faced a “clear probability of future per-\nsecution” there and “demonstrated that [El Salvador’s] au-\nthorities were and would be unable or unwilling to protect\nhim.” App. to Application To Vacate Injunction 13a. The\nGovernment has not challenged the validity of that order.\n   Instead of hastening to correct its egregious error, the\nGovernment dismissed it as an “oversight.” Decl. of R.\nCerna in No. 25–cv–951 (D Md., Mar. 31, 2025), ECF Doc.\n11–3, p. 3. The Government now requests an order from\nthis Court permitting it to leave Abrego Garcia, a husband\nand father without a criminal record, in a Salvadoran\nprison for no reason recognized by the law. The only argu-\nment the Government offers in support of its request, that\nUnited States courts cannot grant relief once a deportee\ncrosses the border, is plainly wrong. See Rumsfeld v. Pa-\ndilla, 542 U. S. 426, 447, n. 16 (2004); cf. Boumediene v.\nBush, 553 U. S. 723, 732 (2008). The Government’s argu-\nment, moreover, implies that it could deport and incarcer-\nate any person, including U. S. citizens, without legal con-\nsequence, so long as it does so before a court can intervene.\nSee Trump v. J. G. G., 604 U. S. ___, ___ (2025)\n(SOTOMAYOR, J., dissenting) (slip op., at 8). That view re-\nfutes itself.\n   Because every factor governing requests for equitable re-\nlief manifestly weighs against the Government, Nken v.\nHolder, 556 U. S. 418, 426 (2009), I would have declined to\nintervene in this litigation and denied the application in\nfull.\n   Nevertheless, I agree with the Court’s order that the\nproper remedy is to provide Abrego Garcia with all the pro-\ncess to which he would have been entitled had he not been\nunlawfully removed to El Salvador. That means the Gov-\nernment must comply with its obligation to provide Abrego\nGarcia with “due process of law,” including notice and an\nopportunity to be heard, in any future proceedings. Reno v.\nFlores, 507 U. S. 292, 306 (1993). It must also comply with\n\f4                 NOEM v. ABREGO GARCIA\n\n                   Statement of SOTOMAYOR, J.\n\nits obligations under the Convention Against Torture. See\nConvention Against Torture and Other Cruel and Inhuman\nor Degrading Treatment or Punishment, Dec. 10, 1984, S.\nTreaty Doc. No. 100–20, 1465 U. N. T. S. 113. Federal law\ngoverning detention and removal of immigrants continues,\nof course, to be binding as well. See 8 U. S. C. §1226(a) (re-\nquiring a warrant before a noncitizen “may be arrested and\ndetained pending a decision” on removal); 8 CFR\n§287.8(c)(2)(ii) (2024) (requiring same); see also 8 CFR\n§241.4(l) (in order to revoke conditional release, the Gov-\nernment must provide adequate notice and “promptly” ar-\nrange an “initial informal interview . . . to afford the alien\nan opportunity to respond to the reasons for the revocation\nstated in the notification”). Moreover, it has been the Gov-\nernment’s own well-established policy to “facilitate [an] al-\nien’s return to the United States if . . . the alien’s presence\nis necessary for continued administrative removal proceed-\nings” in cases where a noncitizen has been removed pending\nimmigration proceedings. See U. S. Immigration and Cus-\ntoms Enforcement, Directive 11061.1, Facilitating the Re-\nturn to the United States of Certain Lawfully Removed Al-\niens, §2 (Feb. 24, 2012).\n   In the proceedings on remand, the District Court should\ncontinue to ensure that the Government lives up to its obli-\ngations to follow the law.\n\f",
            "html": "",
            "html_lawbox": "",
            "html_columbia": "",
            "html_anon_2020": "",
            "xml_harvard": "",
            "html_with_citations": "<pre class=\"inline\">                 Cite as: </pre><span class=\"citation no-link\">604 U. S. ____</span><pre class=\"inline\"> (2025)           1\n\n\n\n\nSUPREME COURT OF THE UNITED STATES\n                         _________________\n\n                          No. 24A949\n                         _________________\n\n\n   KRISTI NOEM, SECRETARY, DEPARTMENT OF\n     HOMELAND SECURITY, ET AL. v. KILMAR\n        ARMANDO ABREGO GARCIA, ET AL.\n ON APPLICATION TO VACATE INJUNCTION ENTERED BY THE\n   UNITED STATES DISTRICT COURT FOR THE DISTRICT OF\n                      MARYLAND\n                        [April 10, 2025]\n\n  On March 15, 2025, the United States removed Kilmar\nArmando Abrego Garcia from the United States to El Sal-\nvador, where he is currently detained in the Center for Ter-\nrorism Confinement (CECOT). The United States acknowl-\nedges that Abrego Garcia was subject to a withholding\norder forbidding his removal to El Salvador, and that the\nremoval to El Salvador was therefore illegal. The United\nStates represents that the removal to El Salvador was the\nresult of an “administrative error.” The United States al-\nleges, however, that Abrego Garcia has been found to be a\nmember of the gang MS–13, a designated foreign terrorist\norganization, and that his return to the United States\nwould pose a threat to the public. Abrego Garcia responds\nthat he is not a member of MS–13, and that he has lived\nsafely in the United States with his family for a decade and\nhas never been charged with a crime.\n  On Friday, April 4, the United States District Court for\nthe District of Maryland entered an order directing the Gov-\nernment to “facilitate and effectuate the return of [Abrego\nGarcia] to the United States by no later than 11:59 PM on\nMonday, April 7.” On the morning of April 7, the United\nStates filed this application to vacate the District Court’s\norder. THE CHIEF JUSTICE entered an administrative stay\n\f2                NOEM v. ABREGO GARCIA\n\n                  Statement of SOTOMAYOR, J.\n\nand subsequently referred the application to the Court.\n   The application is granted in part and denied in part,\nsubject to the direction of this order. Due to the adminis-\ntrative stay issued by THE CHIEF JUSTICE, the deadline im-\nposed by the District Court has now passed. To that extent,\nthe Government’s emergency application is effectively\ngranted in part and the deadline in the challenged order is\nno longer effective. The rest of the District Court’s order\nremains in effect but requires clarification on remand. The\norder properly requires the Government to “facilitate”\nAbrego Garcia’s release from custody in El Salvador and to\nensure that his case is handled as it would have been had\nhe not been improperly sent to El Salvador. The intended\nscope of the term “effectuate” in the District Court’s order\nis, however, unclear, and may exceed the District Court’s\nauthority. The District Court should clarify its directive,\nwith due regard for the deference owed to the Executive\nBranch in the conduct of foreign affairs. For its part, the\nGovernment should be prepared to share what it can con-\ncerning the steps it has taken and the prospect of further\nsteps. The order heretofore entered by THE CHIEF JUSTICE\nis vacated.\n   Statement of JUSTICE SOTOMAYOR, with whom JUSTICE\nKAGAN and JUSTICE JACKSON join, respecting the Court’s\ndisposition of the application.\n   The United States Government arrested Kilmar Ar-\nmando Abrego Garcia in Maryland and flew him to a “ter-\nrorism confinement center” in El Salvador, where he has\nbeen detained for 26 days and counting. To this day, the\nGovernment has cited no basis in law for Abrego Garcia’s\nwarrantless arrest, his removal to El Salvador, or his con-\nfinement in a Salvadoran prison. Nor could it. The Gov-\nernment remains bound by an Immigration Judge’s 2019\norder expressly prohibiting Abrego Garcia’s removal to El\n\f                 Cite as: </pre><span class=\"citation no-link\">604 U. S. ____</span><pre class=\"inline\"> (2025)            3\n\n                  Statement of SOTOMAYOR, J.\n\nSalvador because he faced a “clear probability of future per-\nsecution” there and “demonstrated that [El Salvador’s] au-\nthorities were and would be unable or unwilling to protect\nhim.” App. to Application To Vacate Injunction 13a. The\nGovernment has not challenged the validity of that order.\n   Instead of hastening to correct its egregious error, the\nGovernment dismissed it as an “oversight.” Decl. of R.\nCerna in No. 25–cv–951 (D Md., Mar. 31, 2025), ECF Doc.\n11–3, p. 3. The Government now requests an order from\nthis Court permitting it to leave Abrego Garcia, a husband\nand father without a criminal record, in a Salvadoran\nprison for no reason recognized by the law. The only argu-\nment the Government offers in support of its request, that\nUnited States courts cannot grant relief once a deportee\ncrosses the border, is plainly wrong. See Rumsfeld v. Pa-\ndilla, </pre><span class=\"citation\" data-id=\"136999\"><a href=\"/opinion/136999/rumsfeld-v-padilla/#447\" aria-description=\"Citation for case: Rumsfeld v. Padilla\">542 U. S. 426, 447, n. 16</a></span><pre class=\"inline\"> (2004); cf. Boumediene v.\nBush, </pre><span class=\"citation\" data-id=\"145795\"><a href=\"/opinion/145795/boumediene-v-bush/#732\" aria-description=\"Citation for case: Boumediene v. Bush\">553 U. S. 723, 732</a></span><pre class=\"inline\"> (2008). The Government’s argu-\nment, moreover, implies that it could deport and incarcer-\nate any person, including U. S. citizens, without legal con-\nsequence, so long as it does so before a court can intervene.\nSee Trump v. J. G. G., </pre><span class=\"citation no-link\">604 U. S. ___</span><pre class=\"inline\">, ___ (2025)\n(SOTOMAYOR, J., dissenting) (slip op., at 8). That view re-\nfutes itself.\n   Because every factor governing requests for equitable re-\nlief manifestly weighs against the Government, Nken v.\nHolder, </pre><span class=\"citation\" data-id=\"145884\"><a href=\"/opinion/145884/nken-v-holder/#426\" aria-description=\"Citation for case: Nken v. Holder\">556 U. S. 418, 426</a></span><pre class=\"inline\"> (2009), I would have declined to\nintervene in this litigation and denied the application in\nfull.\n   Nevertheless, I agree with the Court’s order that the\nproper remedy is to provide Abrego Garcia with all the pro-\ncess to which he would have been entitled had he not been\nunlawfully removed to El Salvador. That means the Gov-\nernment must comply with its obligation to provide Abrego\nGarcia with “due process of law,” including notice and an\nopportunity to be heard, in any future proceedings. Reno v.\nFlores, </pre><span class=\"citation\" data-id=\"112833\"><a href=\"/opinion/112833/reno-v-flores/#306\" aria-description=\"Citation for case: Reno v. Flores\">507 U. S. 292, 306</a></span><pre class=\"inline\"> (1993). It must also comply with\n\f4                 NOEM v. ABREGO GARCIA\n\n                   Statement of SOTOMAYOR, J.\n\nits obligations under the Convention Against Torture. See\nConvention Against Torture and Other Cruel and Inhuman\nor Degrading Treatment or Punishment, Dec. 10, 1984, S.\nTreaty Doc. No. 100–20, 1465 U. N. T. S. 113. Federal law\ngoverning detention and removal of immigrants continues,\nof course, to be binding as well. See </pre><span class=\"citation no-link\">8 U. S. C. §1226</span><pre class=\"inline\">(a) (re-\nquiring a warrant before a noncitizen “may be arrested and\ndetained pending a decision” on removal); </pre><span class=\"citation no-link\">8 CFR\n§287.8</span><pre class=\"inline\">(c)(2)(ii) (2024) (requiring same); see also </pre><span class=\"citation no-link\">8 CFR\n§241.4</span><pre class=\"inline\">(l) (in order to revoke conditional release, the Gov-\nernment must provide adequate notice and “promptly” ar-\nrange an “initial informal interview . . . to afford the alien\nan opportunity to respond to the reasons for the revocation\nstated in the notification”). Moreover, it has been the Gov-\nernment’s own well-established policy to “facilitate [an] al-\nien’s return to the United States if . . . the alien’s presence\nis necessary for continued administrative removal proceed-\nings” in cases where a noncitizen has been removed pending\nimmigration proceedings. See U. S. Immigration and Cus-\ntoms Enforcement, Directive 11061.1, Facilitating the Re-\nturn to the United States of Certain Lawfully Removed Al-\niens, §2 (Feb. 24, 2012).\n   In the proceedings on remand, the District Court should\ncontinue to ensure that the Government lives up to its obli-\ngations to follow the law.\n\f</pre>",
            "extracted_by_ocr": false,
            "ordering_key": null,
            "opinions_cited": [
                "https://www.courtlistener.com/api/rest/v4/opinions/136999/",
                "https://www.courtlistener.com/api/rest/v4/opinions/145795/",
                "https://www.courtlistener.com/api/rest/v4/opinions/145884/",
                "https://www.courtlistener.com/api/rest/v4/opinions/112833/"
            ]
        }
```

### Supreme court opinion detail

{
    "resource_uri": "https://www.courtlistener.com/api/rest/v4/opinions/10842813/",
    "id": 10842813,
    "absolute_url": "/opinion/10376225/noem-v-abrego-garcia/",
    "cluster_id": 10376225,
    "cluster": "https://www.courtlistener.com/api/rest/v4/clusters/10376225/",
    "author_id": 3045,
    "author": "https://www.courtlistener.com/api/rest/v4/people/3045/",
    "joined_by": [],
    "date_created": "2025-04-10T16:02:25.707691-07:00",
    "date_modified": "2025-04-10T16:35:17.454399-07:00",
    "author_str": "",
    "per_curiam": false,
    "joined_by_str": "",
    "type": "010combined",
    "sha1": "137b1915e4124e5a48c759cf4313d15e683797e5",
    "page_count": 4,
    "download_url": "https://www.supremecourt.gov/opinions/24pdf/24a949_lkhn.pdf",
    "local_path": "pdf/2025/04/10/noem_v._abrego_garcia.pdf",
    "plain_text": "                 Cite as: 604 U. S. ____ (2025)           1\n\n\n\n\nSUPREME COURT OF THE UNITED STATES\n                         _________________\n\n                          No. 24A949\n                         _________________\n\n\n   KRISTI NOEM, SECRETARY, DEPARTMENT OF\n     HOMELAND SECURITY, ET AL. v. KILMAR\n        ARMANDO ABREGO GARCIA, ET AL.\n ON APPLICATION TO VACATE INJUNCTION ENTERED BY THE\n   UNITED STATES DISTRICT COURT FOR THE DISTRICT OF\n                      MARYLAND\n                        [April 10, 2025]\n\n  On March 15, 2025, the United States removed Kilmar\nArmando Abrego Garcia from the United States to El Sal-\nvador, where he is currently detained in the Center for Ter-\nrorism Confinement (CECOT). The United States acknowl-\nedges that Abrego Garcia was subject to a withholding\norder forbidding his removal to El Salvador, and that the\nremoval to El Salvador was therefore illegal. The United\nStates represents that the removal to El Salvador was the\nresult of an “administrative error.” The United States al-\nleges, however, that Abrego Garcia has been found to be a\nmember of the gang MS–13, a designated foreign terrorist\norganization, and that his return to the United States\nwould pose a threat to the public. Abrego Garcia responds\nthat he is not a member of MS–13, and that he has lived\nsafely in the United States with his family for a decade and\nhas never been charged with a crime.\n  On Friday, April 4, the United States District Court for\nthe District of Maryland entered an order directing the Gov-\nernment to “facilitate and effectuate the return of [Abrego\nGarcia] to the United States by no later than 11:59 PM on\nMonday, April 7.” On the morning of April 7, the United\nStates filed this application to vacate the District Court’s\norder. THE CHIEF JUSTICE entered an administrative stay\n\f2                NOEM v. ABREGO GARCIA\n\n                  Statement of SOTOMAYOR, J.\n\nand subsequently referred the application to the Court.\n   The application is granted in part and denied in part,\nsubject to the direction of this order. Due to the adminis-\ntrative stay issued by THE CHIEF JUSTICE, the deadline im-\nposed by the District Court has now passed. To that extent,\nthe Government’s emergency application is effectively\ngranted in part and the deadline in the challenged order is\nno longer effective. The rest of the District Court’s order\nremains in effect but requires clarification on remand. The\norder properly requires the Government to “facilitate”\nAbrego Garcia’s release from custody in El Salvador and to\nensure that his case is handled as it would have been had\nhe not been improperly sent to El Salvador. The intended\nscope of the term “effectuate” in the District Court’s order\nis, however, unclear, and may exceed the District Court’s\nauthority. The District Court should clarify its directive,\nwith due regard for the deference owed to the Executive\nBranch in the conduct of foreign affairs. For its part, the\nGovernment should be prepared to share what it can con-\ncerning the steps it has taken and the prospect of further\nsteps. The order heretofore entered by THE CHIEF JUSTICE\nis vacated.\n   Statement of JUSTICE SOTOMAYOR, with whom JUSTICE\nKAGAN and JUSTICE JACKSON join, respecting the Court’s\ndisposition of the application.\n   The United States Government arrested Kilmar Ar-\nmando Abrego Garcia in Maryland and flew him to a “ter-\nrorism confinement center” in El Salvador, where he has\nbeen detained for 26 days and counting. To this day, the\nGovernment has cited no basis in law for Abrego Garcia’s\nwarrantless arrest, his removal to El Salvador, or his con-\nfinement in a Salvadoran prison. Nor could it. The Gov-\nernment remains bound by an Immigration Judge’s 2019\norder expressly prohibiting Abrego Garcia’s removal to El\n\f                 Cite as: 604 U. S. ____ (2025)            3\n\n                  Statement of SOTOMAYOR, J.\n\nSalvador because he faced a “clear probability of future per-\nsecution” there and “demonstrated that [El Salvador’s] au-\nthorities were and would be unable or unwilling to protect\nhim.” App. to Application To Vacate Injunction 13a. The\nGovernment has not challenged the validity of that order.\n   Instead of hastening to correct its egregious error, the\nGovernment dismissed it as an “oversight.” Decl. of R.\nCerna in No. 25–cv–951 (D Md., Mar. 31, 2025), ECF Doc.\n11–3, p. 3. The Government now requests an order from\nthis Court permitting it to leave Abrego Garcia, a husband\nand father without a criminal record, in a Salvadoran\nprison for no reason recognized by the law. The only argu-\nment the Government offers in support of its request, that\nUnited States courts cannot grant relief once a deportee\ncrosses the border, is plainly wrong. See Rumsfeld v. Pa-\ndilla, 542 U. S. 426, 447, n. 16 (2004); cf. Boumediene v.\nBush, 553 U. S. 723, 732 (2008). The Government’s argu-\nment, moreover, implies that it could deport and incarcer-\nate any person, including U. S. citizens, without legal con-\nsequence, so long as it does so before a court can intervene.\nSee Trump v. J. G. G., 604 U. S. ___, ___ (2025)\n(SOTOMAYOR, J., dissenting) (slip op., at 8). That view re-\nfutes itself.\n   Because every factor governing requests for equitable re-\nlief manifestly weighs against the Government, Nken v.\nHolder, 556 U. S. 418, 426 (2009), I would have declined to\nintervene in this litigation and denied the application in\nfull.\n   Nevertheless, I agree with the Court’s order that the\nproper remedy is to provide Abrego Garcia with all the pro-\ncess to which he would have been entitled had he not been\nunlawfully removed to El Salvador. That means the Gov-\nernment must comply with its obligation to provide Abrego\nGarcia with “due process of law,” including notice and an\nopportunity to be heard, in any future proceedings. Reno v.\nFlores, 507 U. S. 292, 306 (1993). It must also comply with\n\f4                 NOEM v. ABREGO GARCIA\n\n                   Statement of SOTOMAYOR, J.\n\nits obligations under the Convention Against Torture. See\nConvention Against Torture and Other Cruel and Inhuman\nor Degrading Treatment or Punishment, Dec. 10, 1984, S.\nTreaty Doc. No. 100–20, 1465 U. N. T. S. 113. Federal law\ngoverning detention and removal of immigrants continues,\nof course, to be binding as well. See 8 U. S. C. §1226(a) (re-\nquiring a warrant before a noncitizen “may be arrested and\ndetained pending a decision” on removal); 8 CFR\n§287.8(c)(2)(ii) (2024) (requiring same); see also 8 CFR\n§241.4(l) (in order to revoke conditional release, the Gov-\nernment must provide adequate notice and “promptly” ar-\nrange an “initial informal interview . . . to afford the alien\nan opportunity to respond to the reasons for the revocation\nstated in the notification”). Moreover, it has been the Gov-\nernment’s own well-established policy to “facilitate [an] al-\nien’s return to the United States if . . . the alien’s presence\nis necessary for continued administrative removal proceed-\nings” in cases where a noncitizen has been removed pending\nimmigration proceedings. See U. S. Immigration and Cus-\ntoms Enforcement, Directive 11061.1, Facilitating the Re-\nturn to the United States of Certain Lawfully Removed Al-\niens, §2 (Feb. 24, 2012).\n   In the proceedings on remand, the District Court should\ncontinue to ensure that the Government lives up to its obli-\ngations to follow the law.\n\f",
    "html": "",
    "html_lawbox": "",
    "html_columbia": "",
    "html_anon_2020": "",
    "xml_harvard": "",
    "html_with_citations": "<pre class=\"inline\">                 Cite as: </pre><span class=\"citation no-link\">604 U. S. ____</span><pre class=\"inline\"> (2025)           1\n\n\n\n\nSUPREME COURT OF THE UNITED STATES\n                         _________________\n\n                          No. 24A949\n                         _________________\n\n\n   KRISTI NOEM, SECRETARY, DEPARTMENT OF\n     HOMELAND SECURITY, ET AL. v. KILMAR\n        ARMANDO ABREGO GARCIA, ET AL.\n ON APPLICATION TO VACATE INJUNCTION ENTERED BY THE\n   UNITED STATES DISTRICT COURT FOR THE DISTRICT OF\n                      MARYLAND\n                        [April 10, 2025]\n\n  On March 15, 2025, the United States removed Kilmar\nArmando Abrego Garcia from the United States to El Sal-\nvador, where he is currently detained in the Center for Ter-\nrorism Confinement (CECOT). The United States acknowl-\nedges that Abrego Garcia was subject to a withholding\norder forbidding his removal to El Salvador, and that the\nremoval to El Salvador was therefore illegal. The United\nStates represents that the removal to El Salvador was the\nresult of an “administrative error.” The United States al-\nleges, however, that Abrego Garcia has been found to be a\nmember of the gang MS–13, a designated foreign terrorist\norganization, and that his return to the United States\nwould pose a threat to the public. Abrego Garcia responds\nthat he is not a member of MS–13, and that he has lived\nsafely in the United States with his family for a decade and\nhas never been charged with a crime.\n  On Friday, April 4, the United States District Court for\nthe District of Maryland entered an order directing the Gov-\nernment to “facilitate and effectuate the return of [Abrego\nGarcia] to the United States by no later than 11:59 PM on\nMonday, April 7.” On the morning of April 7, the United\nStates filed this application to vacate the District Court’s\norder. THE CHIEF JUSTICE entered an administrative stay\n\f2                NOEM v. ABREGO GARCIA\n\n                  Statement of SOTOMAYOR, J.\n\nand subsequently referred the application to the Court.\n   The application is granted in part and denied in part,\nsubject to the direction of this order. Due to the adminis-\ntrative stay issued by THE CHIEF JUSTICE, the deadline im-\nposed by the District Court has now passed. To that extent,\nthe Government’s emergency application is effectively\ngranted in part and the deadline in the challenged order is\nno longer effective. The rest of the District Court’s order\nremains in effect but requires clarification on remand. The\norder properly requires the Government to “facilitate”\nAbrego Garcia’s release from custody in El Salvador and to\nensure that his case is handled as it would have been had\nhe not been improperly sent to El Salvador. The intended\nscope of the term “effectuate” in the District Court’s order\nis, however, unclear, and may exceed the District Court’s\nauthority. The District Court should clarify its directive,\nwith due regard for the deference owed to the Executive\nBranch in the conduct of foreign affairs. For its part, the\nGovernment should be prepared to share what it can con-\ncerning the steps it has taken and the prospect of further\nsteps. The order heretofore entered by THE CHIEF JUSTICE\nis vacated.\n   Statement of JUSTICE SOTOMAYOR, with whom JUSTICE\nKAGAN and JUSTICE JACKSON join, respecting the Court’s\ndisposition of the application.\n   The United States Government arrested Kilmar Ar-\nmando Abrego Garcia in Maryland and flew him to a “ter-\nrorism confinement center” in El Salvador, where he has\nbeen detained for 26 days and counting. To this day, the\nGovernment has cited no basis in law for Abrego Garcia’s\nwarrantless arrest, his removal to El Salvador, or his con-\nfinement in a Salvadoran prison. Nor could it. The Gov-\nernment remains bound by an Immigration Judge’s 2019\norder expressly prohibiting Abrego Garcia’s removal to El\n\f                 Cite as: </pre><span class=\"citation no-link\">604 U. S. ____</span><pre class=\"inline\"> (2025)            3\n\n                  Statement of SOTOMAYOR, J.\n\nSalvador because he faced a “clear probability of future per-\nsecution” there and “demonstrated that [El Salvador’s] au-\nthorities were and would be unable or unwilling to protect\nhim.” App. to Application To Vacate Injunction 13a. The\nGovernment has not challenged the validity of that order.\n   Instead of hastening to correct its egregious error, the\nGovernment dismissed it as an “oversight.” Decl. of R.\nCerna in No. 25–cv–951 (D Md., Mar. 31, 2025), ECF Doc.\n11–3, p. 3. The Government now requests an order from\nthis Court permitting it to leave Abrego Garcia, a husband\nand father without a criminal record, in a Salvadoran\nprison for no reason recognized by the law. The only argu-\nment the Government offers in support of its request, that\nUnited States courts cannot grant relief once a deportee\ncrosses the border, is plainly wrong. See Rumsfeld v. Pa-\ndilla, </pre><span class=\"citation\" data-id=\"136999\"><a href=\"/opinion/136999/rumsfeld-v-padilla/#447\" aria-description=\"Citation for case: Rumsfeld v. Padilla\">542 U. S. 426, 447, n. 16</a></span><pre class=\"inline\"> (2004); cf. Boumediene v.\nBush, </pre><span class=\"citation\" data-id=\"145795\"><a href=\"/opinion/145795/boumediene-v-bush/#732\" aria-description=\"Citation for case: Boumediene v. Bush\">553 U. S. 723, 732</a></span><pre class=\"inline\"> (2008). The Government’s argu-\nment, moreover, implies that it could deport and incarcer-\nate any person, including U. S. citizens, without legal con-\nsequence, so long as it does so before a court can intervene.\nSee Trump v. J. G. G., </pre><span class=\"citation no-link\">604 U. S. ___</span><pre class=\"inline\">, ___ (2025)\n(SOTOMAYOR, J., dissenting) (slip op., at 8). That view re-\nfutes itself.\n   Because every factor governing requests for equitable re-\nlief manifestly weighs against the Government, Nken v.\nHolder, </pre><span class=\"citation\" data-id=\"145884\"><a href=\"/opinion/145884/nken-v-holder/#426\" aria-description=\"Citation for case: Nken v. Holder\">556 U. S. 418, 426</a></span><pre class=\"inline\"> (2009), I would have declined to\nintervene in this litigation and denied the application in\nfull.\n   Nevertheless, I agree with the Court’s order that the\nproper remedy is to provide Abrego Garcia with all the pro-\ncess to which he would have been entitled had he not been\nunlawfully removed to El Salvador. That means the Gov-\nernment must comply with its obligation to provide Abrego\nGarcia with “due process of law,” including notice and an\nopportunity to be heard, in any future proceedings. Reno v.\nFlores, </pre><span class=\"citation\" data-id=\"112833\"><a href=\"/opinion/112833/reno-v-flores/#306\" aria-description=\"Citation for case: Reno v. Flores\">507 U. S. 292, 306</a></span><pre class=\"inline\"> (1993). It must also comply with\n\f4                 NOEM v. ABREGO GARCIA\n\n                   Statement of SOTOMAYOR, J.\n\nits obligations under the Convention Against Torture. See\nConvention Against Torture and Other Cruel and Inhuman\nor Degrading Treatment or Punishment, Dec. 10, 1984, S.\nTreaty Doc. No. 100–20, 1465 U. N. T. S. 113. Federal law\ngoverning detention and removal of immigrants continues,\nof course, to be binding as well. See </pre><span class=\"citation no-link\">8 U. S. C. §1226</span><pre class=\"inline\">(a) (re-\nquiring a warrant before a noncitizen “may be arrested and\ndetained pending a decision” on removal); </pre><span class=\"citation no-link\">8 CFR\n§287.8</span><pre class=\"inline\">(c)(2)(ii) (2024) (requiring same); see also </pre><span class=\"citation no-link\">8 CFR\n§241.4</span><pre class=\"inline\">(l) (in order to revoke conditional release, the Gov-\nernment must provide adequate notice and “promptly” ar-\nrange an “initial informal interview . . . to afford the alien\nan opportunity to respond to the reasons for the revocation\nstated in the notification”). Moreover, it has been the Gov-\nernment’s own well-established policy to “facilitate [an] al-\nien’s return to the United States if . . . the alien’s presence\nis necessary for continued administrative removal proceed-\nings” in cases where a noncitizen has been removed pending\nimmigration proceedings. See U. S. Immigration and Cus-\ntoms Enforcement, Directive 11061.1, Facilitating the Re-\nturn to the United States of Certain Lawfully Removed Al-\niens, §2 (Feb. 24, 2012).\n   In the proceedings on remand, the District Court should\ncontinue to ensure that the Government lives up to its obli-\ngations to follow the law.\n\f</pre>",
    "extracted_by_ocr": false,
    "ordering_key": null,
    "opinions_cited": [
        "https://www.courtlistener.com/api/rest/v4/opinions/112833/",
        "https://www.courtlistener.com/api/rest/v4/opinions/136999/",
        "https://www.courtlistener.com/api/rest/v4/opinions/145795/",
        "https://www.courtlistener.com/api/rest/v4/opinions/145884/"
    ]
}

### People API
{
    "resource_uri": "https://www.courtlistener.com/api/rest/v4/people/3045/",
    "id": 3045,
    "race": [
        "h"
    ],
    "sources": [],
    "aba_ratings": [
        {
            "resource_uri": "https://www.courtlistener.com/api/rest/v4/aba-ratings/1922/",
            "id": 1922,
            "person": "https://www.courtlistener.com/api/rest/v4/people/3045/",
            "date_created": "2016-04-20T08:22:53.215525-07:00",
            "date_modified": "2016-04-20T08:22:53.215547-07:00",
            "year_rated": 1991,
            "rating": "q"
        },
        {
            "resource_uri": "https://www.courtlistener.com/api/rest/v4/aba-ratings/1923/",
            "id": 1923,
            "person": "https://www.courtlistener.com/api/rest/v4/people/3045/",
            "date_created": "2016-04-20T08:22:53.256656-07:00",
            "date_modified": "2016-04-20T08:22:53.256677-07:00",
            "year_rated": 1997,
            "rating": "wq"
        },
        {
            "resource_uri": "https://www.courtlistener.com/api/rest/v4/aba-ratings/1924/",
            "id": 1924,
            "person": "https://www.courtlistener.com/api/rest/v4/people/3045/",
            "date_created": "2016-04-20T08:22:53.297371-07:00",
            "date_modified": "2016-04-20T08:22:53.297400-07:00",
            "year_rated": 2009,
            "rating": "wq"
        }
    ],
    "educations": [
        {
            "resource_uri": "https://www.courtlistener.com/api/rest/v4/educations/2551/",
            "id": 2551,
            "school": {
                "resource_uri": "https://www.courtlistener.com/api/rest/v4/schools/4696/",
                "id": 4696,
                "is_alias_of": null,
                "date_created": "2010-06-07T17:00:00-07:00",
                "date_modified": "2010-06-07T17:00:00-07:00",
                "name": "Princeton University",
                "ein": 210634501
            },
            "person": "https://www.courtlistener.com/api/rest/v4/people/3045/",
            "date_created": "2016-04-20T08:22:53.316861-07:00",
            "date_modified": "2016-04-20T08:22:53.316891-07:00",
            "degree_level": "ba",
            "degree_detail": "B.A.",
            "degree_year": 1976
        },
        {
            "resource_uri": "https://www.courtlistener.com/api/rest/v4/educations/2552/",
            "id": 2552,
            "school": {
                "resource_uri": "https://www.courtlistener.com/api/rest/v4/schools/3832/",
                "id": 3832,
                "is_alias_of": null,
                "date_created": "2010-06-07T17:00:00-07:00",
                "date_modified": "2010-06-07T17:00:00-07:00",
                "name": "Yale University",
                "ein": 60646973
            },
            "person": "https://www.courtlistener.com/api/rest/v4/people/3045/",
            "date_created": "2016-04-20T08:22:53.351677-07:00",
            "date_modified": "2016-04-20T08:22:53.351718-07:00",
            "degree_level": "jd",
            "degree_detail": "J.D.",
            "degree_year": 1979
        }
    ],
    "positions": [
        "https://www.courtlistener.com/api/rest/v4/positions/19125/",
        "https://www.courtlistener.com/api/rest/v4/positions/19126/",
        "https://www.courtlistener.com/api/rest/v4/positions/19127/",
        "https://www.courtlistener.com/api/rest/v4/positions/19128/",
        "https://www.courtlistener.com/api/rest/v4/positions/19124/"
    ],
    "political_affiliations": [
        {
            "resource_uri": "https://www.courtlistener.com/api/rest/v4/political-affiliations/3059/",
            "id": 3059,
            "person": "https://www.courtlistener.com/api/rest/v4/people/3045/",
            "date_created": "2016-04-20T08:22:53.208322-07:00",
            "date_modified": "2016-04-20T08:22:53.242653-07:00",
            "political_party": "r",
            "source": "a",
            "date_start": "1991-11-27",
            "date_granularity_start": "%Y-%m-%d",
            "date_end": "1997-06-25",
            "date_granularity_end": "%Y-%m-%d"
        },
        {
            "resource_uri": "https://www.courtlistener.com/api/rest/v4/political-affiliations/3060/",
            "id": 3060,
            "person": "https://www.courtlistener.com/api/rest/v4/people/3045/",
            "date_created": "2016-04-20T08:22:53.249991-07:00",
            "date_modified": "2016-04-20T08:22:53.282787-07:00",
            "political_party": "d",
            "source": "a",
            "date_start": "1997-06-25",
            "date_granularity_start": "%Y-%m-%d",
            "date_end": "2009-06-01",
            "date_granularity_end": "%Y-%m-%d"
        },
        {
            "resource_uri": "https://www.courtlistener.com/api/rest/v4/political-affiliations/3061/",
            "id": 3061,
            "person": "https://www.courtlistener.com/api/rest/v4/people/3045/",
            "date_created": "2016-04-20T08:22:53.289363-07:00",
            "date_modified": "2016-04-20T08:22:53.289396-07:00",
            "political_party": "d",
            "source": "a",
            "date_start": "2009-06-01",
            "date_granularity_start": "%Y-%m-%d",
            "date_end": null,
            "date_granularity_end": ""
        }
    ],
    "is_alias_of": null,
    "date_created": "2016-04-20T08:22:53.175664-07:00",
    "date_modified": "2020-11-25T08:30:21.004003-08:00",
    "date_completed": null,
    "fjc_id": 2243,
    "slug": "sonia-sotomayor",
    "name_first": "Sonia",
    "name_middle": "",
    "name_last": "Sotomayor",
    "name_suffix": "",
    "date_dob": "1954-01-01",
    "date_granularity_dob": "%Y",
    "date_dod": null,
    "date_granularity_dod": "",
    "dob_city": "Bronx",
    "dob_state": "NY",
    "dob_country": "United States",
    "dod_city": "",
    "dod_state": "",
    "dod_country": "United States",
    "gender": "f",
    "religion": "",
    "ftm_total_received": null,
    "ftm_eid": "",
    "has_photo": true
}

### Court API

URL: https://www.courtlistener.com/api/rest/v4/courts/

```
{
    "count": 3351,
    "next": "https://www.courtlistener.com/api/rest/v4/courts/?page=2",
    "previous": null,
    "results": [
        {
            "resource_uri": "https://www.courtlistener.com/api/rest/v4/courts/scotus/",
            "id": "scotus",
            "pacer_court_id": null,
            "pacer_has_rss_feed": null,
            "pacer_rss_entry_types": "",
            "date_last_pacer_contact": null,
            "fjc_court_id": "",
            "date_modified": "2014-10-30T18:59:15.952000-07:00",
            "in_use": true,
            "has_opinion_scraper": true,
            "has_oral_argument_scraper": true,
            "position": 1.0,
            "citation_string": "SCOTUS",
            "short_name": "Supreme Court",
            "full_name": "Supreme Court of the United States",
            "url": "http://supremecourt.gov/",
            "start_date": "1789-09-24",
            "end_date": null,
            "jurisdiction": "F",
            "parent_court": null,
            "appeals_to": []
        },
        {
            "resource_uri": "https://www.courtlistener.com/api/rest/v4/courts/ca1/",
            "id": "ca1",
            "pacer_court_id": 1,
            "pacer_has_rss_feed": false,
            "pacer_rss_entry_types": "",
            "date_last_pacer_contact": null,
            "fjc_court_id": "1",
            "date_modified": "2023-02-22T08:08:13.910202-08:00",
            "in_use": true,
            "has_opinion_scraper": true,
            "has_oral_argument_scraper": true,
            "position": 101.0,
            "citation_string": "1st Cir.",
            "short_name": "First Circuit",
            "full_name": "Court of Appeals for the First Circuit",
            "url": "http://www.ca1.uscourts.gov/",
            "start_date": "1891-03-03",
            "end_date": null,
            "jurisdiction": "F",
            "parent_court": null,
            "appeals_to": []
        },
    ]
}
```


