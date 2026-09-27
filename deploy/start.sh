#!/usr/bin/env bash
# Run on Spark after weights finish downloading and GPU time is available.
set -euo pipefail
case "${1:-27b}" in
  9b) model=Qwen3.5-9B ;;
  27b) model=Qwen3.8-27B ;;
  *) echo 'Usage: bash deploy/start.sh [9b|27b]' >&2; exit 2 ;;
esac
deploy_dir=$(cd "$(dirname "$0")" && pwd)
model_root=${MODEL_ROOT:-"$HOME/paper-tree-models"}
image=${TRT_IMAGE:-nvcr.io/nvidia/tensorrt-llm/release:1.3.0rc28}
port=${MODEL_PORT:-8355}
# Keep generated templates/caches out of both the repository and original weights.
cache_dir=${MODEL_CACHE:-"$HOME/.cache/paper-tree-inference"}
mkdir -p "$cache_dir"
python3 - "$model_root/$model" "$cache_dir/chat-template.jinja" <<'PY'
import json, pathlib, sys
folder, output = map(pathlib.Path, sys.argv[1:])
if (folder / 'download-manifest.json').exists() and not (folder / 'DOWNLOAD_COMPLETE').exists():
    sys.exit('Model download has not finished.')
config = folder / 'config.json'
assert config.is_file(), f'Missing {config}'
index = json.loads((folder / 'model.safetensors.index.json').read_text())
for shard in set(index['weight_map'].values()):
    assert (folder / shard).is_file(), f'Missing model shard: {shard}'
template = folder / 'chat_template.jinja'
source = template.read_text() if template.exists() else json.loads((folder / 'tokenizer_config.json').read_text())['chat_template']
assert isinstance(source, str), 'Expected a single Qwen chat template'
# Apply to every client, including AI-Q, without changing original model files.
prefix = """{% set enable_thinking = false %}
{% if not messages|selectattr('role', 'equalto', 'user')|list %}
{% set messages = messages + [{'role': 'user', 'content': 'Follow the instructions above.'}] %}
{% endif %}
"""
output.write_text(prefix + source)
PY
# Fixed name prevents accidentally starting two copies. Stop the old one explicitly.
exec docker run --rm --name paper-tree-llm --device nvidia.com/gpu=all --ipc host \
  -p "127.0.0.1:$port:8355" \
  -v "$model_root/$model:/model:ro" \
  -v "$deploy_dir/serve.yml:/config/serve.yml:ro" \
  -v "$cache_dir:/root/.cache" \
  "$image" trtllm-serve /model \
  --host 0.0.0.0 --port 8355 --max_seq_len 8192 \
  --tool_parser qwen3_coder --reasoning_parser auto \
  --chat_template /root/.cache/chat-template.jinja \
  --extra_llm_api_options /config/serve.yml
