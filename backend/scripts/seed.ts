import { count, eq } from "drizzle-orm";
import * as fs from "fs";
import * as Minio from "minio";
import * as os from "os";
import { ParquetSchema, ParquetWriter } from "parquetjs";
import * as path from "path";
import { z } from "zod/v4";
import { db } from "../src/db";
import {
  dataset as datasetTable,
  integration as integrationTable,
  metric as metricTable,
  model as modelTable,
  NewParsingFunction,
  parsingFunction as parsingFuncTable,
  provider as providerTable,
  task as taskTable,
} from "../src/db/schema";
import { randomId } from "../src/utils/misc";

// TODO: move dataset/task definitions to JSON config files so this script can glob a folder instead.
const tasks = {
  mcq: {
    name: "Multiple Choice Questions",
    datasets: [
      {
        name: "PubMedQA",
        localFileName: "pubmedqa_test.json",
        description:
          "PubMedQA asks biomedical research questions answered as yes / no / maybe using evidence from PubMed abstracts, evaluated with accuracy. It is designed to probe whether models can draw conclusions from scientific evidence without seeing the abstract's conclusion.",
        defaultPrompt:
          "Your task is to answer biomedical questions using the given abstract. Only output yes, no, or maybe as answer.\n\nInput:{{input}}\nOutput:",
      },
      {
        name: "MedQA",
        localFileName: "medqa_test.json",
        description:
          "A multiple-choice medical exam QA dataset derived from real medical-licensing exam questions (USMLE-style), explicitly using the 5-option format and evaluated by accuracy. Commonly used to probe reasoning and knowledge under constrained answer formats.",
        defaultPrompt:
          "Your task is to answer medical questions with the provided choices. Only output the answer option (A/B/C/D) as answer.\n\nInput:{{input}}\nOutput:",
      },
    ],
  },
  ner: {
    name: "Named-entity Recognition",
    datasets: [
      {
        name: "BC5CDR Chemical",
        localFileName: "bc5cdr_chemical_test.json",
        description:
          "The chemical entity recognition slice of the BioCreative V CDR corpus. Labels chemical mentions in PubMed articles and abstracts, evaluated with entity-level F1. Widely distributed via community dataset hubs such as BigBio.",
        defaultPrompt:
          'The task is to extract chemical entities in a sentence. The output is an HTML that highlights all the chemical entities with <span class="chemical">entity</span> in the sentence. Only wrap the chemical entities and return the complete sentence with proper HTML markup.\n\nInput:{{input}}\nOutput:',
        classes: ["chemical"],
      },
      {
        name: "NCBI Disease",
        localFileName: "ncbi_disease_test.json",
        description:
          "A classic disease NER benchmark built from PubMed abstracts annotated at both mention and concept level. Tests domain robustness by mixing naming variability with normalization-friendly annotations, scored with entity-level F1.",
        defaultPrompt:
          'The task is to extract disease entities in a sentence. The output is an HTML that highlights all the disease entities with <span class="disease">entity</span> in the sentence. Only wrap the disease entities and return the complete sentence with proper HTML markup.\n\nInput:{{input}}\nOutput:',
        classes: ["disease"],
      },
    ],
  },
  re: {
    name: "Relation Extraction",
    datasets: [
      {
        name: "ChemProt",
        localFileName: "ChemProt_test.json",
        description:
          "Chemical–protein interaction relation extraction from biomedical abstracts. Models predict relation types between marked chemical/protein mentions, evaluated with macro-F1. A BioCreative VI dataset.",
        defaultPrompt:
          "The task is to classify relations between a chemical and a gene for a sentence. The input is a sentence where the chemical is labeled as @CHEMICAL$ and the gene is labeled as @GENE$ accordingly in a sentence. Your task is to select one out of the six types of relations ('CPR:3', 'CPR:4', 'CPR:5', 'CPR:6', 'CPR:9', and 'false') for the gene and chemical without any explanation or other characters: \n\nCPR:3, which includes UPREGULATOR, ACTIVATOR, and INDIRECT UPREGULATOR \nCPR:4, which includes DOWNREGULATOR, INHIBITOR, and INDIRECT DOWNREGULATOR \nCPR:5, which includes AGONIST, AGONIST ACTIVATOR, and AGONIST INHIBITOR \nCPR:6, which includes ANTAGONIST \nCPR:9, which includes SUBSTRATE, PRODUCT OF and SUBSTRATE PRODUCT OF \nfalse, which indicates no relations\n\nInput:{{input}}\nOutput:",
      },
      {
        name: "DDI2013",
        localFileName: "DDI_test.json",
        description:
          "From the SemEval 2013 DDIExtraction challenge: given biomedical text, detect whether a drug–drug interaction exists and its type. A go-to benchmark for pharmacovigilance-style relation extraction, evaluated with macro-F1.",
        defaultPrompt:
          "The task is to classify relations between two drugs for a sentence. The input is a sentence where the drugs are labeled as @DRUG$. Your task is to select one out of the five types of relations ('DDI-effect', 'DDI-mechanism', 'DDI-advise', 'DDI-false', and 'DDI-int') for the drugs without any explanation or other characters: \n\nDDI-mechanism: This type is used to annotate DDIs that are described by their PK mechanism (e.g. Grepafloxacin may inhibit the metabolism of theobromine) \nDDI-effect: This type is used to annotate DDIs describing an effect (e.g. In uninfected volunteers, 46% developed rash while receiving SUSTIVA and clarithromycin) or a PD mechanism (e.g. Chlorthalidone may potentiate the action of other antihypertensive drugs) \nDDI-advise: This type is used when a recommendation or advice regarding a drug interaction is given (e.g. UROXATRAL should not be used in combination with other alpha-blockers) \nDDI-int: This type is used when a DDI appears in the text without providing any additional information (e.g. The interaction of omeprazole and ketoconazole has been established) \nDDI-false: This type is used when no DDI relation appears\n\nInput:{{input}}\nOutput:",
      },
    ],
  },
  mlc: {
    name: "Multi-label Classification",
    datasets: [
      {
        name: "HoC",
        localFileName: "hoc_test.json",
        description:
          "A multi-label classification benchmark where biomedical text is labeled with one or more of 10 cancer hallmark categories. Evaluated with macro-F1, it is part of the BLUE benchmark ecosystem.",
        defaultPrompt:
          "The task is to perform a semantic classification of the article according to the hallmarks of cancer based on its abstract. The input is an abstract text. \nThere are 10 cancer hallmarks you will need to decide whether the article is related to, including: \nactivating invasion and metastasis \nsustaining proliferative signaling \nresisting cell death \ncellular energetics \ngenomic instability and mutation \nevading growth suppressors \ninducing angiogenesis \nenabling replicative immortality \navoiding immune destruction \ntumor promoting inflammation \nThe output should be topics from the above 10 topics that are related to the input article. Please note one article can be related to multiple topics. Output format: provide a semicolon-separated list of relevant topics.\n\nInput:{{input}}\nOutput:",
        classes: [
          "sustaining proliferative signaling",
          "evading growth suppressors",
          "resisting cell death",
          "enabling replicative immortality",
          "inducing angiogenesis",
          "activating invasion and metastasis",
          "genomic instability and mutation",
          "tumor promoting inflammation",
          "cellular energetics",
          "avoiding immune destruction",
        ],
      },
      {
        name: "LitCovid",
        localFileName: "LitCovid_test.json",
        description:
          "The BioCreative VII LitCovid Track dataset for multi-label topic annotation of COVID-19 literature across 7 topic categories, evaluated with macro-F1.",
        defaultPrompt:
          "The task is to decide relevant COVID-19 topics of the article based on its abstract. The input is an abstract text. There are 7 topics you will need to decide whether the article is related to. The followings are the topics and their definitions. Mechanism: underlying cause(s) of COVID-19 infections and transmission and possible drug mechanism of action. Transmission: characteristics and modes of COVID-19 transmissions. Diagnosis: COVID-19 assessment through symptoms, test results and radiological features for COVID-19. Treatment: treatment strategies, therapeutic procedures and vaccine development for COVID-19. Prevention: prevention, control, mitigation and management strategies for COVID-19. Case Report: descriptions of specific patient cases related to COVID-19. Epidemic Forecasting: estimation on the trend of COVID-19 spread and related modeling approach. The output should be topics from the above 7 topics, that are related to the input article. Please note one article can be related to multiple topics. Output format: provide a semicolon-separated list of relevant topics.\n\nInput:{{input}}\nOutput:",
        classes: [
          "mechanism",
          "transmission",
          "diagnosis",
          "treatment",
          "prevention",
          "case report",
          "epidemic forecasting",
        ],
      },
    ],
  },
  generation: {
    name: "Generation",
    datasets: [
      {
        name: "PubMed",
        localFileName: "pubmed_summarization_test.json",
        description:
          "A long-document summarization benchmark where the input is the paper body and the target is the abstract, evaluated with ROUGE-L. Follows the long-summarization resource lineage (Cohan et al.).",
        defaultPrompt:
          "The task is to summarize an input biomedical literature in six sentences.\n\nInput:{{input}}\nOutput:",
      },
      {
        name: "MS2",
        localFileName: "ms2_valid.json",
        description:
          "A multi-document medical evidence summarization dataset built around systematic reviews and their constituent studies. Tests synthesis across multiple sources with potentially conflicting evidence, evaluated with ROUGE-L.",
        defaultPrompt:
          "The task is to summarize an input biomedical literature in six sentences.\n\nInput:{{input}}\nOutput:",
      },
      {
        name: "Cochrane PLS",
        localFileName: "cochrane_test.json",
        description:
          "Pairs technical clinical review text with plain-language summaries, framed as text simplification and evaluated with ROUGE-L. A canonical distribution is the GEM cochrane-simplification dataset.",
        defaultPrompt:
          "The task is to simplify the input abstract of a biomedical literature.\n\nInput:{{input}}\nOutput:",
      },
      {
        name: "PLOS",
        localFileName: "plos_test.json",
        description:
          "A simplification and lay-summary task built from PLOS journal articles paired with author-written accessible summaries, evaluated with ROUGE-L. Released as part of the EMNLP 2022 Corpora for Lay Summarisation project.",
        defaultPrompt:
          "The task is to simplify the input abstract of a biomedical literature.\n\nInput:{{input}}\nOutput:",
      },
    ],
  },
};

