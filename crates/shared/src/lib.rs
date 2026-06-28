use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct JobEnvelope {
    pub id: String,
    pub job: Job,
}

impl JobEnvelope {
    pub fn new(job: Job) -> Self {
        Self {
            id: ulid::Ulid::new().to_string(),
            job,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub enum Job {
    CutVideo(CutVideo),
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CutVideo {
    pub input: String,
    pub output: String,
    pub start_secs: f64,
    pub end_secs: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum JobStatus {
    Received,
    Processing { percent: f64 },
    Done,
    Failed { reason: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatusEvent {
    pub id: String,
    pub status: JobStatus,
}

pub const STATUS_SUBJECT: &str = "jobs.status";

pub async fn publish_status(
    client: &async_nats::Client,
    event: &StatusEvent,
) -> Result<(), async_nats::Error> {
    let payload = serde_json::to_vec(event)?;
    client.publish(STATUS_SUBJECT, payload.into()).await?;
    Ok(())
}

pub struct Publisher {
    client: async_nats::Client,
    jetstream: async_nats::jetstream::Context,
}

impl Publisher {
    pub async fn connect() -> Result<Self, async_nats::Error> {
        let client = async_nats::connect("nats://localhost:4222").await?;
        let jetstream = async_nats::jetstream::new(client.clone());

        jetstream
            .get_or_create_stream(async_nats::jetstream::stream::Config {
                name: "JOBS".to_string(),
                subjects: vec!["jobs".to_string()],
                ..Default::default()
            })
            .await?;

        Ok(Self { client, jetstream })
    }

    pub fn client(&self) -> &async_nats::Client {
        &self.client
    }

    pub async fn publish(&self, job: &JobEnvelope) -> Result<(), async_nats::Error> {
        let payload = serde_json::to_vec(job).unwrap();
        self.jetstream
            .publish("jobs", payload.into())
            .await?
            .await?;
        Ok(())
    }
}
