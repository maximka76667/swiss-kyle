use shared::{CutVideo, Job, Publisher};

#[tokio::main]
async fn main() -> Result<(), async_nats::Error> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 6 {
        eprintln!("Usage: publisher -- cut <input> <output> <start_secs> <end_secs>");
        return Ok(());
    }

    let job = match args[1].as_str() {
        "cut" => Job::CutVideo(CutVideo {
            input: format!("videos/{}", args[2]),
            output: format!("videos/{}", args[3]),
            start_secs: args[4].parse().expect("start_secs must be a number"),
            end_secs: args[5].parse().expect("end_secs must be a number"),
        }),
        cmd => {
            eprintln!("Unknown command: {}", cmd);
            return Ok(());
        }
    };

    let publisher = Publisher::connect().await?;
    publisher.publish(&job).await?;
    println!("Published: {:?}", job);

    Ok(())
}
