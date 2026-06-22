use serde::{Deserialize, Serialize};

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

pub struct Publisher {
    jetstream: async_nats::jetstream::Context,
}

impl Publisher {
    pub async fn connect() -> Result<Self, async_nats::Error> {
        let client = async_nats::connect("nats://localhost:4222").await?;
        let jetstream = async_nats::jetstream::new(client);

        jetstream
            .get_or_create_stream(async_nats::jetstream::stream::Config {
                name: "JOBS".to_string(),
                subjects: vec!["jobs".to_string()],
                ..Default::default()
            })
            .await?;

        Ok(Self { jetstream })
    }

    pub async fn publish(&self, job: &Job) -> Result<(), async_nats::Error> {
        let payload = serde_json::to_vec(job).unwrap();
        self.jetstream.publish("jobs", payload.into()).await?.await?;
        Ok(())
    }
}
