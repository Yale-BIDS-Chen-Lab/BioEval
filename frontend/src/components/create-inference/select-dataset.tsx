import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, X } from "lucide-react";
import { axios } from "@/lib/axios";
import { useQuery } from "@tanstack/react-query";

function DatasetCard({ form, dataset, close }) {
  return (
    <div
      key={dataset.datasetId}
      className="hover:bg-input/30 h-16 cursor-pointer rounded-md border px-6 py-4 transition"
      onClick={() => {
        form.setValue("datasetId", dataset.datasetId, {
          shouldValidate: true,
        });
        close();
      }}
    >
      <div className="flex h-full items-center text-sm">{dataset.name}</div>
    </div>
  );
}

export function DatasetBrowser({ form, close }) {
  const { isPending, isError, data } = useQuery({
    queryKey: ["select-dataset-options"],
    queryFn: () =>
      axios.get("api/dataset/list", {
        withCredentials: true,
      }),
  });

  const [selectedTask, setSelectedTask] = useState<string>("All");
  const [search, setSearch] = useState("");

  const datasets = data?.data.datasets ?? [];

  const taskCategories = useMemo(() => {
    return Array.from(new Set(datasets.map((d) => d.taskName))).sort();
  }, [datasets]);

  const visibleDatasets = useMemo(() => {
    return datasets.filter((d) => {
      const matchesTask = selectedTask === "All" || d.taskName === selectedTask;
      const matchesSearch = d.name.toLowerCase().includes(search.toLowerCase());
      return matchesTask && matchesSearch;
    });
  }, [datasets, selectedTask, search]);

  if (isPending || isError) return <></>;

  const myDatasets = visibleDatasets.filter((d) => d.userOwned);
  const publicDatasets = visibleDatasets.filter((d) => !d.userOwned);

  return (
    <div className="flex h-full flex-row overflow-hidden">
      <ScrollArea className="h-full w-64 border-r p-6">
        <p className="mb-4 text-xl">Tasks</p>
        <nav className="space-y-1">
          <Button
            variant={selectedTask === "All" ? "default" : "ghost"}
            className="w-full justify-start"
            onClick={() => setSelectedTask("All")}
          >
            All
          </Button>
          {taskCategories.map((task) => (
            <Button
              key={task}
              variant={selectedTask === task ? "default" : "ghost"}
              className="w-full justify-start"
              onClick={() => setSelectedTask(task)}
            >
              {task}
            </Button>
          ))}
        </nav>
      </ScrollArea>

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
        {/* TODO: search and cards need improvements */}
        <div className="relative w-full max-w-md">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            placeholder="Search datasets"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            className="pl-10"
          />
          {/* {search && (
            <Button
              size="icon"
              variant="ghost"
              className="absolute top-1/2 right-1 -translate-y-1/2"
              onClick={() => setSearch("")}
            >
              <X className="h-4 w-4" />
            </Button>
          )} */}
        </div>

        <section className="space-y-4">
          <h2 className="text-lg">My Datasets</h2>
          {myDatasets.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {myDatasets.map((dataset) => (
                <DatasetCard dataset={dataset} form={form} close={close} />
              ))}
            </div>
          ) : (
            <p className="text-sm">No datasets for this task.</p>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="text-lg">Public Datasets</h2>
          {publicDatasets.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {publicDatasets.map((dataset) => (
                <DatasetCard dataset={dataset} form={form} close={close} />
              ))}
            </div>
          ) : (
            <p className="text-sm">No public datasets found.</p>
          )}
        </section>
      </div>
    </div>
  );
}
