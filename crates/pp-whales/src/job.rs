use crate::{DataApiClient, run_poll_cycle};
use pp_core::{
    AppState,
    jobs::{JobError, JobHandler, JobResult},
};
use std::sync::Arc;

pub struct WhalePollJob {
    pub state: Arc<AppState>,
    pub client: DataApiClient,
}

impl JobHandler for WhalePollJob {
    type Payload = String;

    fn name(&self) -> &'static str {
        "whale_poll"
    }

    fn process(
        &self,
        payload: Self::Payload,
    ) -> impl std::future::Future<Output = JobResult> + Send {
        let state_clone = self.state.clone();
        // dataapiclient needs to be passed, but the borrow checker is picky, so let's just make a new one inside
        async move {
            tracing::info!(%payload, "Starting whale poll job");
            let client = DataApiClient::new();
            match run_poll_cycle(&client, &state_clone).await {
                Ok(_) => {
                    tracing::info!("Whale poll job completed successfully");
                    Ok(())
                }
                Err(e) => Err(JobError::Failed(e.to_string())),
            }
        }
    }
}