// TODO: migrate metrics config to JSON/DB alongside task definitions
const metrics = {
  accuracy: {
    name: "Accuracy",
    allowedTasks: ["mcq"],
  },
  macro_f1: {
    name: "Macro F1-score",
    allowedTasks: ["mcq", "mlc", "re"],
  },
  weighted_f1: {
    name: "Weighted F1-score",
    allowedTasks: ["mcq", "mlc", "re"],
  },

  exact_match_precision: {
    name: "Exact-match Precision",
    allowedTasks: ["ner"],
  },
  exact_match_recall: {
    name: "Exact-match Recall",
    allowedTasks: ["ner"],
  },
  exact_match_f1: {
    name: "Exact-match F1-score",
    allowedTasks: ["ner"],
  },

  rouge1: {
    name: "ROUGE-1",
    allowedTasks: ["generation"],
  },
  rouge2: {
    name: "ROUGE-2",
    allowedTasks: ["generation"],
  },
  rougeL: {
    name: "ROUGE-L",
    allowedTasks: ["generation"],
  },
  bertscore: {
    name: "BERTScore",
    allowedTasks: ["generation"],
  },
  bartscore: {
    name: "BARTScore",
    allowedTasks: ["generation"],
  },
  meteor: {
    name: "METEOR",
    allowedTasks: ["generation"],
  },
  llm_judge_correctness: {
    name: "LLM Judge: Correctness",
    allowedTasks: ["mcq", "ner", "re", "mlc", "generation"],
  },
  llm_judge_completeness: {
    name: "LLM Judge: Completeness",
    allowedTasks: ["mcq", "ner", "re", "mlc", "generation"],
  },
  llm_judge_relevance: {
    name: "LLM Judge: Relevance",
    allowedTasks: ["mcq", "ner", "re", "mlc", "generation"],
  },
};

