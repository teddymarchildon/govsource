"""Shared writing guidance and deterministic style checks for all Brief generation paths."""
import re

PLAIN_ENGLISH_STYLE = (
    "Use simple English throughout the headline, dek, points, and context. Write for "
    "readers with no legal or government background. Prefer common, everyday words, "
    "short sentences, and active voice. Avoid complex legal terms, bureaucratic jargon, "
    "and unexplained acronyms. When a legal term is necessary for accuracy, explain it "
    "in simple words the first time it appears. For example, use 'under' instead of "
    "'pursuant to' and 'before' instead of 'prior to'. Explain what happened and who is "
    "affected in concrete terms supported by the source. Simplify the wording without "
    "changing the legal meaning, certainty, scope, or important exceptions. Preserve "
    "official names when needed and keep supporting evidence quotes verbatim. "
    "Punctuation: never use em dashes, double hyphens, or any dash with spaces around it "
    "in the headline, dek, points, or context. Use a comma, colon, parentheses, or a new "
    "sentence instead. Ranges may use 'to' or an unspaced dash, as in 'October 1 to 15' or "
    "'FY2024-FY2025'. Text inside quotation marks and verbatim evidence quotes are exempt. "
    "Every sentence must state something specific from the source: who is affected, what "
    "changes, how much, when, or what is excluded. Do not write filler or generic claims of "
    "significance, such as 'it is important to note', 'in short', 'in other words', "
    "'overall', 'plays a key role', 'a significant step', 'landmark law', 'sweeping changes', "
    "'paves the way', 'underscores', 'highlights the importance of', 'aims to strengthen', "
    "or 'why this matters'. Do not end a section with a sentence that restates it. "
    "Say each fact once in the whole brief. The headline and dek state the main change; each "
    "point adds a different fact; the context explains what the points mean in practice and "
    "never restates them. State legal status (introduced, sent to committee, passed) once. "
    "Write in your own plain words. Quote only a short phrase, and only when the exact wording "
    "matters; never string quotations together. Never put statute or regulation citations "
    "(such as '15 U.S.C. 26b', '40 CFR part 60' or '§ 27'), passage IDs, data field names, or "
    "lists of source excerpts in public text: readers get the source links separately. Do not "
    "use legal wording such as 'pursuant to', 'statutory', 'codify', 'shall', 'thereof' or "
    "'read twice'. When a legal term is unavoidable, explain it the first time in everyday words, "
    "using the supplied plain_definitions when one fits. "
    "Illustration only, not a fact to reuse: instead of 'The rule marks a significant step "
    "toward safer water', write the concrete change, such as 'The rule lowers the limit for "
    "public water systems from 15 to 10 parts per billion'. "
)

# Spans inside quotation marks are verbatim source text and keep their punctuation.
# Straight single quotes are skipped because they double as apostrophes.
_QUOTED = re.compile(r'"[^"\n]*"|“[^”\n]*”|‘‘.*?’’|``[^\n]*?' + "''" + r'|‘[^’\n]*’')
# Em dashes anywhere; en/figure dashes and hyphens only when used as a spaced dash.
# Unspaced en dashes are ordinary range typography ("0–6 months", "FY2024–FY2025").
_DASH = re.compile(r'[—―]|\s[‒–]|[‒–]\s|(?<=\S) ?--+ ?(?=\S)|(?<=\w) - (?=\w)')

