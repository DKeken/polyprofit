use std::sync::Arc;
use std::time::Duration;
use thiserror::Error;
use tokio::sync::mpsc;
use tokio::task::JoinHandle;
use tracing::{debug, error, info, instrument, warn};

#[derive(Error, Debug)]
pub enum JobError {
    #[error("Job failed: {0}")]
    Failed(String),
    #[error("Rate limited")]
    RateLimited,
}

pub type JobResult = std::result::Result<(), JobError>;

/// Options for configuring a job execution (similar to BullMQ).
#[derive(Debug, Clone)]
pub struct JobOptions {
    pub max_retries: u32,
    pub retry_delay: Duration,
    pub timeout: Duration,
}

impl Default for JobOptions {
    fn default() -> Self {
        Self {
            max_retries: 3,
            retry_delay: Duration::from_secs(2),
            timeout: Duration::from_secs(30),
        }
    }
}

/// A trait that defines a job handler, analog to a BullMQ worker processor.
pub trait JobHandler: Send + Sync + 'static {
    type Payload: Send + Sync + 'static + std::fmt::Debug + Clone;

    /// The name of the queue/job type for logging/metrics.
    fn name(&self) -> &'static str;

    /// Process a single job payload.
    fn process(
        &self,
        payload: Self::Payload,
    ) -> impl std::future::Future<Output = JobResult> + Send;

    /// Called when a job fails after all retries.
    fn on_failed(
        &self,
        payload: &Self::Payload,
        error: &JobError,
    ) -> impl std::future::Future<Output = ()> + Send {
        async move {
            error!(job = self.name(), ?payload, %error, "Job failed after retries");
        }
    }
}

/// A lightweight, in-memory job queue inspired by BullMQ with retries, concurrency, and graceful shutdown.
#[derive(Debug)]
pub struct JobQueue<H: JobHandler> {
    sender: mpsc::Sender<H::Payload>,
    _workers: Vec<JoinHandle<()>>,
}

impl<H: JobHandler> JobQueue<H> {
    /// Create and start a new job queue worker pool.
    pub fn start(
        handler: Arc<H>,
        concurrency: usize,
        queue_capacity: usize,
        options: JobOptions,
        shutdown: tokio_util::sync::CancellationToken,
    ) -> Self {
        let (sender, receiver) = mpsc::channel::<H::Payload>(queue_capacity);
        let mut workers = Vec::with_capacity(concurrency);

        info!(
            job = handler.name(),
            concurrency, "Starting job queue workers"
        );

        let receiver = Arc::new(tokio::sync::Mutex::new(receiver));

        for i in 0..concurrency {
            let handler_clone = handler.clone();
            let rx_clone = receiver.clone();
            let shutdown_clone = shutdown.clone();
            let opts = options.clone();

            let worker = tokio::spawn(async move {
                debug!(job = handler_clone.name(), worker_id = i, "Worker ready");

                loop {
                    let payload_opt = tokio::select! {
                        _ = shutdown_clone.cancelled() => {
                            debug!(job = handler_clone.name(), worker_id = i, "Worker shutting down");
                            break;
                        }
                        // Lock just to get the next item
                        msg = async {
                            let mut rx = rx_clone.lock().await;
                            rx.recv().await
                        } => msg,
                    };

                    match payload_opt {
                        Some(payload) => {
                            Self::process_with_retries(handler_clone.as_ref(), payload, &opts)
                                .await;
                        }
                        None => {
                            // Queue closed
                            break;
                        }
                    }
                }
            });

            workers.push(worker);
        }

        Self { sender, _workers: workers }
    }

    /// Submit a new job to the queue.
    pub async fn add(&self, payload: H::Payload) -> Result<(), mpsc::error::SendError<H::Payload>> {
        self.sender.send(payload).await
    }

    #[instrument(skip(handler, payload, opts), fields(job = handler.name()))]
    async fn process_with_retries(handler: &H, payload: H::Payload, opts: &JobOptions) {
        let mut attempt = 0;
        loop {
            attempt += 1;

            let process_future = handler.process(payload.clone());
            // Wait for completion or timeout
            let result = tokio::time::timeout(opts.timeout, process_future).await;

            match result {
                Ok(Ok(())) => {
                    // Success!
                    return;
                }
                Ok(Err(e)) => {
                    // Failed by returning JobError
                    if attempt > opts.max_retries {
                        handler.on_failed(&payload, &e).await;
                        return;
                    }
                    warn!(
                        job = handler.name(),
                        attempt,
                        max_retries = opts.max_retries,
                        error = %e,
                        "Job failed, retrying"
                    );
                }
                Err(_) => {
                    // Timeout
                    let e = JobError::Failed("Job timed out".into());
                    if attempt > opts.max_retries {
                        handler.on_failed(&payload, &e).await;
                        return;
                    }
                    warn!(
                        job = handler.name(),
                        attempt,
                        max_retries = opts.max_retries,
                        "Job timed out, retrying"
                    );
                }
            }

            // Sleep before retry
            tokio::time::sleep(opts.retry_delay).await;
        }
    }
}

// dynamic job
impl std::fmt::Debug for DynJob {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "DynJob")
    }
}
pub struct DynJob {
    pub name: &'static str,
    pub func: std::sync::Arc<
        dyn Fn(String) -> std::pin::Pin<Box<dyn std::future::Future<Output = JobResult> + Send>>
            + Send
            + Sync,
    >,
}
impl JobHandler for DynJob {
    type Payload = String;
    fn name(&self) -> &'static str {
        self.name
    }
    fn process(
        &self,
        payload: Self::Payload,
    ) -> impl std::future::Future<Output = JobResult> + Send {
        (self.func)(payload)
    }
}
