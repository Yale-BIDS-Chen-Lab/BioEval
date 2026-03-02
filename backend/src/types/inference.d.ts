export type Provider = {
  name: string;
  models: string[];
};

export type Status = "pending" | "processing" | "done" | "failed" | "canceled";