# Narrow phrases only: bare words like "significant" or "vital" appear in official
# names ("Finding of No Significant Impact", "vital records") and must stay allowed.
FILLER_PHRASES = (
    r"it is (?:important|worth) (?:to note|noting)", r"it'?s (?:important|worth) (?:to note|noting)",
    r"worth noting", r"in short", r"in other words", r"in summary", r"to summarize",
    r"(?:^|[.!?]\s+)overall,", r"(?:^|[.!?]\s+)ultimately,", r"the bottom line",
    r"at the end of the day", r"plays? an? (?:key|crucial|vital|critical|pivotal|important) role",
    r"an? (?:significant|major|key|important|crucial|critical|historic) step",
    r"a step (?:forward|in the right direction)",
    r"landmark (?:law|rule|ruling|decision|legislation|bill|case|move|step|achievement|reform|agreement|deal)",
    r"sweeping (?:changes?|reforms?|overhaul|new|expansion|powers)", r"game[- ]changer",
    r"paves? the way", r"underscores?", r"highlights? the (?:importance|need)",
    r"a testament to", r"in today'?s", r"ever[- ]evolving", r"far[- ]reaching",
    r"sends? an? (?:clear|strong) (?:message|signal)", r"remains to be seen", r"time will tell",
    r"aims? to (?:strengthen|enhance|improve|bolster|streamline)", r"why (?:this|it) matters",
    r"navigat(?:e|es|ing) the (?:complex|complexities)", r"\bdelve",
)
_FILLER = re.compile(r'\b(?:' + '|'.join(FILLER_PHRASES) + r')', re.IGNORECASE | re.MULTILINE)

# The selection plan is private. Its vocabulary must never surface in public copy.
_SCAFFOLD = re.compile(
    r'explanatory angles?|explanation[ _]plan|editorial[ _]plan|reader[ _]question|reader[ _]value|'
    r'\bangles? ?(?:#?\d+|one|two|three|four|[ivx]+)\b|\b(?:first|second|third|fourth) angle\b',
    re.IGNORECASE)


def _excerpt(text, match):
    start, end = max(0, match.start() - 30), min(len(text), match.end() + 30)
    return ' '.join(text[start:end].split())


def style_issues(field, text):
    """Return repair feedback for banned punctuation, filler and leaked planning notes."""
    if not isinstance(text, str) or not text.strip():
        return []
    issues = []
    match = _SCAFFOLD.search(text)
    if match:
        issues.append(f'{field}: remove planning language "{match.group(0)}" near "{_excerpt(text, match)}". '
                      'The editorial plan is private; explain the subject without naming, numbering or labeling angles.')
    prose = _QUOTED.sub(lambda m: ' ' * len(m.group(0)), text)
    match = _DASH.search(prose)
    if match:
        issues.append(f'{field}: replace the dash near "{_excerpt(prose, match)}" with a comma, colon, '
                      'parentheses or a new sentence; write ranges with "to" or "through".')
    for match in dict.fromkeys(m.group(0).strip(' .!?').lower() for m in _FILLER.finditer(prose)):
        issues.append(f'{field}: remove the stock phrase "{match}". State the specific source-supported fact '
                      'instead, or delete the sentence.')
    # Internal labels are checked on the full text: a quoted "law_enacted_date" is still metadata.
    match = _INTERNAL.search(text)
    if match:
        issues.append(f'{field}: remove the internal label "{match.group(0)}". Passage IDs, data field names '
                      'and source-excerpt lists never appear in public text; sources are linked separately.')
    match = _CITATION.search(prose)
    if match:
        issues.append(f'{field}: remove the legal citation "{match.group(0)}" near "{_excerpt(prose, match)}". '
                      'Name the law in plain words; readers get the source link separately.')
    for pattern, plain in LEGALESE:
        match = re.search(pattern, prose, re.IGNORECASE)
        if match:
            issues.append(f'{field}: replace the legal wording "{match.group(0).lower()}" with {plain}.')
    quoted = [m.group(0) for m in _QUOTED.finditer(text)]
    share = sum(map(len, quoted)) / len(text)
    if len(text) >= 200 and share > MAX_QUOTED_SHARE:
        issues.append(f'{field}: {share:.0%} of this text is quotation. Explain the source in your own plain '
                      'words and quote only a short phrase when the exact wording matters.')
    long_quote = next((q for q in quoted if len(_words(q)) > MAX_QUOTE_WORDS), None)
    if long_quote:
        issues.append(f'{field}: the quotation starting "{" ".join(long_quote.split()[:8])}" is too long. '
                      f'Paraphrase it or quote at most {MAX_QUOTE_WORDS} words.')
    return issues