// TODO: separate parsing function definitions into individual config files
const parsingFunctions: NewParsingFunction[] = [
  {
    funcId: "extract_first_character",
    name: "Extract First Character",
    parameters: [],
    code: `def extract_first_character(input: str, args) -> str | None:
    """
    Lowercase + strip the input string, then return its first character.
    """
    if not isinstance(input, str):
        return None

    text = input.lower().strip()
    return text[0] if text else None`,
  },

  {
    funcId: "extract_first_word",
    name: "Extract First Word",
    parameters: [],
    code: `def extract_first_word(input: str, args) -> str | None:
    """
    Lowercase + strip the input string, then return its first word.
    """
    if not isinstance(input, str):
        return None

    text = input.lower().strip()
    words = text.split()

    return words[0] if words else None`,
  },

  // Individual MCQ parsers - one per option type, no parameters!
  {
    funcId: "process_mcq_abcde",
    name: "Process MCQ Option: A/B/C/D/E",
    parameters: [],
    code: `def process_mcq_abcde(output: str, args) -> str:
    """
    Extract A/B/C/D/E choice from model output.
    Returns the first character if it's a/b/c/d/e, otherwise "missing".
    
    No configuration needed - this function does one specific thing!
    (The 'args' parameter exists for internal reasons but is not used.)
    """
    if not output or not output.strip():
        return "missing"
    
    output = output.lower().strip()
    return output[0] if output and output[0] in {'a', 'b', 'c', 'd', 'e'} else "missing"`,
  },

  {
    funcId: "process_mcq_abcd",
    name: "Process MCQ Option: A/B/C/D",
    parameters: [],
    code: `def process_mcq_abcd(output: str, args) -> str:
    """
    Extract A/B/C/D choice from model output.
    Returns the first character if it's a/b/c/d, otherwise "missing".
    
    No configuration needed - this function does one specific thing!
    (The 'args' parameter exists for internal reasons but is not used.)
    """
    if not output or not output.strip():
        return "missing"
    
    output = output.lower().strip()
    return output[0] if output and output[0] in {'a', 'b', 'c', 'd'} else "missing"`,
  },

  {
    funcId: "process_mcq_abc",
    name: "Process MCQ Option: A/B/C",
    parameters: [],
    code: `def process_mcq_abc(output: str, args) -> str:
    """
    Extract A/B/C choice from model output.
    Returns the first character if it's a/b/c, otherwise "missing".
    
    No configuration needed - this function does one specific thing!
    (The 'args' parameter exists for internal reasons but is not used.)
    """
    if not output or not output.strip():
        return "missing"
    
    output = output.lower().strip()
    return output[0] if output and output[0] in {'a', 'b', 'c'} else "missing"`,
  },

  {
    funcId: "process_mcq_yes_no_maybe",
    name: "Process MCQ Option: Yes/No/Maybe",
    parameters: [],
    code: `def process_mcq_yes_no_maybe(output: str, args) -> str:
    """
    Extract Yes/No/Maybe choice from model output.
    Searches for 'yes', 'no', or 'maybe' anywhere in the text.
    Returns the first match found, or "missing" if none found.
    
    No configuration needed - this function does one specific thing!
    (The 'args' parameter exists for internal reasons but is not used.)
    """
    if not output or not output.strip():
        return "missing"
    
    output = output.lower()
    for label in ['yes', 'no', 'maybe']:
        if label in output:
            return label
    return "missing"`,
  },

  {
    funcId: "process_mcq_true_false",
    name: "Process MCQ Option: True/False",
    parameters: [],
    code: `def process_mcq_true_false(output: str, args) -> str:
    """
    Extract True/False choice from model output.
    Searches for 'true' or 'false' anywhere in the text.
    Returns the first match found, or "missing" if none found.
    
    No configuration needed - this function does one specific thing!
    (The 'args' parameter exists for internal reasons but is not used.)
    """
    if not output or not output.strip():
        return "missing"
    
    output = output.lower()
    for label in ['true', 'false']:
        if label in output:
            return label
    return "missing"`,
  },

  {
    funcId: "process_mcq_positive_negative",
    name: "Process MCQ Option: Positive/Negative",
    parameters: [],
    code: `def process_mcq_positive_negative(output: str, args) -> str:
    """
    Extract Positive/Negative choice from model output.
    Searches for 'positive' or 'negative' anywhere in the text.
    Returns the first match found, or "missing" if none found.
    
    No configuration needed - this function does one specific thing!
    (The 'args' parameter exists for internal reasons but is not used.)
    """
    if not output or not output.strip():
        return "missing"
    
    output = output.lower()
    for label in ['positive', 'negative']:
        if label in output:
            return label
    return "missing"`,
  },

  {
    funcId: "process_mlc_option",
    name: "Multi-Label Classification",
    parameters: [
      {
        id: "labels",
        name: "Labels",
        schema: z.toJSONSchema(z.string().min(1)),
      },
    ],
    code: `def process_mlc_option(output: str, args) -> str:
    """
    Process model output for multi-label classification by matching labels.
    
    Args:
        output (str): The model output string.
        args (dict): Contains 'labels' - a string of possible labels separated by comma, pipe, or semicolon.
        
    Returns:
        str: Semicolon-separated string of matched labels, or empty string if none found.
        
    Example:
        output = "This article is about treatment and diagnosis"
        args = {"labels": "treatment,diagnosis,prevention"}  # Can also use | or ; as separator
        returns: "treatment;diagnosis"
    """
    if not output or not output.strip():
        return ""
    
    # Get labels string
    label_string = args.get("labels", "")
    
    if not label_string:
        return ""
    
    # Auto-detect delimiter and parse labels
    delimiter = None
    for sep in [";", ",", "|"]:
        if sep in label_string:
            delimiter = sep
            break
    
    if not delimiter:
        raise ValueError(
            f"No valid delimiter found in labels: ''{label_string}''. "
            "Please separate labels with comma (,), pipe (|), or semicolon (;)"
        )
    
    label_list = [label.strip().lower() for label in label_string.split(delimiter)]
    
    output_lower = output.lower()
    
    # Find matching labels
    matched_labels = []
    for label in label_list:
        if label and label in output_lower:
            matched_labels.append(label)
    
    # Return semicolon-separated string (consistent with MLC format)
    return ";".join(matched_labels)`,
  },

  {
    funcId: "process_mlc_option_hoc",
    name: "HoC (Hallmarks of Cancer)",
    parameters: [],
    code: `def process_mlc_option_hoc(output: str, args) -> str:
    """
    Process model output for HoC (Hallmarks of Cancer) dataset.
    Matches 10 cancer hallmark labels in the model output.
    
    Args:
        output (str): The model output string.
        args (dict): Not used - labels are pre-configured.
        
    Returns:
        str: Semicolon-separated string of matched labels, or empty string if none found.
        
    Example:
        output = "This article discusses sustaining proliferative signaling and tumor promoting inflammation"
        returns: "sustaining proliferative signaling;tumor promoting inflammation"
    """
    if not output or not output.strip():
        return ""
    
    # Pre-configured HoC labels
    hoc_labels = [
        "sustaining proliferative signaling",
        "evading growth suppressors",
        "resisting cell death",
        "enabling replicative immortality",
        "inducing angiogenesis",
        "activating invasion and metastasis",
        "genomic instability and mutation",
        "tumor promoting inflammation",
        "cellular energetics",
        "avoiding immune destruction",
    ]
    
    output_lower = output.lower()
    
    # Find matching labels
    matched_labels = []
    for label in hoc_labels:
        if label in output_lower:
            matched_labels.append(label)
    
    # Return semicolon-separated string (consistent with MLC format)
    return ";".join(matched_labels)`,
  },

  {
    funcId: "process_mlc_option_litcovid",
    name: "LitCovid (COVID-19 Topics)",
    parameters: [],
    code: `def process_mlc_option_litcovid(output: str, args) -> str:
    """
    Process model output for LitCovid dataset.
    Matches 7 COVID-19 topic labels in the model output.
    
    Args:
        output (str): The model output string.
        args (dict): Not used - labels are pre-configured.
        
    Returns:
        str: Semicolon-separated string of matched labels, or empty string if none found.
        
    Example:
        output = "This article covers diagnosis and treatment of COVID-19"
        returns: "diagnosis;treatment"
    """
    if not output or not output.strip():
        return ""
    
    # Pre-configured LitCovid labels
    litcovid_labels = [
        "mechanism",
        "transmission",
        "diagnosis",
        "treatment",
        "prevention",
        "case report",
        "epidemic forecasting",
    ]
    
    output_lower = output.lower()
    
    # Find matching labels
    matched_labels = []
    for label in litcovid_labels:
        if label in output_lower:
            matched_labels.append(label)
    
    # Return semicolon-separated string (consistent with MLC format)
    return ";".join(matched_labels)`,
  },

  {
    funcId: "extract_ner_spans",
    name: "Extract NER Spans (Automatic)",
    parameters: [],
    code: `def extract_spans(input: str, args) -> list[tuple[int, int, str]]:
    """
    Extract named entity spans from HTML with <span class="entity_type"> tags.
    This function is automatically applied for NER tasks.
    
    Args:
        input (str): HTML string with entity annotations
        
    Returns:
        list: List of [start_token_idx, end_token_idx, entity_type] spans
        
    Example:
        input = '<span class="chemical">aspirin</span> treats headaches'
        returns: [[0, 0, "chemical"]]
    """
    import re
    
    SPAN_OPEN_RE = re.compile(r'<span\\s+class="([^"]+)">')
    SPAN_CLOSE_RE = re.compile(r"</span>")
    
    # Remove markdown code block markers if present
    input = input.strip()
    if input.startswith("\`\`\`html"):
        input = input[7:]
    if input.startswith("\`\`\`"):
        input = input[3:]
    if input.endswith("\`\`\`"):
        input = input[:-3]
    input = input.strip()
    
    spans = []
    tok_idx = 0
    cur_start = None
    cur_class = None
    
    parts = re.split(r"(<\\/?span[^>]*>)", input)
    
    for part in parts:
        if not part:
            continue
        
        m_open = SPAN_OPEN_RE.fullmatch(part)
        if m_open:
            cur_start = tok_idx
            cur_class = m_open.group(1).lower()
            continue
        
        if SPAN_CLOSE_RE.fullmatch(part):
            if cur_start is not None and cur_class is not None:
                spans.append([cur_start, tok_idx - 1, cur_class])
            cur_start = cur_class = None
            continue
        
        tok_idx += len(part.split())
    
    return spans`,
  },
];

