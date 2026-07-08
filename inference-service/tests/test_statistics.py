import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from _load import load

handler = load("bioeval_stats_handler", "statistics/handler.py")
bootstrap_stats = handler.bootstrap_stats
run_statistical_analysis = handler.run_statistical_analysis


class BootstrapStatsTest(unittest.TestCase):
    def test_empty_scores_returns_zeros(self):
        self.assertEqual(
            bootstrap_stats([]),
            {"mean": 0, "std": 0, "ci_low": 0, "ci_high": 0},
        )

    def test_constant_scores_are_deterministic(self):
        # Resampling a constant array always yields the same mean, whatever the RNG does.
        out = bootstrap_stats([0.5] * 20, sample_size=10, n_boot=50)
        self.assertAlmostEqual(out["mean"], 0.5, places=4)
        self.assertAlmostEqual(out["std"], 0.0, places=4)
        self.assertAlmostEqual(out["ci_low"], 0.5, places=4)
        self.assertAlmostEqual(out["ci_high"], 0.5, places=4)

    def test_ci_brackets_the_mean(self):
        np.random.seed(1234)
        out = bootstrap_stats([0.1, 0.2, 0.9, 1.0, 0.5, 0.4], sample_size=6, n_boot=500)
        self.assertLessEqual(out["ci_low"], out["mean"])
        self.assertLessEqual(out["mean"], out["ci_high"])


class RunStatisticalAnalysisTest(unittest.TestCase):
    def test_identical_paired_scores_give_p_value_1(self):
        models = {
            "A": {"accuracy": [1.0, 0.0, 1.0, 1.0, 0.0]},
            "B": {"accuracy": [1.0, 0.0, 1.0, 1.0, 0.0]},
        }
        result = run_statistical_analysis(models, test_method="signed-rank")
        self.assertEqual(result["testMethod"], "signed-rank")
        self.assertEqual(len(result["pairwise"]), 1)
        self.assertEqual(result["pairwise"][0]["p_value"], 1.0)
        self.assertEqual(result["pairwise"][0]["statistic"], 0.0)

    def test_consistently_better_model_is_significant(self):
        # A beats B on all 10 paired examples -> Wilcoxon p should be well under 0.05.
        models = {"A": {"score": [0.9] * 10}, "B": {"score": [0.1] * 10}}
        result = run_statistical_analysis(models, test_method="signed-rank")
        self.assertLess(result["pairwise"][0]["p_value"], 0.05)

    def test_only_common_metrics_are_compared(self):
        models = {
            "A": {"acc": [1.0, 0.0, 1.0], "f1": [0.5, 0.5, 0.5]},
            "B": {"acc": [1.0, 1.0, 0.0]},
        }
        result = run_statistical_analysis(models)
        self.assertIn("acc", result["bootstrap"]["A"])
        self.assertNotIn("f1", result["bootstrap"]["A"])  # f1 not common
        self.assertEqual({p["metric"] for p in result["pairwise"]}, {"acc"})

    def test_ranksum_allows_unequal_lengths(self):
        models = {"A": {"m": [0.1, 0.2, 0.3, 0.4]}, "B": {"m": [0.9, 0.8]}}
        result = run_statistical_analysis(models, test_method="rank-sum")
        self.assertEqual(result["testMethod"], "rank-sum")
        self.assertEqual(len(result["pairwise"]), 1)
        self.assertIn("p_value", result["pairwise"][0])

    def test_signed_rank_skips_unequal_lengths(self):
        models = {"A": {"m": [0.1, 0.2, 0.3, 0.4]}, "B": {"m": [0.9, 0.8]}}
        result = run_statistical_analysis(models, test_method="signed-rank")
        self.assertEqual(result["pairwise"], [])

    def test_too_few_samples_are_skipped(self):
        models = {"A": {"m": [0.1]}, "B": {"m": [0.2]}}
        result = run_statistical_analysis(models, test_method="rank-sum")
        self.assertEqual(result["pairwise"], [])

    def test_invalid_method_defaults_to_signed_rank(self):
        models = {"A": {"m": [1.0, 0.0]}, "B": {"m": [1.0, 0.0]}}
        result = run_statistical_analysis(models, test_method="bogus")
        self.assertEqual(result["testMethod"], "signed-rank")

    def test_empty_models(self):
        self.assertEqual(
            run_statistical_analysis({}), {"bootstrap": {}, "pairwise": []}
        )


if __name__ == "__main__":
    unittest.main()