# Measured on stored briefs: 12-word runs separate copied clauses from shared official
# names, flagging 59% of the repetitive v5 contexts and 0.3% of v3 contexts.
REPEAT_WORDS = 12
MAX_QUOTED_SHARE = 0.35
MAX_QUOTE_WORDS = 25
_INTERNAL = re.compile(r'\bsource_\d+(?:_section_\d+)?\b|(?-i:\b[a-z]+(?:_[a-z0-9]+)+\b)(?![@\w.-]*@)'
                       r'|^#*\s*source excerpts\b|\(quote:', re.IGNORECASE | re.MULTILINE)
_CITATION = re.compile(r'\b\d+\s+U\.\s?S\.\s?C\.?(?:\s+§*\s*[\w.()-]+)?|\b\d+\s+C\.?\s?F\.?\s?R\.?(?:\s+(?:part\s+)?[\w.()-]+)?|§+\s*[\w.()-]+',
                       re.IGNORECASE)
# Outside quotation marks only. Each pattern carries the plain wording to use instead.
LEGALESE = (
    (r'\bpursuant to\b', '"under"'), (r'\bprior to\b', '"before"'), (r'\bin accordance with\b', '"under" or "following"'),
    (r'\bpromulgat\w*', '"issue" or "adopt"'), (r'\bnotwithstanding\b', '"despite" or "even if"'),
    (r'\b(?:hereinafter|aforementioned|aforesaid|herein|thereof|therein|thereto|whereby)\b', 'plain words that name the thing'),
    (r'\binter alia\b', '"among other things"'), (r'\bstatutor(?:y|ily)\b', '"in the law" or "set by law"'),
    (r'\bcodif(?:y|ies|ied|ying|ication)\b', '"write into law" or "add to the rules"'),
    (r'\bread twice\b', 'nothing: say the bill was introduced and sent to a committee'),
    (r'\bshall\b', '"must" or "will"'),
)


def _words(text):
    return re.findall(r"[a-z0-9]+(?:'[a-z]+)?", text.lower())


def _runs(text):
    words = _words(text)
    return [' '.join(words[i:i + REPEAT_WORDS]) for i in range(len(words) - REPEAT_WORDS + 1)]


def repetition_issues(fields):
    """Flag clauses copied between the dek, points and context, or repeated inside context.

    The headline is excluded: a dek naturally restates it.
    """
    issues = []
    context = fields.get('context') or ''
    seen = set()
    for run in _runs(context):
        if run in seen:
            issues.append(f'context: the passage "{run}..." appears more than once. Say each fact once.')
            break
        seen.add(run)
    runs = {field: set(_runs(text or '')) for field, text in fields.items() if field != 'title'}
    names = list(runs)
    for i, first in enumerate(names):
        for second in names[i + 1:]:
            shared = runs[first] & runs[second]
            if shared:
                issues.append(f'{second}: repeats "{min(shared)}..." from {first}. Each field must add a '
                              'different fact; do not restate the dek or points.')
    return issues[:4]