const numeric = (min: number, max?: number) =>
  max === undefined ? z.number().min(min) : z.number().min(min).max(max);

// parameter descriptions generated by llm!
const providers = [
  {
    provider: {
      name: "HuggingFace",
      providerId: "huggingface",
      parameters: [
        {
          id: "max_new_tokens",
          name: "Max new tokens",
          description:
            "Upper limit on how many tokens the model may generate beyond the prompt.",
          schema: z.toJSONSchema(numeric(1)),
          defaultValue: 4096,
        },
        {
          id: "do_sample",
          name: "Enable sampling",
          description:
            "Whether to use sampling (true) or greedy/beam-search decoding (false). When false, temperature/top_k/top_p are ignored and the model uses deterministic decoding.",
          schema: z.toJSONSchema(z.boolean()),
          defaultValue: false,
        },
        {
          id: "temperature",
          name: "Temperature",
          description:
            "Controls randomness; higher values = more diverse, lower = more deterministic. Only used when 'Enable sampling' is true.",
          schema: z.toJSONSchema(numeric(0, 1)),
          defaultValue: 0.7,
        },
        {
          id: "top_k",
          name: "Top K",
          description:
            "At each step sample only from the K highest-probability tokens (0 = disabled). Only used when 'Enable sampling' is true.",
          schema: z.toJSONSchema(numeric(0)),
          defaultValue: 50,
        },
        {
          id: "top_p",
          name: "Top P",
          description:
            "Nucleus sampling: keep the smallest token set whose cumulative prob ≥ P. Only used when 'Enable sampling' is true.",
          schema: z.toJSONSchema(numeric(0, 1)),
          defaultValue: 1.0,
        },
        {
          id: "num_beams",
          name: "Number of beams",
          description:
            "Beam-search width; >1 enables deterministic beam search instead of sampling.",
          schema: z.toJSONSchema(numeric(1)),
          defaultValue: 1,
        },
        {
          id: "repetition_penalty",
          name: "Repetition penalty",
          description:
            "Penalises tokens already present in the output to reduce repetition.",
          schema: z.toJSONSchema(numeric(0)),
          defaultValue: 1.0,
        },
      ],
    },
    models: [
      "meta-llama/Llama-3.1-8B-Instruct",
      "meta-llama/Llama-3.2-1B",
      "meta-llama/Llama-3.2-1B-Instruct",
      "meta-llama/Llama-3.2-3B",
      "meta-llama/Llama-3.2-3B-Instruct",
      "Qwen/Qwen2.5-7B-Instruct",
      "google/medgemma-1.5-4b-it",
      "google/medgemma-4b-it",
    ],
  },
  {
    provider: {
      name: "Azure",
      providerId: "azure",
      parameters: [
        {
          id: "max_tokens",
          name: "Max tokens",
          description:
            "Maximum tokens returned in the completion (chat models).",
          schema: z.toJSONSchema(numeric(1)),
          defaultValue: 4096,
        },
        {
          id: "temperature",
          name: "Temperature",
          description:
            "Controls randomness; higher values = more diverse, lower = more deterministic.",
          schema: z.toJSONSchema(numeric(0, 1)),
          defaultValue: 0,
        },
        {
          id: "top_p",
          name: "Top P",
          description:
            "Nucleus sampling: keep the smallest token set whose cumulative prob ≥ P.",
          schema: z.toJSONSchema(numeric(0, 1)),
          defaultValue: 1.0,
        },
        {
          id: "frequency_penalty",
          name: "Frequency penalty",
          description:
            "Reduces likelihood of tokens that have appeared frequently in the text so far.",
          schema: z.toJSONSchema(numeric(0, 2)),
          defaultValue: 0,
        },
        {
          id: "presence_penalty",
          name: "Presence penalty",
          description:
            "Encourages the model to talk about new topics by penalising tokens already present.",
          schema: z.toJSONSchema(numeric(0, 2)),
          defaultValue: 0,
        },
        {
          id: "reasoning_effort",
          name: "Reasoning effort",
          description:
            "For Azure reasoning models, allowed values are model-specific. gpt-5 uses minimal, low, medium, or high. o1, o3, o3-mini, and o4-mini use low, medium, or high. gpt-5.4 keeps none, low, medium, high, or xhigh.",
          schema: z.toJSONSchema(
            z.enum(["minimal", "none", "low", "medium", "high", "xhigh"])
          ),
          defaultValue: "medium",
        },
      ],
    },
    models: ["gpt-4o", "gpt-5", "gpt-5.4", "o1", "o3", "o3-mini", "o4-mini"],
  },
];

