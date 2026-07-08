import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
from _load import load

parser = load("bioeval_parser", "evaluation/parser.py")


class McqParserTest(unittest.TestCase):
    def test_abcd_returns_lowercased_first_letter(self):
        self.assertEqual(parser.process_mcq_abcd("C. because ...", None), "c")
        self.assertEqual(parser.process_mcq_abcd("  d) yes", None), "d")

    def test_abcd_out_of_range_is_missing(self):
        self.assertEqual(parser.process_mcq_abcd("E is the answer", None), "missing")
        self.assertEqual(parser.process_mcq_abcd("the answer is A", None), "missing")

    def test_abcd_empty_is_missing(self):
        self.assertEqual(parser.process_mcq_abcd("   ", None), "missing")
        self.assertEqual(parser.process_mcq_abcd("", None), "missing")

    def test_abcde_allows_e(self):
        self.assertEqual(parser.process_mcq_abcde("E", None), "e")
        self.assertEqual(parser.process_mcq_abcd("E", None), "missing")

    def test_yes_no_maybe_substring_search(self):
        self.assertEqual(parser.process_mcq_yes_no_maybe("I think yes, definitely", None), "yes")
        self.assertEqual(parser.process_mcq_yes_no_maybe("unclear", None), "missing")

    def test_yes_no_maybe_priority_order(self):
        # 'yes' is checked before 'no'
        self.assertEqual(parser.process_mcq_yes_no_maybe("yes and no", None), "yes")

    def test_true_false(self):
        self.assertEqual(parser.process_mcq_true_false("This is TRUE", None), "true")
        self.assertEqual(parser.process_mcq_true_false("false alarm", None), "false")


class MlcParserTest(unittest.TestCase):
    def test_matches_labels_in_output(self):
        out = parser.process_mlc_option(
            "this is about treatment and diagnosis",
            {"labels": "treatment,diagnosis,prevention"},
        )
        self.assertEqual(out, "treatment;diagnosis")

    def test_no_match_returns_empty(self):
        self.assertEqual(
            parser.process_mlc_option(
                "results were inconclusive", {"labels": "apple,banana,cherry"}
            ),
            "",
        )

    def test_substring_matching_is_naive(self):
        # KNOWN GOTCHA (documented, not endorsed): labels are matched as raw
        # substrings, so a short label matches inside an unrelated word — here
        # "a" matches inside "relevant". A word-boundary match would be safer.
        self.assertEqual(
            parser.process_mlc_option("relevant", {"labels": "a,b,c"}), "a"
        )

    def test_blank_output_returns_empty(self):
        self.assertEqual(parser.process_mlc_option("   ", {"labels": "a,b"}), "")

    def test_missing_labels_returns_empty(self):
        self.assertEqual(parser.process_mlc_option("x", {"labels": ""}), "")

    def test_no_delimiter_raises(self):
        with self.assertRaises(ValueError):
            parser.process_mlc_option("x", {"labels": "singlelabel"})

    def test_hoc_preconfigured_labels(self):
        out = parser.process_mlc_option_hoc(
            "discusses sustaining proliferative signaling and tumor promoting inflammation",
            None,
        )
        self.assertEqual(
            out, "sustaining proliferative signaling;tumor promoting inflammation"
        )


class ExtractSpansTest(unittest.TestCase):
    def test_single_span_token_indices(self):
        text = 'The <span class="Disease">lung cancer</span> spread'
        # "The"=tok0; span opens at tok_idx=1; "lung cancer"=2 tokens; close -> [1, 2, "disease"]
        self.assertEqual(parser.extract_spans(text, None), [[1, 2, "disease"]])

    def test_markdown_html_fence_is_stripped(self):
        text = '```html\n<span class="Chem">aspirin</span>\n```'
        self.assertEqual(parser.extract_spans(text, None), [[0, 0, "chem"]])

    def test_no_spans_returns_empty(self):
        self.assertEqual(parser.extract_spans("plain text here", None), [])


if __name__ == "__main__":
    unittest.main()