# Vetted, general definitions only: no facts about any specific document and no numbers,
# so the deterministic number check never needs a citation for them. Offered to the writer
# and the verifier only when the term occurs in the source passages.
GLOSSARY = (
    ('antitrust laws', r'\bantitrust\b', 'federal laws that ban monopolies, price-fixing and other deals that '
     'limit competition between businesses'),
    ('Clayton Act', r'\bClayton Act\b', 'a federal antitrust law that bans some business practices that reduce '
     'competition, such as certain mergers'),
    ('Federal Trade Commission Act', r'\bFederal Trade Commission Act\b', 'the law that created the Federal Trade '
     'Commission and bans unfair methods of competition and deceptive business practices'),
    ('interstate commerce', r'\binterstate commerce\b', 'business activity that crosses state lines, which '
     'Congress has the power to regulate'),
    ('introduced bill', r'\bintroduced\b', 'a bill a member of Congress has formally proposed. To become law it must '
     'pass both the House and the Senate and be signed by the President, or have a veto overridden'),
    ('referred to committee', r'\breferred to the (?:\w+ )*committee\b', 'sent to a committee of lawmakers who handle '
     'that subject. The committee decides whether to review, change or advance the bill; many bills get no further'),
    ('United States Code', r'\bU\.\s?S\.\s?C\b|\bUnited States Code\b', 'the official collection of federal laws, '
     'organized by subject'),
    ('Code of Federal Regulations', r'\bC\.?F\.?R\b|\bCode of Federal Regulations\b', 'the official collection of '
     'rules issued by federal agencies'),
    ('proposed rule', r'\bproposed rule|\bnotice of proposed rulemaking\b|\bNPRM\b', 'a draft regulation an agency '
     'publishes for public comment. It does not take effect unless the agency later adopts a final rule'),
    ('final rule', r'\bfinal rule\b', 'a regulation an agency has adopted. It has legal force from its effective date'),
    ('interim final rule', r'\binterim final rule\b', 'a rule that takes effect before the agency finishes taking '
     'public comment. The agency can still change it later'),
    ('comment period', r'\bcomments?\b', 'the window when anyone can send an agency written feedback on a proposal'),
    ('effective date', r'\beffective date\b', 'the date a rule or law starts to apply'),
    ('Federal Register', r'\bFederal Register\b', "the federal government's daily publication of agency rules, "
     'proposed rules and notices'),
    ('docket', r'\bdocket\b', 'the public file for a rule or case, where documents and comments are posted'),
    ('executive order', r'\bexecutive order\b', 'a written directive from the President to federal agencies. It '
     'guides how agencies act but does not by itself change laws passed by Congress'),
    ('exemption', r'\bexempt(?:ion|ions|s|ed)?\b', 'a rule that excuses certain people, businesses or activities '
     'from a requirement'),
    ('preemption', r'\bpreempt\w*', 'when a federal law overrides a state or local law on the same subject'),
    ('injunction', r'\binjunction\b|\benjoin\w*', 'a court order that requires someone to do something or to stop '
     'doing something'),
    ('vacate', r'\bvacat(?:e|ed|es|ing|ur)\b', 'to cancel a court decision or agency action so it no longer has '
     'legal effect'),
    ('remand', r'\bremand\w*', 'to send a case back to a lower court or an agency to take further action'),
    ('affirm', r'\baffirm(?:ed|s|ing)?\b', 'to leave a lower court decision in place'),
    ('certiorari', r'\bcertiorari\b|\bcert\. (?:granted|denied)\b', 'a request asking the Supreme Court to hear a '
     'case. The Court agrees to hear only a small share of them'),
    ('majority opinion', r'\bopinion of the court\b|\bmajority\b', 'the opinion that decides the case and sets the '
     'legal rule'),
    ('dissent', r'\bdissent\w*', 'an opinion by judges who disagree with the majority. It does not change the outcome'),
    ('concurrence', r'\bconcur\w*', 'an opinion by a judge who agrees with the outcome but gives different or '
     'additional reasons'),
    ('environmental assessment', r'\benvironmental assessment\b', 'a shorter environmental review an agency uses to '
     'decide whether a project needs a full environmental impact statement'),
    ('Finding of No Significant Impact', r'\bFinding of No Significant Impact\b|\bFONSI\b', "an agency's "
     'conclusion that a project will not significantly affect the environment, so a full environmental impact '
     'statement is not required'),
    ('incidental take', r'\bincidental(?:,? but not intentional,?)? tak\w+|\bincidental harassment\b',
     'permission for an activity to unintentionally disturb or harm protected animals within set limits'),
    ('information collection', r'\binformation collection\b|\bPaperwork Reduction Act\b', "an agency's request for "
     'approval to gather information from the public, such as through forms or surveys'),
)


def plain_definitions(passages):
    """Vetted definitions for terms that occur in these passages, in glossary order."""
    text = ' '.join(str(p.get('text') or '') for p in passages)
    return [{'term': term, 'definition': definition + '.'}
            for term, pattern, definition in GLOSSARY if re.search(pattern, text, re.IGNORECASE)]