const integrations = [
  {
    provider: "huggingface",
    schema: z.object({
      token: z.string().nonempty(),
    }),
  },
  {
    provider: "azure",
    schema: z.object({
      endpoint: z.string().nonempty(),
      version: z.string().nonempty(),
      apiKey: z.string().nonempty(),
    }),
  },
];

const minioClient = new Minio.Client({
  endPoint: "minio",
  port: 9000,
  useSSL: false,
  accessKey: process.env.MINIO_ROOT_USER,
  secretKey: process.env.MINIO_ROOT_PASSWORD,
});

const requiredKeys = ["id", "input_raw", "reference"];
const assertKeys = (obj: Record<string, unknown>) => {
  for (const key of requiredKeys) {
    if (!(key in obj)) throw new Error(`dataset row missing required key: ${key}`);
  }
};

// TODO: normalisation should be applied to the source JSON files before seeding rather than at import time
function normalize(value) {
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  } else if (typeof value === "string") {
    return value;
  } else {
    throw new Error(`value ${value} is unhandled type ${typeof value}`);
  }
}

async function uploadDataset(
  dataset: {
    name: string;
    localFileName: string;
  },
  datasetId: string,
  existingObjectKey?: string
) {
  const localPath = `./scripts/datasets/${dataset.localFileName}`;
  const objectKey = existingObjectKey ?? `${datasetId}.parquet`;

  const jsonData = JSON.parse(fs.readFileSync(localPath, "utf8"));
  const tempPath = path.join(os.tmpdir(), `${datasetId}_${Date.now()}.parquet`);

  const schema = new ParquetSchema({
    id: { type: "UTF8" },
    input: { type: "UTF8" },
    reference: { type: "UTF8" },
  });

  const writer = await ParquetWriter.openFile(schema, tempPath);
  for (const row of jsonData) {
    assertKeys(row);

    const input = normalize(row.input_raw);
    const reference = normalize(row.reference);
    await writer.appendRow({
      id: String(row.id),
      input,
      reference,
    });
  }

  await writer.close();

  const result = await minioClient.fPutObject("dataset", objectKey, tempPath);
  console.log(
    `uploaded object ${objectKey} to bucket dataset from file ${tempPath}`
  );
  console.log(result);
  fs.unlinkSync(tempPath);

  return objectKey;
}

