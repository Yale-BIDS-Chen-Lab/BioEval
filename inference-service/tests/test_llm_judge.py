import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
from _load import load

judge = load("bioeval_llm_judge", "evaluation/callables/llm_judge.py")
parse = judge.parse_judge_score


class ParseJudgeScoreTest(unittest.TestCase):
    def test_plain_number(self):
        self.assertEqual(parse("4", 5), 4.0)

    def test_decimal(self):
        self.assertEqual(parse("4.5", 5), 4.5)

    def test_number_wrapped_in_prose(self):
        self.assertEqual(parse("Rating: 4 out of 5", 5), 4.0)
        self.assertEqual(parse("The score is 3/5.", 5), 3.0)

    def test_none_and_empty_return_none(self):
        self.assertIsNone(parse(None, 5))
        self.assertIsNone(parse("", 5))
        self.assertIsNone(parse("   ", 5))

    def test_non_numeric_returns_none(self):
        # Previously float("unable to rate") raised ValueError and failed the batch.
        self.assertIsNone(parse("unable to rate", 5))

    def test_clamped_to_scale(self):
        self.assertEqual(parse("8", 5), 5.0)   # above scale -> scale
        self.assertEqual(parse("0", 5), 1.0)   # below floor -> 1
        self.assertEqual(parse("-3", 5), 1.0)  # negative -> floor


if __name__ == "__main__":
    unittest.main()
