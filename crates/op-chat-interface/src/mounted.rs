//! Container-side access to the base's canonical, identity-bound FUSE client.
//! Every invocation writes once and reads the receipt from the same descriptor.
//! No socket, credential, subprocess, alternate mount, or automatic replay.
use std::{collections::BTreeSet, path::Path, sync::Arc, time::Duration};
use _3tched_fs::{mounted::{IdentityMode, MountedNamespace}, namespace::encode_component};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use crate::{errors::{ErrorKind, TypedError}, guard::SecretGuard};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BoundIdentity {
    pub principal_id: String,
    pub session_id: String,
    pub genesis: String,
}

pub struct MountedBackend {
    namespace: Arc<MountedNamespace>,
    identity: BoundIdentity,
    guard: Arc<SecretGuard>,
}

impl MountedBackend {
    pub fn open(path: &Path, guard: Arc<SecretGuard>) -> Result<Self, TypedError> {
        // GuestKernel is the kernel-attributed container path. Host-session and
        // credential mounts cannot stand in for a container's own identity.
        let namespace = MountedNamespace::open_for_identity_mode(path, IdentityMode::GuestKernel, None)
            .map_err(|_| TypedError::new(ErrorKind::MissingMount, "container 3tchedFS"))?;
        let receipt = invoke(&namespace, "identity_sled", "get_own_identity", json!({}), false)?;
        let result = &receipt["result"]["result"];
        let field = |value: &Value| value.as_str().filter(|text| !text.is_empty())
            .map(str::to_owned).ok_or_else(|| TypedError::new(ErrorKind::Denial, "mounted identity"));
        let identity = BoundIdentity {
            principal_id: field(&result["principal_id"])?,
            session_id: field(&result["identity"]["session_id"])?,
            genesis: field(&result["identity"]["genesis"])?,
        };
        Ok(Self { namespace: Arc::new(namespace), identity, guard })
    }

    pub fn identity(&self) -> &BoundIdentity { &self.identity }

    pub fn schema(&self, plugin: &str) -> Result<Value, TypedError> {
        let schema = self.namespace.schema(plugin)
            .map_err(|_| TypedError::new(ErrorKind::Schema, "mounted plugin declaration"))?;
        serde_json::to_value(schema).map_err(|_| TypedError::new(ErrorKind::Schema, "mounted schema"))
    }

    pub fn state(&self, plugin: &str) -> Result<Value, TypedError> {
        self.namespace.state(plugin)
            .map_err(|_| TypedError::new(ErrorKind::UnknownOutcome, "authoritative state read-back"))
    }

    pub fn describe(&self) -> Result<Value, TypedError> {
        let identity = invoke(&self.namespace, "identity_sled", "get_own_identity", json!({}), false)?;
        let capabilities: BTreeSet<String> = serde_json::from_value(
            identity["result"]["result"]["held_capabilities"].clone())
            .map_err(|_| TypedError::new(ErrorKind::Schema, "held capabilities"))?;
        let mut description = self.namespace.describe(None)
            .map_err(|_| TypedError::new(ErrorKind::Schema, "mounted operation declarations"))?;
        let methods = description["methods"].as_array_mut()
            .ok_or_else(|| TypedError::new(ErrorKind::Schema, "mounted methods"))?;
        methods.retain(|method| method["declaration"]["required_capability"].as_str()
            .is_none_or(|capability| capabilities.contains(capability)));
        Ok(description)
    }

    pub async fn call(&self, plugin: &str, method: &str, arguments: Value, confirmed: bool)
        -> Result<Value, TypedError>
    {
        let schema = self.namespace.schema(plugin)
            .map_err(|_| TypedError::new(ErrorKind::Schema, "mounted plugin declaration"))?;
        let declaration = schema.methods.get(method)
            .ok_or_else(|| TypedError::new(ErrorKind::Denial, "operation not offered"))?;
        let capability = declaration.required_capability.clone();
        let bytes = serde_json::to_vec(&arguments)
            .map_err(|_| TypedError::new(ErrorKind::Validation, "operation arguments"))?;
        let namespace = self.namespace.clone();
        let expected = self.identity.clone();
        if !self.guard.check_item(&bytes).is_clean() {
            return Err(TypedError::new(ErrorKind::Denial, "credential-bearing operation arguments"));
        }
        let plugin = plugin.to_owned();
        let method = method.to_owned();
        let task = tokio::task::spawn_blocking(move || {
            let identity = invoke(&namespace, "identity_sled", "get_own_identity", json!({}), false)?;
            let actual = &identity["result"]["result"];
            if actual["principal_id"] != expected.principal_id
                || actual["identity"]["session_id"] != expected.session_id
                || actual["identity"]["genesis"] != expected.genesis {
                return Err(TypedError::new(ErrorKind::Denial, "mounted identity changed"));
            }
            if let Some(capability) = capability.as_deref() {
                let current = actual["held_capabilities"].as_array()
                    .ok_or_else(|| TypedError::new(ErrorKind::Schema, "held capabilities"))?;
                if !current.iter().any(|held| held.as_str() == Some(capability)) {
                    return Err(TypedError::new(ErrorKind::Denial, "operation capability"));
                }
            }
            invoke(&namespace, &plugin, &method, arguments, confirmed)
        });
        // A timed-out kernel operation may still finish. Never cancel/replay its
        // write and never emit a completed status without its actual receipt.
        tokio::time::timeout(Duration::from_secs(60), task).await
            .map_err(|_| TypedError::new(ErrorKind::UnknownOutcome, "mounted operation deadline"))?
            .map_err(|_| TypedError::new(ErrorKind::UnknownOutcome, "mounted operation task"))?
    }

    pub fn guard(&self) -> &SecretGuard { &self.guard }
}

fn invoke(namespace: &MountedNamespace, plugin: &str, method: &str, arguments: Value, confirmed: bool)
    -> Result<Value, TypedError>
{
    namespace.invoke(&format!("plugins/{}/operations/{}/call", encode_component(plugin), encode_component(method)), arguments, confirmed)
        .map_err(|_| TypedError::new(ErrorKind::UnknownOutcome, "mounted operation receipt"))
}
