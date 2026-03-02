import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { axios } from "@/lib/axios";
import { columns } from "../data-table/columns/evaluation";
import { DataTable } from "../data-table/data-table";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogTrigger } from "../ui/dialog";
import { Container } from "../create-evaluation/container";

export function EvaluationsList() {
  const { projectId, inferenceId } = useParams({
    from: "/_authed/dashboard/project/$projectId/inference/$inferenceId/evaluation/",
  });
  const { isPending, isError, data, error } = useQuery({
    queryKey: ["evaluations"],
    queryFn: () => {
      return axios.get("api/evaluation/list", {
        withCredentials: true,
        params: {
          projectId,
          inferenceId,
        },
      });
    },
  });

  if (isPending || isError) {
    return <></>;
  }

  const evaluations = data.data.evaluations;

  return (
    <div className="p-4">
      <DataTable data={evaluations} columns={columns}>
        <Dialog>
          <DialogTrigger>
            <Button className="h-8 cursor-pointer text-xs" variant={"outline"}>
              New evaluation
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl w-full">
            <Container projectId={projectId} inferenceId={inferenceId} />
          </DialogContent>
        </Dialog>
      </DataTable>
    </div>
  );
}
