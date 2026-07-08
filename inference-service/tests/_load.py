"""Load inference-service source modules by file path.

The evaluation/statistics code lives under ``src/`` and one package is literally
named ``statistics`` (which shadows the stdlib module if put on sys.path). Loading
each module from its file under a unique name sidesteps that collision and needs no
package install — tests run with the stdlib ``unittest`` runner.
"""

import importlib.util
import os

_SRC = os.path.join(os.path.dirname(__file__), "..", "src")


def load(unique_name: str, rel_path: str):
    path = os.path.abspath(os.path.join(_SRC, rel_path))
    spec = importlib.util.spec_from_file_location(unique_name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