async function seedDatabase() {
  const [{ count: rowCount }] = await db
    .select({
      count: count(),
    })
    .from(taskTable);
  if (rowCount > 0) {
    console.log("database already seeded");
    return;
  }

  for (const [taskId, task] of Object.entries(tasks)) {
    await db.insert(taskTable).values({
      id: taskId,
      name: task.name,
    });

    for (const dataset of task.datasets) {
      const datasetId = randomId(12);
      const objectKey = await uploadDataset(dataset, datasetId);

      await db.insert(datasetTable).values({
        datasetId,
        name: dataset.name,
        description: dataset["description"],
        defaultPrompt: dataset.defaultPrompt,
        taskId,
        objectKey,
        isPublic: true,
        classes: dataset["classes"],
      });
    }
  }

  for (const [metricId, metric] of Object.entries(metrics)) {
    for (const taskId of metric.allowedTasks) {
      await db.insert(metricTable).values({
        metricId,
        name: metric.name,
        taskId,
      });
    }
  }

  for (const parsingFunc of parsingFunctions) {
    await db.insert(parsingFuncTable).values(parsingFunc);
  }

  for (const provider of providers) {
    await db.insert(providerTable).values(provider.provider);
    for (const model of provider.models) {
      await db.insert(modelTable).values({
        name: model,
        providerId: provider.provider.providerId,
      });
    }
  }

  for (const integration of integrations) {
    await db.insert(integrationTable).values({
      providerId: integration.provider,
      schema: z.toJSONSchema(integration.schema),
    });
  }

  console.log(
    `done seeding database. inserted ${Object.keys(tasks).length} tasks, ${
      Object.values(tasks)
        .map((t) => t.datasets)
        .flat().length
    } datasets, ${Object.values(metrics).reduce(
      (sum, m) => sum + m.allowedTasks.length,
      0
    )} task-metric links, ${parsingFunctions.length} parsing functions, ${
      providers.length
    } providers`
  );
}

