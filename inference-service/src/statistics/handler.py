"""Statistical analysis: Wilcoxon rank-sum test + bootstrap confidence intervals."""

import numpy as np
from scipy.stats import ranksums


def bootstrap_stats(
    scores: list[float],
    sample_size: int = 40,
    n_boot: int = 1000,
) -> dict:
    arr = np.array(scores)
    if len(arr) == 0:
        return {"mean": 0, "std": 0, "ci_low": 0, "ci_high": 0}

    actual_sample_size = min(sample_size, len(arr))
    boot_means = np.array([
        np.random.choice(arr, actual_sample_size, replace=True).mean()
        for _ in range(n_boot)
    ])

    ci_low, ci_high = np.percentile(boot_means, [2.5, 97.5])
    return {
        "mean": round(float(boot_means.mean()), 4),
        "std": round(float(boot_means.std(ddof=1)), 4),
        "ci_low": round(float(ci_low), 4),
        "ci_high": round(float(ci_high), 4),
    }


def run_statistical_analysis(
    models: dict[str, dict[str, list[float]]],
    sample_size: int = 40,
    n_boot: int = 1000,
) -> dict:
    """
    Run pairwise Wilcoxon rank-sum tests and bootstrap CI for each model/metric.

    Args:
        models: { modelName: { metricName: [per-example values] } }
        sample_size: bootstrap sample size
        n_boot: number of bootstrap iterations

    Returns:
        {
          "bootstrap": { modelName: { metricName: { mean, std, ci_low, ci_high } } },
          "pairwise": [ { modelA, modelB, metric, statistic, p_value } ]
        }
    """
    model_names = list(models.keys())

    # Collect common metrics
    all_metric_sets = [set(metrics.keys()) for metrics in models.values()]
    if not all_metric_sets:
        return {"bootstrap": {}, "pairwise": []}
    common_metrics = sorted(set.intersection(*all_metric_sets))

    # Bootstrap stats per model per metric
    bootstrap_results: dict[str, dict] = {}
    for model_name, metrics in models.items():
        bootstrap_results[model_name] = {}
        for metric in common_metrics:
            scores = metrics.get(metric, [])
            bootstrap_results[model_name][metric] = bootstrap_stats(
                scores, sample_size, n_boot
            )

    # Pairwise Wilcoxon rank-sum tests
    pairwise_results: list[dict] = []
    for i in range(len(model_names)):
        for j in range(i + 1, len(model_names)):
            model_a, model_b = model_names[i], model_names[j]
            for metric in common_metrics:
                scores_a = models[model_a].get(metric, [])
                scores_b = models[model_b].get(metric, [])
                if len(scores_a) < 2 or len(scores_b) < 2:
                    continue
                stat, p_value = ranksums(scores_a, scores_b)
                pairwise_results.append({
                    "modelA": model_a,
                    "modelB": model_b,
                    "metric": metric,
                    "statistic": round(float(stat), 4),
                    "p_value": float(p_value),
                })

    return {
        "bootstrap": bootstrap_results,
        "pairwise": pairwise_results,
    }
