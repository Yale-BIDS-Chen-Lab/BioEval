from typing import Any, Callable, Dict
from numpy.typing import NDArray

def is_gpt5_family(model: str) -> bool:
    return model.lower().startswith("gpt-5")


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
        max_tokens = config.get("maxTokens", 256)
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
            
            score_text = response.choices[0].message.content.strip()
            score = float(score_text)
            scores.append(score)

        return scores
    return judge
