import re


def extract_first_character(input: str, args) -> str | None:
    """
    Lowercase + strip the input string, then return its first character.
    """
    if not isinstance(input, str):
        return None

    text = input.lower().strip()
    return text[0] if text else None

def extract_first_word(input: str, args) -> str | None:
    """
    Lowercase + strip the input string, then return its first word.
    """
    if not isinstance(input, str):
        return None

    text = input.lower().strip()
    words = text.split()

    return words[0] if words else None


# Individual MCQ option parsers - no parameters needed!
def process_mcq_abcde(output: str, args) -> str:
    """
    Extract A/B/C/D/E choice from model output.
    Returns the first character if it's a/b/c/d/e, otherwise "missing".
    """
    if not output or not output.strip():
        return "missing"
    
    output = output.lower().strip()
    return output[0] if output and output[0] in {'a', 'b', 'c', 'd', 'e'} else "missing"


def process_mcq_abcd(output: str, args) -> str:
    """
    Extract A/B/C/D choice from model output.
    Returns the first character if it's a/b/c/d, otherwise "missing".
    """
    if not output or not output.strip():
        return "missing"
    
    output = output.lower().strip()
    return output[0] if output and output[0] in {'a', 'b', 'c', 'd'} else "missing"


def process_mcq_abc(output: str, args) -> str:
    """
    Extract A/B/C choice from model output.
    Returns the first character if it's a/b/c, otherwise "missing".
    """
    if not output or not output.strip():
        return "missing"
    
    output = output.lower().strip()
    return output[0] if output and output[0] in {'a', 'b', 'c'} else "missing"


def process_mcq_yes_no_maybe(output: str, args) -> str:
    """
    Extract Yes/No/Maybe choice from model output.
    Searches for 'yes', 'no', or 'maybe' anywhere in the text.
    Returns the first match found, or "missing" if none found.
    """
    if not output or not output.strip():
        return "missing"
    
    output = output.lower()
    for label in ['yes', 'no', 'maybe']:
        if label in output:
            return label
    return "missing"


def process_mcq_true_false(output: str, args) -> str:
    """
    Extract True/False choice from model output.
    Searches for 'true' or 'false' anywhere in the text.
    Returns the first match found, or "missing" if none found.
    """
    if not output or not output.strip():
        return "missing"
    
    output = output.lower()
    for label in ['true', 'false']:
        if label in output:
            return label
    return "missing"


def process_mcq_positive_negative(output: str, args) -> str:
    """
    Extract Positive/Negative choice from model output.
    Searches for 'positive' or 'negative' anywhere in the text.
    Returns the first match found, or "missing" if none found.
    """
    if not output or not output.strip():
        return "missing"
    
    output = output.lower()
    for label in ['positive', 'negative']:
        if label in output:
            return label
    return "missing"


# Legacy function kept for backward compatibility
def process_mcq_option(output: str, args) -> str:
    """
    Legacy unified MCQ processor - kept for backward compatibility.
    Use specific functions above for clearer behavior.
    """
    if not output or not output.strip():
        return "missing"
    
    output = output.lower().strip()
    option_type = args.get("option_type", "A, B, C, D")  # Default to A, B, C, D
    
    if option_type == "A, B, C, D, E":
        # Look for first character a, b, c, d, e
        return output[0] if output and output[0] in {'a', 'b', 'c', 'd', 'e'} else "missing"
    elif option_type == "A, B, C, D":
        # Look for first character a, b, c, d
        return output[0] if output and output[0] in {'a', 'b', 'c', 'd'} else "missing"
    elif option_type == "A, B, C":
        # Look for first character a, b, c
        return output[0] if output and output[0] in {'a', 'b', 'c'} else "missing"
    elif option_type == "Yes, No, Maybe":
        # Look for substring yes, no, maybe anywhere in text
        for label in ['yes', 'no', 'maybe']:
            if label in output:
                return label
        return "missing"
    elif option_type == "True, False":
        # Look for substring true, false anywhere in text
        for label in ['true', 'false']:
            if label in output:
                return label
        return "missing"
    elif option_type == "Positive, Negative":
        # Look for substring positive, negative anywhere in text
        for label in ['positive', 'negative']:
            if label in output:
                return label
        return "missing"
    else:
        return "missing"

# def extract_first_word(input: str, args) -> str | None:
#   words = input.split(args["delimiter"])
#   return words[0] if len(words) > 0 else None


def process_mlc_option(output: str, args) -> str:
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
            f"No valid delimiter found in labels: '{label_string}'. "
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
    return ";".join(matched_labels)


def process_mlc_option_hoc(output: str, args) -> str:
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
    return ";".join(matched_labels)


def process_mlc_option_litcovid(output: str, args) -> str:
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
    return ";".join(matched_labels)


SPAN_OPEN_RE = re.compile(r'<span\s+class="([^"]+)">')
SPAN_CLOSE_RE = re.compile(r"</span>")


def extract_spans(input: str, args) -> list[tuple[int, int, str]]:
  # Remove markdown code block markers if present
  input = input.strip()
  if input.startswith("```html"):
    input = input[7:]  # Remove ```html
  if input.startswith("```"):
    input = input[3:]  # Remove ```
  if input.endswith("```"):
    input = input[:-3]  # Remove trailing ```
  input = input.strip()
  
  spans = []
  tok_idx = 0
  cur_start = None
  cur_class = None

  parts = re.split(r"(<\/?span[^>]*>)", input)

  for part in parts:
    if not part:
      continue

    m_open = SPAN_OPEN_RE.fullmatch(part)
    if m_open:
      cur_start = tok_idx
      cur_class = m_open.group(1).lower()  # Convert to lowercase for case-insensitive matching
      continue

    if SPAN_CLOSE_RE.fullmatch(part):
      if cur_start is not None and cur_class is not None:
        spans.append([cur_start, tok_idx - 1, cur_class])
      cur_start = cur_class = None
      continue

    tok_idx += len(part.split())

  return spans
