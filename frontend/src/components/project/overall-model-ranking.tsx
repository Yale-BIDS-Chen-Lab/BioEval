"use client";

import type { Inference } from "@/schemas/inference";

function formatAverageRankValue(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    useGrouping: false,
  }).format(value);
}

type RankedModel = {
  providerId: string;
  model: string;
  position: number;
  averageRank: number;
  datasetCount: number;
  modelCount: number;
};

function medalForPosition(position: number) {
  switch (position) {
    case 1:
      return "🥇";
    case 2:
      return "🥈";
    case 3:
      return "🥉";
    default:
      return null;
  }
}

function getRankedModels(inferences: Inference[]): RankedModel[] {
  const byModel = new Map<string, RankedModel>();

  for (const inference of inferences) {
    const overall = inference.overallModelRanking;
    if (!overall) {
      continue;
    }

    const key = `${inference.providerId}::${inference.model}`;
    const current = byModel.get(key);
    if (!current || overall.position < current.position) {
      byModel.set(key, {
        providerId: inference.providerId,
        model: inference.model,
        position: overall.position,
        averageRank: overall.averageRank,
        datasetCount: overall.datasetCount,
        modelCount: overall.modelCount,
      });
    }
  }

  return [...byModel.values()].sort((a, b) => {
    if (a.position !== b.position) {
      return a.position - b.position;
    }
    if (a.averageRank !== b.averageRank) {
      return a.averageRank - b.averageRank;
    }
    return a.model.localeCompare(b.model);
  });
}

function getSharedDatasetNames(inferences: Inference[]) {
  return [...new Set(
    inferences
      .filter(
        (inference) =>
          !!inference.overallModelRanking &&
          !!inference.evaluationSummary?.primaryMetricBest &&
          !!inference.dataset
      )
      .map((inference) => inference.dataset!)
  )].sort((a, b) => a.localeCompare(b));
}

export function OverallModelRanking({
  inferences,
}: {
  inferences: Inference[];
}) {
  const rankedModels = getRankedModels(inferences);
  if (rankedModels.length === 0) {
    return null;
  }

  const sharedDatasetCount = rankedModels[0]?.datasetCount ?? 0;
  const sharedDatasetNames = getSharedDatasetNames(inferences);

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight">
            Overall model ranking
          </h2>
          <p className="text-muted-foreground text-sm">
            Average rank across {sharedDatasetCount} shared datasets:{" "}
            {sharedDatasetNames.join(", ")}
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rankedModels.map((entry) => {
          const medal = medalForPosition(entry.position);

          return (
            <div
              key={`${entry.providerId}::${entry.model}`}
              className="flex min-h-[92px] flex-col justify-between rounded-lg border bg-background px-4 py-3"
              title={`#${entry.position} overall with average rank ${formatAverageRankValue(
                entry.averageRank
              )}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">
                    {medal ? `${medal} ` : ""}#{entry.position} overall
                  </div>
                  <div className="text-muted-foreground truncate text-xs leading-5">
                    {entry.model}
                  </div>
                </div>
                <img
                  src={`/logos/${entry.providerId}.svg`}
                  alt="Provider logo"
                  width={20}
                  height={20}
                  className="mt-0.5 shrink-0 select-none"
                />
              </div>

              <div className="text-muted-foreground text-xs leading-5">
                Avg rank {formatAverageRankValue(entry.averageRank)}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
