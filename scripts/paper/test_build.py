"""Checks for the model paper: it matches its data, and its template types no figure by hand."""

import re

import build

ALLOWED = [
    r'<div class="eq">.*?</div>',  # equations: definitions and their numbers
    r'<pre class="algo">.*?</pre>',  # the algorithm and its line numbers
    r"\{[a-z][a-z0-9_]*\}",  # placeholders
    r"\[@[^\]]+\]",  # citations
    r"^#{2,3} [\d.]+ ",  # section numbers
    r"\((?:\.\./)?[\w/.-]+\.png\)",  # figure files
    r"\b(?:Section|Sections|Table|Tables|Figure|Algorithm|Eq\.) \(?\d+(?:\.\d+)?\)?(?: and \d+)?",
    r"\(\d+\)",  # equation references
    r"SIA \d+/\d+",  # the standard's name
    r"ERA\d",  # the reanalysis' name
    r"large-v3",  # the speech model's name
    r"±50 %",  # the sensitivity's range, a design choice stated in economics.py
]


def test_paper_matches_its_data():
    assert build.OUT.read_text() == build.build(), (
        "docs/paper/kachel-model.md is stale: run make paper"
    )


def test_every_placeholder_and_citation_is_filled():
    paper = build.build()
    assert not re.search(r"\{[a-z][a-z0-9_]*\}", paper)
    assert "[@" not in paper


def test_template_types_no_figure_by_hand():
    text = build.TEMPLATE.read_text()
    for pattern in ALLOWED:
        text = re.sub(pattern, "", text, flags=re.DOTALL | re.MULTILINE)
    stray = [line for line in text.splitlines() if re.search(r"\d", line)]
    assert not stray, "numbers typed by hand in the template:\n" + "\n".join(stray)


def test_authors_are_the_team_in_the_readme():
    assert build.team(), "README.md lists no team"
    assert ", ".join(build.team()) in build.build()
