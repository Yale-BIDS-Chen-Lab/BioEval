import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { EllipsisVertical, Plus } from "lucide-react";
import { AddModelPopup } from "./add-model";


function SelectModels({ form, providers }: { form: any; providers: any }) {
  return (
    <FormField
      control={form.control}
      name="models"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Models</FormLabel>
          <FormControl>
            <div className="space-y-2">
              {field.value.length > 0 && (
                <div className="space-y-2">
                  {field.value.map((m: any, idx: number) => (
                    <div
                      key={idx}
                      className="flex items-center gap-4 rounded-md border p-2 text-sm"
                    >
                      <img
                        src={`/logos/${m.provider}.svg`}
                        alt="Provider logo"
                        width={24}
                        height={24}
                        className="select-none"
                      />
                      <span>{m.model}</span>
                      {/* <div className="ml-auto cursor-pointer">
                        <EllipsisVertical className="h-4" />
                      </div> */}
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-4">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button className="w-full cursor-pointer" variant="outline">
                      <Plus />
                      <span>Add Model</span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="w-128 p-4">
                    <AddModelPopup
                      onAdd={(newModel: string) => {
                        form.setValue("models", [...field.value, newModel], {
                          shouldValidate: true,
                        });
                      }}
                      form={form}
                      providers={providers}
                    />
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    ></FormField>
  );
}

export { SelectModels };