/** Re-upload dataset JSON files to MinIO for existing dataset rows (sync after editing files in scripts/datasets). */
async function reseedDatasets() {
  const allDatasets = Object.values(tasks).flatMap((t) => t.datasets);
  for (const dataset of allDatasets) {
    const rows = await db
      .select({ datasetId: datasetTable.datasetId, objectKey: datasetTable.objectKey })
      .from(datasetTable)
      .where(eq(datasetTable.name, dataset.name));
    if (rows.length === 0) {
      console.log(`skip ${dataset.name}: no row in DB`);
      continue;
    }
    const { datasetId, objectKey } = rows[0];
    await uploadDataset(dataset, datasetId, objectKey);
  }
  console.log("reseed datasets done.");
}

/** Update descriptions of existing dataset rows in the DB to match the definitions above. */
async function updateDescriptions() {
  const allDatasets = Object.values(tasks).flatMap((t) => t.datasets);
  for (const dataset of allDatasets) {
    const rows = await db
      .select({ datasetId: datasetTable.datasetId })
      .from(datasetTable)
      .where(eq(datasetTable.name, dataset.name));
    if (rows.length === 0) {
      console.log(`skip ${dataset.name}: no row in DB`);
      continue;
    }
    await db
      .update(datasetTable)
      .set({ description: dataset["description"] })
      .where(eq(datasetTable.datasetId, rows[0].datasetId));
    console.log(`updated description for ${dataset.name}`);
  }
  console.log("update descriptions done.");
}

async function seed() {
  if (process.argv.includes("--datasets-only") || process.env.RESEED_DATASETS_ONLY === "1") {
    await reseedDatasets();
    process.exit(0);
  }
  if (process.argv.includes("--update-descriptions")) {
    await updateDescriptions();
    process.exit(0);
  }
  await seedDatabase();
}

seed();
