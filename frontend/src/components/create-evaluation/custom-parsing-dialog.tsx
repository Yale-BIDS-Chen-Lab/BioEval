import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Code2, Sparkles, Info, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { axios } from "@/lib/axios";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";

const TEMPLATE_CODE = `def parse(output: str, args: dict) -> str:
    """
    Custom parsing function.
    
    Args:
        output (str): The raw model output
        args (dict): Optional arguments passed from evaluation config
    
    Returns:
        str: The parsed output
    
    Examples:
        # Extract first word
        return output.split()[0] if output else ""
        
        # Use regex to extract pattern
        import re
        match = re.search(r'Answer: (\\w+)', output)
        return match.group(1) if match else ""
        
        # Clean and lowercase
        return output.strip().lower()
    """
    # Write your parsing logic here
    return output.strip()
`;

export function CustomParsingDialog({ onSuccess }: { onSuccess?: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState(TEMPLATE_CODE);
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; code: string }) => {
      const response = await axios.post("api/parsing/create", data, {
        withCredentials: true,
      });
      return response.data;
    },
    onSuccess: () => {
      toast.success("Custom parsing function created!");
      queryClient.invalidateQueries({ queryKey: ["evaluation-options"] });
      setOpen(false);
      setName("");
      setCode(TEMPLATE_CODE);
      onSuccess?.();
    },
    onError: (error: any) => {
      toast.error(
        error.response?.data?.error || "Failed to create parsing function"
      );
    },
  });

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error("Please enter a function name");
      return;
    }
    if (!code.trim()) {
      toast.error("Please enter function code");
      return;
    }
    createMutation.mutate({ name: name.trim(), code: code.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-2 hover:border-purple-500 hover:text-purple-600 dark:hover:text-purple-400 transition-colors">
          <Sparkles className="h-4 w-4" />
          Create Custom Function
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0">
        {/* Header Section */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 text-white shadow-lg">
              <Code2 className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-2xl font-semibold mb-1">
                Create Custom Parsing Function
              </DialogTitle>
              <DialogDescription className="text-base">
                Write a Python function to transform model outputs before evaluation.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Content Section */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Info Alert */}
          <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-900">
            <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <AlertDescription className="text-sm text-blue-800 dark:text-blue-300 leading-relaxed">
              Define a function named <code className="bg-blue-100 dark:bg-blue-900 px-1.5 py-0.5 rounded font-mono text-xs whitespace-nowrap">parse(output: str, args: dict)</code> that returns a string.
            </AlertDescription>
          </Alert>

          {/* Function Name Input */}
          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm font-semibold flex items-center gap-2">
              Function Name
              <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              placeholder="e.g., Extract MCQ Answer from Output"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 text-base"
            />
            <p className="text-xs text-muted-foreground">
              Give your function a descriptive name to identify it later
            </p>
          </div>

          {/* Code Editor */}
          <div className="space-y-2 flex-1">
            <Label htmlFor="code" className="text-sm font-semibold flex items-center gap-2">
              Python Implementation
              <span className="text-red-500">*</span>
            </Label>
            <div className="relative rounded-lg border bg-slate-950 overflow-hidden">
              <div className="absolute top-3 right-3 flex items-center gap-2">
                <span className="text-xs text-slate-400 font-mono">Python</span>
              </div>
              <Textarea
                id="code"
                placeholder="Write your parsing function..."
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="font-mono text-sm resize-none min-h-[320px] bg-transparent border-0 text-slate-50 placeholder:text-slate-500 focus-visible:ring-0 pt-10 px-4"
                spellCheck={false}
              />
            </div>
          </div>

          {/* Tips Section */}
          <div className="rounded-lg border bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <div className="h-6 w-6 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
              <div className="flex-1 space-y-2">
                <p className="font-semibold text-sm">Best Practices</p>
                <ul className="space-y-1.5 text-xs text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-600 dark:text-emerald-400 mt-0.5">•</span>
                    <span>Use <code className="bg-background px-1 rounded">import re</code> for pattern matching with regex</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-600 dark:text-emerald-400 mt-0.5">•</span>
                    <span>Return a string (convert other types if needed)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-600 dark:text-emerald-400 mt-0.5">•</span>
                    <span>Test with edge cases: empty strings, special characters, long text</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Section */}
        <DialogFooter className="px-6 py-4 border-t bg-slate-50 dark:bg-slate-900/50">
          <Button 
            variant="outline" 
            onClick={() => setOpen(false)}
            className="px-6"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending || !name.trim() || !code.trim()}
            className="px-6 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-md"
          >
            {createMutation.isPending ? "Creating..." : "Create Function"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

