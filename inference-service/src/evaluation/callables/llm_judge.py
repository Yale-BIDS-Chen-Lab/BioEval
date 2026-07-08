import re
from typing import Any, Callable, Dict
from numpy.typing import NDArray

def is_gpt5_family(model: str) -> bool:
    return model.lower().startswith("gpt-5")


def parse_judge_score(text: str | None, scale: float) -> float | None:
    """Extract a numeric rating from a judge reply, clamped to [1, scale].

    Judges frequently wrap the number in prose ("Rating: 4/5"), and reasoning
    models can return empty/None content, so we take the first number rather than
    float() the whole string. Returns None when no number is found so callers can
    fall back instead of raising and failing the entire evaluation.
    """
    if not text:
        return None
    match = re.search(r"[-+]?\d*\.?\d+", text)
    if not match:
        return None
    try:
        value = float(match.group())
    except ValueError:
        return None
    return max(1.0, min(float(scale), value))


def get_reasoning_effort_options(model: str) -> set[str]:
    normalized = model.lower()
    if normalized == "gpt-5":
        return {"minimal", "low", "medium", "high"}

    return {"none", "low", "medium", "high", "xhigh"}


def llm_judge_metric(
    criterion: str,
    api_key: str | None,
    azure_config: Dict[str, str] | None,
    config: Dict[str, Any],
) -> Callable[[NDArray[Any], NDArray[Any]], list[float]]:
    def judge(predictions: NDArray[Any], references: NDArray[Any]) -> list[float]:
        if not api_key or not azure_config:
            raise ValueError(f"Azure OpenAI configuration required for LLM judge ({criterion}). Please configure Azure OpenAI in Settings.")
        if "prompt" not in config:
            raise ValueError(f"Prompt configuration required for LLM judge ({criterion}).")

        from openai import AzureOpenAI

        client = AzureOpenAI(
            api_version=azure_config["version"],
            azure_endpoint=azure_config["endpoint"],
            api_key=api_key,
        )
        model = config.get("model", "gpt-4o")
        temperature = config.get("temperature", 0.0)
        max_tokens = config.get("maxTokens", 4096)
        reasoning_effort = config.get("reasoningEffort")
        scale = config.get("scale", 5)
        prompt_template = config["prompt"]

        scores = []
        for pred, ref in zip(predictions, references):
            pred_str = str(pred).strip()
            if not pred_str:
                scores.append(1.0)
                continue
            prompt = prompt_template.replace("{{reference}}", str(ref)).replace("{{output}}", pred_str).replace("{{criterion}}", criterion).replace("{{scale}}", str(scale))
            
            # GPT-5 family models use max_completion_tokens and optional reasoning_effort.
            if is_gpt5_family(model):
                kwargs: Dict[str, Any] = {
                    "max_completion_tokens": max_tokens,
                }
                if reasoning_effort:
                    allowed_efforts = get_reasoning_effort_options(model)
                    if reasoning_effort not in allowed_efforts:
                        raise ValueError(
                            f"reasoningEffort '{reasoning_effort}' is not supported for {model}."
                        )
                    kwargs["reasoning_effort"] = reasoning_effort
                response = client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": "You are a medical evaluation expert. Respond only with a numeric rating."},
                        {"role": "user", "content": prompt}
                    ],
                    **kwargs,
                )
            else:
                response = client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": "You are a medical evaluation expert. Respond only with a numeric rating."},
                        {"role": "user", "content": prompt}
                    ],
                    temperature=temperature,
                    max_tokens=max_tokens,
                )
            
            content = response.choices[0].message.content
            score = parse_judge_score(content, scale)
            if score is None:
                print(
                    f"[llm_judge:{criterion}] could not parse a numeric score from "
                    f"response {content!r}; falling back to 1.0"
                )
                score = 1.0
            scores.append(score)

        return scores
    return judge
