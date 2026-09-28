# Workers

Types:

```python
from brainbase.types import (
    WorkerCreateResponse,
    WorkerRetrieveResponse,
    WorkerUpdateResponse,
    WorkerListResponse,
)
```

Methods:

- <code title="post /api/workers">client.workers.<a href="./src/brainbase/resources/workers/workers.py">create</a>(\*\*<a href="src/brainbase/types/worker_create_params.py">params</a>) -> <a href="./src/brainbase/types/worker_create_response.py">WorkerCreateResponse</a></code>
- <code title="get /api/workers/{id}">client.workers.<a href="./src/brainbase/resources/workers/workers.py">retrieve</a>(id) -> <a href="./src/brainbase/types/worker_retrieve_response.py">WorkerRetrieveResponse</a></code>
- <code title="post /api/workers/{id}">client.workers.<a href="./src/brainbase/resources/workers/workers.py">update</a>(id, \*\*<a href="src/brainbase/types/worker_update_params.py">params</a>) -> <a href="./src/brainbase/types/worker_update_response.py">WorkerUpdateResponse</a></code>
- <code title="get /api/workers">client.workers.<a href="./src/brainbase/resources/workers/workers.py">list</a>() -> <a href="./src/brainbase/types/worker_list_response.py">WorkerListResponse</a></code>
- <code title="delete /api/workers/{id}">client.workers.<a href="./src/brainbase/resources/workers/workers.py">delete</a>(id) -> None</code>

## Deployments

### Voice

Types:

```python
from brainbase.types.workers.deployments import (
    VoiceCreateResponse,
    VoiceRetrieveResponse,
    VoiceUpdateResponse,
    VoiceListResponse,
)
```

Methods:

- <code title="post /api/workers/{workerId}/deployments/voice">client.workers.deployments.voice.<a href="./src/brainbase/resources/workers/deployments/voice.py">create</a>(worker_id, \*\*<a href="src/brainbase/types/workers/deployments/voice_create_params.py">params</a>) -> <a href="./src/brainbase/types/workers/deployments/voice_create_response.py">VoiceCreateResponse</a></code>
- <code title="get /api/workers/{workerId}/deployments/voice/{deploymentId}">client.workers.deployments.voice.<a href="./src/brainbase/resources/workers/deployments/voice.py">retrieve</a>(deployment_id, \*, worker_id) -> <a href="./src/brainbase/types/workers/deployments/voice_retrieve_response.py">VoiceRetrieveResponse</a></code>
- <code title="put /api/workers/{workerId}/deployments/voice/{deploymentId}">client.workers.deployments.voice.<a href="./src/brainbase/resources/workers/deployments/voice.py">update</a>(deployment_id, \*, worker_id, \*\*<a href="src/brainbase/types/workers/deployments/voice_update_params.py">params</a>) -> <a href="./src/brainbase/types/workers/deployments/voice_update_response.py">VoiceUpdateResponse</a></code>
- <code title="get /api/workers/{workerId}/deployments/voice">client.workers.deployments.voice.<a href="./src/brainbase/resources/workers/deployments/voice.py">list</a>(worker_id) -> <a href="./src/brainbase/types/workers/deployments/voice_list_response.py">VoiceListResponse</a></code>
- <code title="delete /api/workers/{workerId}/deployments/voice/{deploymentId}">client.workers.deployments.voice.<a href="./src/brainbase/resources/workers/deployments/voice.py">delete</a>(deployment_id, \*, worker_id) -> None</code>

## Flows

Types:

```python
from brainbase.types.workers import (
    FlowCreateResponse,
    FlowRetrieveResponse,
    FlowUpdateResponse,
    FlowListResponse,
)
```

Methods:

- <code title="post /api/workers/{workerId}/flows">client.workers.flows.<a href="./src/brainbase/resources/workers/flows.py">create</a>(worker_id, \*\*<a href="src/brainbase/types/workers/flow_create_params.py">params</a>) -> <a href="./src/brainbase/types/workers/flow_create_response.py">FlowCreateResponse</a></code>
- <code title="get /api/workers/{workerId}/flows/{flowId}">client.workers.flows.<a href="./src/brainbase/resources/workers/flows.py">retrieve</a>(flow_id, \*, worker_id) -> <a href="./src/brainbase/types/workers/flow_retrieve_response.py">FlowRetrieveResponse</a></code>
- <code title="put /api/workers/{workerId}/flows/{flowId}">client.workers.flows.<a href="./src/brainbase/resources/workers/flows.py">update</a>(flow_id, \*, worker_id, \*\*<a href="src/brainbase/types/workers/flow_update_params.py">params</a>) -> <a href="./src/brainbase/types/workers/flow_update_response.py">FlowUpdateResponse</a></code>
- <code title="get /api/workers/{workerId}/flows">client.workers.flows.<a href="./src/brainbase/resources/workers/flows.py">list</a>(worker_id) -> <a href="./src/brainbase/types/workers/flow_list_response.py">FlowListResponse</a></code>
- <code title="delete /api/workers/{workerId}/flows/{flowId}">client.workers.flows.<a href="./src/brainbase/resources/workers/flows.py">delete</a>(flow_id, \*, worker_id) -> None</code>
