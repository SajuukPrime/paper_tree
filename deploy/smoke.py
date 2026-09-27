"""Run against the local server or SSH tunnel: python3 deploy/smoke.py."""
import json
import os
import time
import urllib.request

base = os.environ.get('MODEL_URL', 'http://127.0.0.1:8355/v1').rstrip('/')
key = os.environ.get('MODEL_API_KEY', 'local')
timeout = float(os.environ.get('MODEL_TIMEOUT', '60'))


def request(path, payload=None):
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(base + path, data=data, headers={
        'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.load(response)


models = request('/models')['data']
model = os.environ.get('MODEL_ID') or models[0]['id']
print('Model:', model, flush=True)


def chat(messages, **options):
    start = time.monotonic()
    result = request('/chat/completions', dict(
        model=model, messages=messages, temperature=0.2, max_tokens=1200, **options))
    assert result['choices'][0]['finish_reason'] != 'length', 'Output truncated'
    print(f'Request: {time.monotonic() - start:.1f}s', flush=True)
    return result['choices'][0]['message']


assert 'OK' in chat([{'role': 'system', 'content': 'Reply only OK.'}])['content']
print('PASS system-only Agent request', flush=True)

reply = chat([
    {'role': 'system', 'content': 'Return only JSON, without markdown: {"query": "..."}.'},
    {'role': 'user', 'content': 'Find the paper introducing HorNet. Preserve the term HorNet.'}])
query = json.loads(reply['content'])['query']
assert isinstance(query, str) and 'hornet' in query.lower(), query
print('PASS JSON and academic term preservation', flush=True)

tools = [{'type': 'function', 'function': {
    'name': 'find_paper', 'description': 'Find academic papers by query.',
    'parameters': {'type': 'object', 'properties': {'query': {'type': 'string'}},
                   'required': ['query']}}}]
messages = [
    {'role': 'system', 'content': 'Use find_paper to look up papers before answering.'},
    {'role': 'user', 'content': 'Find the HorNet paper and tell me its arXiv ID.'}]
reply = chat(messages, tools=tools, tool_choice='auto')
calls = reply.get('tool_calls') or []
assert calls, 'No structured tool_calls; plain text is not sufficient'
messages.append({k: reply[k] for k in ('role', 'content', 'tool_calls') if k in reply})
for call in calls:
    assert call['function']['name'] == 'find_paper', call
    args = json.loads(call['function']['arguments'])
    assert 'hornet' in args['query'].lower(), args
    # Controlled fixture tests the protocol; it does not perform a real paper search.
    messages.append({'role': 'tool', 'tool_call_id': call['id'], 'content': json.dumps({
        'title': 'HorNet: Efficient High-Order Spatial Interactions with Recursive Gated Convolutions',
        'arxiv_id': '2207.14284'})})
reply = chat(messages, tools=tools, tool_choice='none')
assert '2207.14284' in (reply.get('content') or ''), reply
print('PASS tool-call round trip; real AI-Q/PDF workflow still needs UI verification')
