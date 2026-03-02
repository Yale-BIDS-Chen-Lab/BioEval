import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Settings } from "lucide-react";
import { useState } from "react";

const RUBRICS: Record<string, string> = {
  correctness: `You are an expert medical evaluator. Rate the following model output on a scale of 1-{{scale}} for CORRECTNESS.

Evaluation Criteria:
- 1: Completely incorrect, contains significant factual errors
- 2: Mostly incorrect with major inaccuracies
- 3: Partially correct but has notable errors
- 4: Mostly correct with minor issues
- 5: Completely accurate and factually correct

Reference Answer: {{reference}}
Model Output: {{output}}

Output ONLY a number from 1 to {{scale}}.`,
  
  completeness: `You are an expert medical evaluator. Rate the following model output on a scale of 1-{{scale}} for COMPLETENESS.

Evaluation Criteria:
- 1: Severely incomplete, missing most key information
- 2: Incomplete, missing several important details
- 3: Somewhat complete but lacks some important information
- 4: Mostly complete with minor omissions
- 5: Fully complete, addresses all aspects comprehensively

Reference Answer: {{reference}}
Model Output: {{output}}

Output ONLY a number from 1 to {{scale}}.`,
  
  relevance: `You are an expert medical evaluator. Rate the following model output on a scale of 1-{{scale}} for RELEVANCE.

Evaluation Criteria:
- 1: Completely off-topic, does not address the question
- 2: Mostly irrelevant with tangential information
- 3: Somewhat relevant but lacks focus
- 4: Relevant and addresses the main points
- 5: Highly relevant, directly addresses all aspects

Reference Answer: {{reference}}
Model Output: {{output}}

Output ONLY a number from 1 to {{scale}}.`,
};

const getDefaultPrompt = (criterion: string) => RUBRICS[criterion];

const DEFAULT_CONFIG_BASE = {
  model: "gpt-4o",
  temperature: 0.0,
  maxTokens: 256,
  scale: 5,
};

export function getDefaultConfig(criterion: string) {
  return { ...DEFAULT_CONFIG_BASE, prompt: getDefaultPrompt(criterion) };
}

export function ConfigureLLMJudge({ metricId, form, initialConfig }: { metricId: string; form: any; initialConfig?: any }) {
  const criterion = metricId.replace("llm_judge_", "");
  const defaultConfig = getDefaultConfig(criterion);
  
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState(initialConfig || defaultConfig);

  const handleSave = () => {
    // Remove temperature from config if using GPT-5
    const configToSave = config.model === "gpt-5" 
      ? { ...config, temperature: undefined } 
      : config;
    form.setValue(`llmJudgeConfig.${metricId}`, configToSave);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[850px] max-h-[90vh] overflow-y-auto p-8">
        <DialogHeader className="pb-8">
          <DialogTitle className="text-2xl font-semibold">Configure LLM Judge: {criterion}</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          <div className="space-y-3">
            <Label className="text-base font-medium">Model</Label>
            <Select value={config.model} onValueChange={(v) => setConfig({ ...config, model: v })}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                <SelectItem value="gpt-5">GPT-5</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {config.model !== "gpt-5" && (
            <div className="space-y-3">
              <Label className="text-base font-medium">Temperature</Label>
              <Input type="number" step="0.1" min="0" max="2" value={config.temperature} onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })} className="h-11" />
            </div>
          )}
          <div className="space-y-3">
            <Label className="text-base font-medium">Max Tokens</Label>
            <Input type="number" min="1" value={config.maxTokens} onChange={(e) => setConfig({ ...config, maxTokens: parseInt(e.target.value) })} className="h-11" />
          </div>
          <div className="space-y-3">
            <Label className="text-base font-medium">Rating Scale (1 to N)</Label>
            <Input type="number" min="1" max="10" value={config.scale} onChange={(e) => setConfig({ ...config, scale: parseInt(e.target.value) })} className="h-11" />
          </div>
          <div className="space-y-3">
            <Label className="text-base font-medium">Evaluation Prompt</Label>
            <Textarea value={config.prompt} onChange={(e) => setConfig({ ...config, prompt: e.target.value })} className="h-72 font-mono text-sm p-4 leading-relaxed" placeholder="Enter your custom evaluation prompt..." />
          </div>
        </div>
        <DialogFooter className="gap-3 pt-8">
          <Button variant="outline" onClick={() => setConfig(defaultConfig)} className="h-11 px-6">Reset to Default</Button>
          <Button onClick={handleSave} className="h-11 px-6">Save Configuration</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
